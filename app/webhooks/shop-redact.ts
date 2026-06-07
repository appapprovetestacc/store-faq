import type { WebhookHandler } from "~/lib/appapprove-config";
import {
  type ShopRedactPayload,
  defaultAdapter,
  recordGdprRequest,
} from "~/lib/gdpr.server";

// GDPR mandatory webhook: shop/redact.
// Shopify sends this 48 hours after a shop uninstalls. You must erase
// every record tied to the shop. Replace `defaultAdapter.redactShop` with
// a call into your real data store before submitting to App Review.
const handler: WebhookHandler = async ({ shop, payload, context }) => {
  return recordGdprRequest(context, {
    topic: "shop/redact",
    shop,
    payload,
    fn: () =>
      defaultAdapter.redactShop({
        payload: payload as ShopRedactPayload,
      }),
  });
};

export default handler;
