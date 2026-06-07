import { type LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";

// Shopify redirects here after the merchant approves the charge. We
// don't need to do anything special — the Billing API has already
// activated the subscription. Re-fetch on /billing to show the new state.
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  return redirect(`/billing?shop=${encodeURIComponent(shop)}`);
}

export default function BillingCallback() {
  return null;
}
