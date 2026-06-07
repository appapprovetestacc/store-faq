import type { LoaderFunctionArgs } from "@remix-run/cloudflare";

export function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env;
  const supportEmail = env?.SUPPORT_EMAIL ?? "support@example.com";
  const dpaContactName = env?.DPA_CONTACT_NAME ?? "Data protection contact";
  const dpaContactEmail = env?.DPA_CONTACT_EMAIL ?? supportEmail;

  return Response.json({
    app: "Store FAQ",
    categories: [
      {
        category: "shop",
        retention: "Until uninstall, then deleted or anonymized within 30 days.",
        deletionTrigger: "shop/redact webhook",
      },
      {
        category: "customer",
        retention: "Only when required by enabled features; deleted within 30 days of redact webhook.",
        deletionTrigger: "customers/redact webhook",
      },
      {
        category: "order",
        retention: "Only operational metadata needed for app features; removed when no longer needed or on shop redact.",
        deletionTrigger: "shop/redact webhook or scheduled cleanup cron",
      },
      {
        category: "billing",
        retention: "Billing status and plan history retained for tax, dispute, and audit obligations.",
        deletionTrigger: "legal retention expiry or account deletion request",
      },
      {
        category: "log",
        retention: "Security and webhook logs retained for short operational windows.",
        deletionTrigger: "scheduled cleanup cron",
      },
    ],
    deletionSla: "30 days after Shopify redact webhook where deletion is required.",
    dpaContact: {
      name: dpaContactName,
      email: dpaContactEmail,
    },
    supportEmail,
  });
}
