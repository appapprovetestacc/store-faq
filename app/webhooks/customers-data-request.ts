import type { WebhookHandler } from "~/lib/appapprove-config";
import {
  type CustomerDataRequestPayload,
  defaultAdapter,
  recordGdprRequest,
} from "~/lib/gdpr.server";

// GDPR mandatory webhook: customers/data_request.
// Shopify sends this when a merchant or customer requests a data export.
// You have 30 days to fulfill the request — fan out to your real export
// pipeline by replacing `defaultAdapter.exportCustomerData` below.
const handler: WebhookHandler = async ({ shop, payload, context }) => {
  return recordGdprRequest(context, {
    topic: "customers/data_request",
    shop,
    payload,
    fn: () =>
      defaultAdapter.exportCustomerData({
        payload: payload as CustomerDataRequestPayload,
      }),
  });
};

export default handler;
