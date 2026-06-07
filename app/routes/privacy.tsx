import type { LoaderFunctionArgs } from "@remix-run/cloudflare";

export function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env;
  const supportEmail = env?.SUPPORT_EMAIL ?? "support@example.com";
  const dpaContactName = env?.DPA_CONTACT_NAME ?? "Data protection contact";
  const dpaContactEmail = env?.DPA_CONTACT_EMAIL ?? supportEmail;
  const dataDeletionInstructionsUrl =
    env?.DATA_DELETION_INSTRUCTIONS_URL ?? "/data-retention";

  return Response.json({
    app: "Store FAQ",
    dataCollected: [
      "shop domain",
      "offline access token",
      "billing status",
      "webhook payload metadata",
    ],
    purpose:
      "Operate " + "Store FAQ" + ", provide support, process Shopify webhooks, and keep the merchant installation secure.",
    retention:
      "Shop data is deleted or anonymized after uninstall and shop/redact webhook processing.",
    dataRetention: [
      {
        event: "App uninstall",
        timeline: "OAuth tokens are revoked immediately and shop records are queued for deletion.",
      },
      {
        event: "Shop redact webhook",
        timeline: "Personal shop data is deleted or anonymized within 30 days.",
      },
      {
        event: "Support records",
        timeline: "Support correspondence is retained only as long as needed to resolve the request and meet legal obligations.",
      },
    ],
    deletionSla: "30 days",
    dataDeletionInstructionsUrl,
    contact: supportEmail,
    dpaContact: {
      name: dpaContactName,
      email: dpaContactEmail,
    },
  });
}
