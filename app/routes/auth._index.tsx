import {
  type LoaderFunctionArgs,
  redirect,
} from "@remix-run/cloudflare";
import {
  buildInstallUrl,
  isValidShop,
  shopifyApi,
  signedState,
} from "~/lib/shopify.server";

// GET /auth?shop=<store>.myshopify.com
// Initiates the Shopify OAuth install flow.
//
// F-NEW-AM — state is a server-signed token (HMAC over shop|nonce|expiry)
// rather than a cookie. Cookie-based state failed on Chromium 120+ when
// the OAuth callback came from a cross-site context (admin.shopify.com)
// because SameSite=Lax cookies are stripped on that hop under modern
// browser policies, producing "State mismatch" 401 on every install.
// Signed state is stateless + survives any cookie policy.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop || !isValidShop(shop)) {
    return new Response("Missing or invalid ?shop=<name>.myshopify.com", {
      status: 400,
    });
  }
  // F-NEW-AV — replace the raw "Missing SHOPIFY_API_KEY …" 500 from
  // shopifyApi() with a friendly 401 telling the merchant the app
  // owner hasn't pushed Partner credentials yet. The install routes
  // are the only ones a merchant hits before any credentials are
  // present, so this guard belongs here (and in authCallbackRoute);
  // webhook + billing routes keep the hard throw as an invariant.
  let api;
  try {
    api = shopifyApi(context);
  } catch (err) {
    if (err instanceof Error && /Missing SHOPIFY_API_/.test(err.message)) {
      return notConfiguredResponse();
    }
    throw err;
  }
  const state = await signedState({ shop, apiSecret: api.apiSecret });
  const redirectUri = `${api.appUrl.replace(/\/$/, "")}/auth/callback`;
  const installUrl = buildInstallUrl({
    shop,
    apiKey: api.apiKey,
    scopes: api.scopes,
    redirectUri,
    state,
  });
  return new Response(null, {
    status: 302,
    headers: { Location: installUrl },
  });
}

// F-NEW-AV — rendered when shopifyApi() throws because the app owner
// hasn't pushed Partner credentials yet. Plain HTML 401 (no Polaris,
// no JS), pointing back at AppApprove so the merchant knows the
// correct escalation path instead of seeing Remix's generic 500.
function notConfiguredResponse() {
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>App not configured</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:4rem auto;padding:0 1.25rem;color:#1a1a1a;line-height:1.5}h1{font-size:1.4rem;margin:0 0 .75rem}p{margin:0 0 1rem;color:#444}a{color:#008060}</style>
</head><body>
<h1>This app is not yet configured by its owner</h1>
<p>The Shopify Partner credentials (API key, secret, and app URL) have not been pushed to this deployment.</p>
<p>Please contact the AppApprove project owner to push Shopify Partner credentials from the project's <a href="https://appapprove.com/settings">settings page</a>.</p>
</body></html>`;
  return new Response(body, {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export default function AuthStart() {
  return null;
}
