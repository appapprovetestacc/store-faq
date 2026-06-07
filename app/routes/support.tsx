import type { LoaderFunctionArgs } from "@remix-run/cloudflare";

export function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env;
  const supportEmail = env?.SUPPORT_EMAIL ?? "support@example.com";
  const emergencyContact = env?.EMERGENCY_CONTACT_EMAIL ?? supportEmail;
  const dpaContactName = env?.DPA_CONTACT_NAME ?? "Data protection contact";
  const dpaContactEmail = env?.DPA_CONTACT_EMAIL ?? supportEmail;
  const dataDeletionInstructionsUrl =
    env?.DATA_DELETION_INSTRUCTIONS_URL ?? "/data-retention";

  return Response.json({
    app: "Store FAQ",
    supportEmail,
    emergencyContact,
    dpaContact: {
      name: dpaContactName,
      email: dpaContactEmail,
    },
    dataDeletionInstructionsUrl,
    responseTime:
      "We answer standard merchant support requests within 1 business day.",
    escalation:
      "For app-review emergencies or production incidents, email the emergency contact with your shop domain, install timestamp, and a short screen recording.",
    copy:
      "Store FAQ" + " support helps merchants install, configure, and safely uninstall the app from their Shopify store.",
    uninstall:
      "Uninstalling the app triggers our customers/redact + shop/redact GDPR webhooks, which delete merchant data within 30 days per Shopify's data-handling policy. Visit /data-retention for the full retention timeline.",
  });
}
