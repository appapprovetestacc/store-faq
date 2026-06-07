import type { AppLoadContext } from "@remix-run/cloudflare";
import {
  type Plan,
  type RecurringPlan,
  type UsagePlan,
  findPlan,
  getPricing,
  isFreePlan,
  isRecurringPlan,
  isUsagePlan,
} from "./pricing.server";
import { loadOfflineSession } from "./session-storage.server";
import { LATEST_API_VERSION } from "./shopify.server";
import { effectiveTrialDays, getFirstInstallAt } from "./trial.server";

const SHOP_CURRENCY_QUERY = `
query shopCurrency {
  shop { currencyCode }
}
`;

// Shopify recurring charges must be denominated in the SHOP's currency,
// not whatever pricing.yaml hard-codes (USD by default). We query the
// shop once per charge — light call, no caching needed for billing flows.
// Falls back to pricing.yaml's currency on lookup failure so a transient
// outage doesn't block paying customers.
async function resolveShopCurrency(
  shop: string,
  accessToken: string,
  fallback: string,
): Promise<string> {
  try {
    const data = await gql<{ shop: { currencyCode: string } }>({
      shop,
      accessToken,
      query: SHOP_CURRENCY_QUERY,
    });
    return data.shop.currencyCode || fallback;
  } catch (err) {
    console.warn("[billing] shop currency lookup failed; falling back", err);
    return fallback;
  }
}

// Shopify Billing API helpers via GraphQL Admin API. We hit the Shopify
// store directly (not via the embedded admin proxy) so the same code
// works for both online and offline session contexts.

interface GraphQLOk<T> {
  data: T;
  errors?: undefined;
}
interface GraphQLErr {
  data: null;
  errors: Array<{ message: string }>;
}

async function gql<T>(input: {
  shop: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const res = await fetch(
    `https://${input.shop}/admin/api/${LATEST_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": input.accessToken,
      },
      body: JSON.stringify({
        query: input.query,
        variables: input.variables ?? {},
      }),
    },
  );
  if (!res.ok) throw new Error(`Shopify GraphQL HTTP ${res.status}`);
  const json = (await res.json()) as GraphQLOk<T> | GraphQLErr;
  if (json.errors)
    throw new Error(
      json.errors.map((e) => e.message).join("; ") || "GraphQL error",
    );
  return json.data;
}

const RECURRING_CREATE = `
mutation appSubscriptionCreate(
  $name: String!
  $returnUrl: URL!
  $test: Boolean
  $trialDays: Int
  $lineItems: [AppSubscriptionLineItemInput!]!
) {
  appSubscriptionCreate(
    name: $name
    returnUrl: $returnUrl
    test: $test
    trialDays: $trialDays
    lineItems: $lineItems
  ) {
    confirmationUrl
    appSubscription { id status }
    userErrors { field message }
  }
}
`;

const ONE_TIME_CREATE = `
mutation appPurchaseOneTimeCreate(
  $name: String!
  $price: MoneyInput!
  $returnUrl: URL!
  $test: Boolean
) {
  appPurchaseOneTimeCreate(
    name: $name
    price: $price
    returnUrl: $returnUrl
    test: $test
  ) {
    confirmationUrl
    appPurchaseOneTime { id status }
    userErrors { field message }
  }
}
`;

const SUB_CANCEL = `
mutation appSubscriptionCancel($id: ID!) {
  appSubscriptionCancel(id: $id) {
    appSubscription { id status }
    userErrors { field message }
  }
}
`;

const ACTIVE_SUBSCRIPTIONS = `
query activeSubscriptions {
  currentAppInstallation {
    activeSubscriptions {
      id
      name
      status
      createdAt
      currentPeriodEnd
      trialDays
      test
      lineItems {
        plan {
          pricingDetails {
            __typename
            ... on AppRecurringPricing {
              price { amount currencyCode }
              interval
            }
            ... on AppUsagePricing {
              cappedAmount { amount currencyCode }
              terms
            }
          }
        }
      }
    }
  }
}
`;

interface CurrentAppInstallationPayload {
  currentAppInstallation: {
    activeSubscriptions: Array<{
      id: string;
      name: string;
      status: string;
      createdAt: string;
      currentPeriodEnd: string | null;
      trialDays: number | null;
      test: boolean;
    }>;
  };
}

export async function listActiveSubscriptions(
  context: AppLoadContext,
  shop: string,
): Promise<CurrentAppInstallationPayload["currentAppInstallation"]["activeSubscriptions"]> {
  const session = await loadOfflineSession(context, shop);
  if (!session) throw new Error(`No offline session for ${shop}`);
  const data = await gql<CurrentAppInstallationPayload>({
    shop,
    accessToken: session.accessToken,
    query: ACTIVE_SUBSCRIPTIONS,
  });
  return data.currentAppInstallation.activeSubscriptions;
}

export interface CreateChargeResult {
  confirmationUrl: string;
}

export async function createChargeForPlan(input: {
  context: AppLoadContext;
  shop: string;
  planName: string;
  returnUrl: string;
  test?: boolean;
}): Promise<CreateChargeResult> {
  const plan = findPlan(input.planName);
  if (!plan) throw new Error(`Unknown plan: ${input.planName}`);
  if (isFreePlan(plan)) {
    return { confirmationUrl: input.returnUrl };
  }
  const session = await loadOfflineSession(input.context, input.shop);
  if (!session) throw new Error(`No offline session for ${input.shop}`);
  const test = input.test ?? false;
  const fallbackCurrency = getPricing().currency || "USD";
  const currency = await resolveShopCurrency(
    input.shop,
    session.accessToken,
    fallbackCurrency,
  );

  if (isRecurringPlan(plan)) {
    // Compensate the configured trial against any prior install of this
    // shop — uninstall+reinstall must NOT reset the trial window.
    const firstInstallAt = await getFirstInstallAt(input.context, input.shop);
    const trialDays = effectiveTrialDays({
      configured: plan.trial_days ?? 0,
      firstInstallAt,
    });
    return createRecurring({
      shop: input.shop,
      accessToken: session.accessToken,
      plan,
      currency,
      returnUrl: input.returnUrl,
      test,
      trialDays,
    });
  }
  if (isUsagePlan(plan)) {
    return createUsage({
      shop: input.shop,
      accessToken: session.accessToken,
      plan,
      currency,
      returnUrl: input.returnUrl,
      test,
    });
  }
  // One-time
  if ("one_time" in plan && plan.one_time) {
    const data = await gql<{
      appPurchaseOneTimeCreate: {
        confirmationUrl: string;
        userErrors: Array<{ message: string }>;
      };
    }>({
      shop: input.shop,
      accessToken: session.accessToken,
      query: ONE_TIME_CREATE,
      variables: {
        name: plan.name,
        price: { amount: plan.price.toString(), currencyCode: currency },
        returnUrl: input.returnUrl,
        test,
      },
    });
    if (data.appPurchaseOneTimeCreate.userErrors.length > 0) {
      throw new Error(
        data.appPurchaseOneTimeCreate.userErrors
          .map((e) => e.message)
          .join("; "),
      );
    }
    return { confirmationUrl: data.appPurchaseOneTimeCreate.confirmationUrl };
  }
  throw new Error(`Unhandled plan shape for ${input.planName}`);
}

async function createRecurring(input: {
  shop: string;
  accessToken: string;
  plan: RecurringPlan;
  currency: string;
  returnUrl: string;
  test: boolean;
  trialDays: number;
}): Promise<CreateChargeResult> {
  const intervalEnum = input.plan.interval === "annual" ? "ANNUAL" : "EVERY_30_DAYS";
  const data = await gql<{
    appSubscriptionCreate: {
      confirmationUrl: string;
      userErrors: Array<{ message: string }>;
    };
  }>({
    shop: input.shop,
    accessToken: input.accessToken,
    query: RECURRING_CREATE,
    variables: {
      name: input.plan.name,
      returnUrl: input.returnUrl,
      test: input.test,
      trialDays: input.trialDays,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount: input.plan.price.toString(),
                currencyCode: input.currency,
              },
              interval: intervalEnum,
            },
          },
        },
      ],
    },
  });
  if (data.appSubscriptionCreate.userErrors.length > 0) {
    throw new Error(
      data.appSubscriptionCreate.userErrors
        .map((e) => e.message)
        .join("; "),
    );
  }
  return { confirmationUrl: data.appSubscriptionCreate.confirmationUrl };
}

async function createUsage(input: {
  shop: string;
  accessToken: string;
  plan: UsagePlan;
  currency: string;
  returnUrl: string;
  test: boolean;
}): Promise<CreateChargeResult> {
  const data = await gql<{
    appSubscriptionCreate: {
      confirmationUrl: string;
      userErrors: Array<{ message: string }>;
    };
  }>({
    shop: input.shop,
    accessToken: input.accessToken,
    query: RECURRING_CREATE,
    variables: {
      name: input.plan.name,
      returnUrl: input.returnUrl,
      test: input.test,
      trialDays: 0,
      lineItems: [
        {
          plan: {
            appUsagePricingDetails: {
              terms: `${input.plan.rate_per_event} per event`,
              cappedAmount: {
                amount: (input.plan.capped_amount ?? 1000).toString(),
                currencyCode: input.currency,
              },
            },
          },
        },
      ],
    },
  });
  if (data.appSubscriptionCreate.userErrors.length > 0) {
    throw new Error(
      data.appSubscriptionCreate.userErrors
        .map((e) => e.message)
        .join("; "),
    );
  }
  return { confirmationUrl: data.appSubscriptionCreate.confirmationUrl };
}

export async function cancelSubscription(
  context: AppLoadContext,
  shop: string,
  subscriptionId: string,
): Promise<void> {
  const session = await loadOfflineSession(context, shop);
  if (!session) throw new Error(`No offline session for ${shop}`);
  const data = await gql<{
    appSubscriptionCancel: {
      userErrors: Array<{ message: string }>;
    };
  }>({
    shop,
    accessToken: session.accessToken,
    query: SUB_CANCEL,
    variables: { id: subscriptionId },
  });
  if (data.appSubscriptionCancel.userErrors.length > 0) {
    throw new Error(
      data.appSubscriptionCancel.userErrors.map((e) => e.message).join("; "),
    );
  }
}

export type { Plan };
