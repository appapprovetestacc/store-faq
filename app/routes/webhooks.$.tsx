import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { dispatchWebhook } from "~/lib/webhook-router.server";

// Catch-all webhook route. Shopify POSTs all webhooks here; the router
// reads X-Shopify-Topic and dispatches to the registered handler.
export async function action({ request, context }: ActionFunctionArgs) {
  return dispatchWebhook(request, context);
}

// GET requests aren't expected — return 405 so misconfigured tooling
// gets a clear signal.
export function loader() {
  return new Response("Method Not Allowed", { status: 405 });
}
