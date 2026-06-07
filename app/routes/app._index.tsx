import {
  json,
  type ActionFunctionArgs,
  type LinksFunction,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  AppProvider,
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  EmptyState,
  FormLayout,
  InlineGrid,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import type { Env } from "../../load-context";
import { authenticate } from "~/lib/shopify.server";
import { shopifyAdmin } from "~/lib/shopify-api.server";
import { captureSetupStep } from "~/lib/merchant-qa.server";
import { resolveAdminLoader } from "~/lib/admin-loader.server";
import {
  createFaqEntryFromForm,
  getFaqSettings,
  isFaqStoragePersistent,
  listFaqEntries,
  previewFaqEntries,
  saveFaqSettingsFromForm,
  DEFAULT_FAQ_SETTINGS,
  type FaqEntry,
} from "~/lib/faq-storage.server";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

interface ShopOverview {
  name: string;
  plan: string;
  productCount: number | null;
}

// Status overview data. read_products is the app's only scope, so we use
// productsCount to both populate the overview AND prove the scope works.
// All Admin API access goes through the shopifyAdmin() wrapper per the
// project convention (never a raw fetch against the shop domain).
async function loadShopOverview(
  env: Env,
  session: { accessToken: string; scope: string; shop: string; storedAt: number },
  shop: string,
  preview: boolean,
): Promise<ShopOverview> {
  const api = shopifyAdmin({ env, session, shop });
  const overview: ShopOverview = {
    name: shop,
    plan: "—",
    productCount: null,
  };
  try {
    const data = await api.graphql<{
      shop?: { name?: string; plan?: { displayName?: string } };
    }>(`{ shop { name plan { displayName } } }`);
    if (data.shop?.name) overview.name = data.shop.name;
    if (data.shop?.plan?.displayName) overview.plan = data.shop.plan.displayName;
  } catch {
    // captureApiError already fired inside the wrapper; render with the
    // shop domain as a graceful fallback rather than a broken page.
  }
  try {
    const counts = await api.graphql<{ productsCount?: { count?: number } }>(
      `{ productsCount { count } }`,
    );
    overview.productCount = counts.productsCount?.count ?? (preview ? 5 : null);
  } catch {
    overview.productCount = preview ? 5 : null;
  }
  return overview;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env, shop, session, host, preview } = await resolveAdminLoader(
    request,
    context,
  );

  const overview = await loadShopOverview(env, session, shop, preview);
  const entries = preview
    ? previewFaqEntries()
    : await listFaqEntries(context, shop);
  const settings = preview
    ? DEFAULT_FAQ_SETTINGS
    : await getFaqSettings(context, shop);

  return json({
    apiKey: env.SHOPIFY_API_KEY ?? "",
    shop,
    host,
    overview,
    settings,
    entries: entries.map(toEntryView),
    storagePersistent: preview ? true : isFaqStoragePersistent(context),
    // Preserve embedded query params so in-app links keep shop/host/preview.
    search: new URL(request.url).search,
  });
}

function toEntryView(entry: FaqEntry) {
  return {
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    // Format server-side to a stable string so SSR + hydration match.
    createdAtLabel: new Date(entry.createdAt).toISOString().slice(0, 10),
  };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: "Store FAQ" },
  // App Bridge boots from this meta tag (rendered above the CDN script in
  // root.tsx). Required for any embedded admin route.
  { name: "shopify-api-key", content: data?.apiKey ?? "" },
];

type ActionResult =
  | { ok: true; intent: "create-faq" | "save-settings" }
  | { ok: false; intent: "create-faq" | "save-settings"; error: string };

export async function action({ request, context }: ActionFunctionArgs) {
  // Form submits arrive as App-Bridge-authenticated client fetches that
  // carry the session-token JWT, so authenticate.admin() is correct here
  // (NOT in the loader). See CLAUDE.md.
  const { shop } = await authenticate.admin(request, context);
  const env = (context.cloudflare?.env ?? {}) as Env;
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "");

  if (intent === "create-faq") {
    const result = await createFaqEntryFromForm(context, shop, formData);
    if (!result.ok) {
      return json<ActionResult>(
        { ok: false, intent, error: result.error },
        { status: 400 },
      );
    }
    await captureSetupStep(env, "faq_entry_created", {
      total: String(result.value.total),
    });
    return json<ActionResult>({ ok: true, intent });
  }

  if (intent === "save-settings") {
    const result = await saveFaqSettingsFromForm(context, shop, formData);
    if (!result.ok) {
      return json<ActionResult>(
        { ok: false, intent: "save-settings", error: result.error },
        { status: 400 },
      );
    }
    await captureSetupStep(env, "faq_settings_saved", {});
    return json<ActionResult>({ ok: true, intent: "save-settings" });
  }

  return json<ActionResult>(
    { ok: false, intent: "create-faq", error: "Unknown action." },
    { status: 400 },
  );
}

export default function StoreFaqDashboard() {
  const { overview, settings, entries, storagePersistent, search } =
    useLoaderData<typeof loader>();

  return (
    <AppProvider i18n={enTranslations}>
      <Page
        title="Store FAQ"
        subtitle="Create and manage the FAQ entries shown on your store."
        secondaryActions={[{ content: "Settings", url: `/settings${search}` }]}
      >
        <Layout>
          <Layout.Section>
            <StatusOverviewCard
              overview={overview}
              faqCount={entries.length}
              storagePersistent={storagePersistent}
            />
          </Layout.Section>

          <Layout.Section>
            <CreateFaqCard />
          </Layout.Section>

          <Layout.Section>
            <FaqListCard heading={settings.pageHeading} entries={entries} />
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <SettingsCard pageHeading={settings.pageHeading} />
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}

function StatusOverviewCard({
  overview,
  faqCount,
  storagePersistent,
}: {
  overview: ShopOverview;
  faqCount: number;
  storagePersistent: boolean;
}) {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Status overview
        </Text>
        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
          <StatusItem label="Store" value={overview.name}>
            <Badge tone="success">Connected</Badge>
          </StatusItem>
          <StatusItem label="Plan" value={overview.plan} />
          <StatusItem
            label="Products"
            value={
              overview.productCount === null
                ? "Unavailable"
                : `${overview.productCount}`
            }
          >
            <Badge tone={overview.productCount === null ? "warning" : "success"}>
              {overview.productCount === null
                ? "read_products"
                : "read_products active"}
            </Badge>
          </StatusItem>
          <StatusItem label="FAQ entries" value={`${faqCount}`} />
          <StatusItem
            label="Data storage"
            value={storagePersistent ? "Cloudflare KV" : "In-memory (dev)"}
          >
            <Badge tone={storagePersistent ? "success" : "attention"}>
              {storagePersistent ? "Persistent" : "Not persistent"}
            </Badge>
          </StatusItem>
        </InlineGrid>
      </BlockStack>
    </Card>
  );
}

function StatusItem({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <Box
      background="bg-surface-secondary"
      padding="400"
      borderRadius="200"
      minHeight="100%"
    >
      <BlockStack gap="100">
        <Text as="span" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="span" variant="headingSm" fontWeight="semibold">
          {value}
        </Text>
        {children ? <Box paddingBlockStart="100">{children}</Box> : null}
      </BlockStack>
    </Box>
  );
}

function CreateFaqCard() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const submitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("_intent") === "create-faq";
  const error =
    actionData && !actionData.ok && actionData.intent === "create-faq"
      ? actionData.error
      : null;
  const created =
    actionData && actionData.ok && actionData.intent === "create-faq";

  // Clear the inputs once an entry is saved.
  useEffect(() => {
    if (created) {
      setQuestion("");
      setAnswer("");
    }
  }, [created]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Add a FAQ entry
        </Text>
        {error ? (
          <Banner tone="critical" title="Could not save entry">
            <p>{error}</p>
          </Banner>
        ) : null}
        {created ? (
          <Banner tone="success" title="FAQ entry added" />
        ) : null}
        <Form method="post">
          {/* Polaris TextField is controlled; hidden inputs guarantee the
              values reach the action regardless of name forwarding. */}
          <input type="hidden" name="_intent" value="create-faq" />
          <input type="hidden" name="question" value={question} />
          <input type="hidden" name="answer" value={answer} />
          <FormLayout>
            <TextField
              label="Question"
              value={question}
              onChange={setQuestion}
              autoComplete="off"
              maxLength={250}
              placeholder="e.g. How long does shipping take?"
              requiredIndicator
            />
            <TextField
              label="Answer"
              value={answer}
              onChange={setAnswer}
              autoComplete="off"
              multiline={4}
              maxLength={2000}
              placeholder="Write the answer your customers will see."
              requiredIndicator
            />
            <Button
              submit
              variant="primary"
              loading={submitting}
              disabled={!question.trim() || !answer.trim()}
            >
              Add FAQ entry
            </Button>
          </FormLayout>
        </Form>
      </BlockStack>
    </Card>
  );
}

function FaqListCard({
  heading,
  entries,
}: {
  heading: string;
  entries: Array<{
    id: string;
    question: string;
    answer: string;
    createdAtLabel: string;
  }>;
}) {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          {heading}
        </Text>
        {entries.length === 0 ? (
          <EmptyState
            heading="No FAQ entries yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Add your first entry above to start building your store FAQ.</p>
          </EmptyState>
        ) : (
          <BlockStack gap="300">
            {entries.map((entry, index) => (
              <BlockStack key={entry.id} gap="300">
                {index > 0 ? <Divider /> : null}
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    {entry.question}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {entry.answer}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Added {entry.createdAtLabel}
                  </Text>
                </BlockStack>
              </BlockStack>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

function SettingsCard({ pageHeading }: { pageHeading: string }) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [heading, setHeading] = useState(pageHeading);

  const submitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("_intent") === "save-settings";
  const error =
    actionData && !actionData.ok && actionData.intent === "save-settings"
      ? actionData.error
      : null;
  const saved =
    actionData && actionData.ok && actionData.intent === "save-settings";

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Settings
        </Text>
        {error ? (
          <Banner tone="critical" title="Could not save settings">
            <p>{error}</p>
          </Banner>
        ) : null}
        {saved ? <Banner tone="success" title="Settings saved" /> : null}
        <Form method="post">
          <input type="hidden" name="_intent" value="save-settings" />
          <input type="hidden" name="pageHeading" value={heading} />
          <FormLayout>
            <TextField
              label="FAQ section heading"
              value={heading}
              onChange={setHeading}
              autoComplete="off"
              maxLength={120}
              helpText="Shown as the title above your list of FAQ entries."
            />
            <Button
              submit
              loading={submitting}
              disabled={!heading.trim() || heading === pageHeading}
            >
              Save settings
            </Button>
          </FormLayout>
        </Form>
      </BlockStack>
    </Card>
  );
}
