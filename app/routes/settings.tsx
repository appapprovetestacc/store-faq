import {
  json,
  type ActionFunctionArgs,
  type LinksFunction,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import {
  AppProvider,
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import type { Env } from "../../load-context";
import { authenticate } from "~/lib/shopify.server";
import { captureSetupStep } from "~/lib/merchant-qa.server";
import { resolveAdminLoader } from "~/lib/admin-loader.server";
import {
  getFaqSettings,
  saveFaqSettingsFromForm,
  DEFAULT_FAQ_SETTINGS,
} from "~/lib/faq-storage.server";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { env, shop, preview } = await resolveAdminLoader(request, context);
  const settings = preview
    ? DEFAULT_FAQ_SETTINGS
    : await getFaqSettings(context, shop);
  return json({
    apiKey: env.SHOPIFY_API_KEY ?? "",
    settings,
    // Preserve the embedded query params (shop/host/preview) so the back
    // action returns to the dashboard inside the admin iframe.
    search: new URL(request.url).search,
  });
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: "Store FAQ · Settings" },
  { name: "shopify-api-key", content: data?.apiKey ?? "" },
];

type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function action({ request, context }: ActionFunctionArgs) {
  const { shop } = await authenticate.admin(request, context);
  const env = (context.cloudflare?.env ?? {}) as Env;
  const formData = await request.formData();
  const result = await saveFaqSettingsFromForm(context, shop, formData);
  if (!result.ok) {
    return json<ActionResult>({ ok: false, error: result.error }, { status: 400 });
  }
  await captureSetupStep(env, "faq_settings_saved", {});
  return json<ActionResult>({ ok: true });
}

export default function SettingsRoute() {
  const { settings, search } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [heading, setHeading] = useState(settings.pageHeading);

  const submitting = navigation.state !== "idle";
  const error = actionData && !actionData.ok ? actionData.error : null;
  const saved = actionData && actionData.ok;

  return (
    <AppProvider i18n={enTranslations}>
      <Page
        title="Settings"
        subtitle="Customize how your FAQ section appears."
        backAction={{ content: "Store FAQ", url: `/app${search}` }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Display
                </Text>
                {error ? (
                  <Banner tone="critical" title="Could not save settings">
                    <p>{error}</p>
                  </Banner>
                ) : null}
                {saved ? <Banner tone="success" title="Settings saved" /> : null}
                <Form method="post">
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
                      variant="primary"
                      loading={submitting}
                      disabled={
                        !heading.trim() || heading === settings.pageHeading
                      }
                    >
                      Save settings
                    </Button>
                  </FormLayout>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}
