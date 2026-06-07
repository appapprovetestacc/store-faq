// Phase 7 E1 — preview-mode mock fixtures. Returned by the GraphQL
// client short-circuit in shopify-api.server.ts when the app is
// running in preview mode (env.PREVIEW_MODE === "1" AND session shop
// = appapprove-preview.myshopify.com). Never used in production —
// the prod Worker is built without PREVIEW_MODE so the short-circuit
// is unreachable.

export const PREVIEW_SHOP_DOMAIN = "appapprove-preview.myshopify.com";

// Map of GraphQL operation-name (lowercased, fuzzy-matched against the
// query body) to a canned response. The matcher in shopify-api.server.ts
// extracts the query name + checks against these patterns. Anything
// unmatched falls through to {} so the route's destructure doesn't
// blow up — typical AI-generated routes will see empty lists rather
// than runtime errors.

export interface PreviewFixtureMatcher {
  // Substring (case-insensitive) the matcher looks for in the query
  // body. First match wins. Order matters — put more-specific patterns
  // first.
  pattern: string;
  data: unknown;
}

export const PREVIEW_FIXTURES: PreviewFixtureMatcher[] = [
  // shop info — most apps query this on dashboard load
  {
    pattern: "shop {",
    data: {
      shop: {
        id: "gid://shopify/Shop/1",
        name: "AppApprove Preview Store",
        myshopifyDomain: PREVIEW_SHOP_DOMAIN,
        primaryDomain: { url: "https://" + PREVIEW_SHOP_DOMAIN, host: PREVIEW_SHOP_DOMAIN },
        email: "preview@example.com",
        currencyCode: "USD",
        ianaTimezone: "America/New_York",
        plan: { displayName: "Development", partnerDevelopment: true },
      },
    },
  },
  // products — most-common list query
  {
    pattern: "products(",
    data: {
      products: {
        edges: [
          fakeProductEdge("p1", "Subscription Box (Monthly)", "29.99", "active"),
          fakeProductEdge("p2", "Premium Coffee Beans · 1lb", "18.50", "active"),
          fakeProductEdge("p3", "Sustainable Cotton Tee", "32.00", "active"),
          fakeProductEdge("p4", "Limited Edition Mug", "14.99", "draft"),
          fakeProductEdge("p5", "Gift Card · $50", "50.00", "active"),
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  },
  // orders — most-common list query
  {
    pattern: "orders(",
    data: {
      orders: {
        edges: [
          fakeOrderEdge("o1", "#1042", "FULFILLED", "PAID", "78.99"),
          fakeOrderEdge("o2", "#1041", "UNFULFILLED", "PAID", "32.00"),
          fakeOrderEdge("o3", "#1040", "FULFILLED", "REFUNDED", "29.99"),
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  },
  // customers
  {
    pattern: "customers(",
    data: {
      customers: {
        edges: [
          fakeCustomerEdge("c1", "Jane", "Cooper", "jane@example.com", 5, "245.00"),
          fakeCustomerEdge("c2", "Wade", "Warren", "wade@example.com", 3, "180.50"),
          fakeCustomerEdge("c3", "Esther", "Howard", "esther@example.com", 12, "892.99"),
          fakeCustomerEdge("c4", "Cameron", "Williamson", "cameron@example.com", 1, "32.00"),
          fakeCustomerEdge("c5", "Brooklyn", "Simmons", "brooklyn@example.com", 7, "412.50"),
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  },
  // abandoned checkouts
  {
    pattern: "abandonedCheckouts(",
    data: {
      abandonedCheckouts: {
        edges: [
          {
            node: {
              id: "gid://shopify/AbandonedCheckout/1",
              abandonedCheckoutUrl: "https://" + PREVIEW_SHOP_DOMAIN + "/checkout/preview-1",
              totalPriceSet: money("18.50", "USD"),
              customer: { firstName: "Jane", lastName: "Cooper", email: "jane@example.com" },
              lineItems: { edges: [] },
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  },
  // single-product fetch by id
  {
    pattern: "product(",
    data: {
      product: fakeProductEdge("p1", "Subscription Box (Monthly)", "29.99", "active").node,
    },
  },
  // app subscription / billing query
  {
    pattern: "currentAppInstallation",
    data: {
      currentAppInstallation: {
        id: "gid://shopify/AppInstallation/1",
        activeSubscriptions: [],
        userErrors: [],
      },
    },
  },
];

function fakeProductEdge(
  id: string,
  title: string,
  price: string,
  status: "active" | "draft" | "archived",
) {
  return {
    cursor: id,
    node: {
      id: "gid://shopify/Product/" + id,
      title,
      handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      status: status.toUpperCase(),
      featuredImage: {
        url: "https://placehold.co/400x400/eee/777?text=" + encodeURIComponent(title.split(" ")[0] ?? ""),
        altText: title,
      },
      priceRangeV2: {
        minVariantPrice: money(price, "USD"),
        maxVariantPrice: money(price, "USD"),
      },
      totalInventory: 42,
      vendor: "AppApprove Preview Vendor",
      productType: "Preview",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    },
  };
}

function fakeOrderEdge(
  id: string,
  name: string,
  fulfillmentStatus: string,
  financialStatus: string,
  total: string,
) {
  return {
    cursor: id,
    node: {
      id: "gid://shopify/Order/" + id,
      name,
      displayFinancialStatus: financialStatus,
      displayFulfillmentStatus: fulfillmentStatus,
      totalPriceSet: money(total, "USD"),
      subtotalPriceSet: money(total, "USD"),
      currencyCode: "USD",
      customer: {
        firstName: "Preview",
        lastName: "Customer",
        email: "preview@example.com",
      },
      createdAt: "2026-04-15T12:00:00Z",
      processedAt: "2026-04-15T12:01:00Z",
    },
  };
}

function fakeCustomerEdge(
  id: string,
  firstName: string,
  lastName: string,
  email: string,
  ordersCount: number,
  totalSpent: string,
) {
  return {
    cursor: id,
    node: {
      id: "gid://shopify/Customer/" + id,
      firstName,
      lastName,
      email,
      numberOfOrders: ordersCount,
      amountSpent: money(totalSpent, "USD"),
      createdAt: "2025-09-01T00:00:00Z",
      updatedAt: "2026-04-15T00:00:00Z",
      tags: [],
    },
  };
}

function money(amount: string, currencyCode: string) {
  return {
    shopMoney: { amount, currencyCode },
    presentmentMoney: { amount, currencyCode },
    amount,
    currencyCode,
  };
}

// Match a query body against the fixture map. Used by shopifyAdmin's
// preview-mode short-circuit in shopify-api.server.ts. Falls through
// to {} on no match — routes get an empty response rather than an
// error so the page still renders.
export function matchPreviewFixture<T = unknown>(query: string): T {
  const haystack = query.toLowerCase();
  for (const fixture of PREVIEW_FIXTURES) {
    if (haystack.includes(fixture.pattern.toLowerCase())) {
      return fixture.data as T;
    }
  }
  return {} as T;
}
