import type { WebhookHandler } from "~/lib/appapprove-config";
import {
  type CustomerRedactPayload,
  defaultAdapter,
  recordGdprRequest,
} from "~/lib/gdpr.server";

// GDPR mandatory webhook: customers/redact.
// Shopify sends this 10 days after a customer requests deletion. You must
// erase any data keyed on the customer_id within 30 days. Replace
// `defaultAdapter.redactCustomer` with a call into your real data store.
const handler: WebhookHandler = async ({ shop, payload, context }) => {
  return recordGdprRequest(context, {
    topic: "customers/redact",
    shop,
    payload,
    fn: () =>
      defaultAdapter.redactCustomer({
        payload: payload as CustomerRedactPayload,
      }),
  });
};

export default handler;
