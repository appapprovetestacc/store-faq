import {
  type LoaderFunctionArgs,
  redirect,
} from "@remix-run/cloudflare";
import type { Env } from "../../load-context";
import {
  exchangeCodeForOfflineToken,
  isValidShop,
  shopifyApi,
  verifyOAuthHmac,
  verifySignedState,
} from "~/lib/shopify.server";
import { saveOfflineSession } from "~/lib/session-storage.server";
import { getOrSetFirstInstallAt } from "~/lib/trial.server";
import { captureInstall, captureSetupStep } from "~/lib/merchant-qa.server";

// GET /auth/callback — Shopify redirects here with ?code, ?shop, ?state, ?hmac
//
// F-NEW-AM — state is a server-signed token (HMAC over shop|nonce|expiry).
// Previously the scaffold stored state in a Set-Cookie that the browser
// failed to send back on the cross-site OAuth callback under Chromium
// 120+'s stricter SameSite=Lax policy → 401 on every install. Signed
// state is stateless, immune to cookie policy, and validates that the
// callback shop matches the shop that initiated the install.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!shop || !isValidShop(shop) || !code || !state) {
    return new Response("Bad request", { status: 400 });
  }
  // F-NEW-AV — see auth.start: same friendly-401 guard so the OAuth
  // callback doesn't bounce the merchant to Remix's generic 500 when
  // credentials are absent.
  let api;
  try {
    api = shopifyApi(context);
  } catch (err) {
    if (err instanceof Error && /Missing SHOPIFY_API_/.test(err.message)) {
      return notConfiguredResponse();
    }
    throw err;
  }
  if (!(await verifyOAuthHmac(url.searchParams, api.apiSecret))) {
    return new Response("HMAC mismatch", { status: 401 });
  }
  const stateCheck = await verifySignedState({
    state,
    expectedShop: shop,
    apiSecret: api.apiSecret,
  });
  if (!stateCheck.ok) {
    // Reason is safe to include — doesn't leak the API_SECRET or any
    // session-bound data. Helps Shopify reviewers + merchant support
    // pinpoint state-expired vs state-tampered.
    return new Response(`State invalid (${stateCheck.reason})`, { status: 401 });
  }

  const token = await exchangeCodeForOfflineToken({
    shop,
    code,
    apiKey: api.apiKey,
    apiSecret: api.apiSecret,
  });
  await saveOfflineSession(context, {
    shop,
    accessToken: token.accessToken,
    scope: token.scope,
    storedAt: Date.now(),
  });
  // Idempotent: stamp first-install so a later uninstall+reinstall
  // can't reset the trial window. Failure must not block OAuth completion.
  try {
    await getOrSetFirstInstallAt(context, shop);
  } catch (err) {
    console.warn("[auth] getOrSetFirstInstallAt failed (non-fatal)", err);
  }

  // Phase 3.8 D — QA install event. Non-blocking, never fails OAuth.
  const qaEnv = (context.cloudflare?.env ?? {}) as Env;
  await captureInstall(qaEnv, shop);
  // Phase 3 hardening — fire the canonical "oauth_complete" setup step
  // so the AppApprove timeline shows OAuth landed on this shop. This is
  // the first universal setup-step every app shares; merchants add
  // app-specific captureSetupStep calls on top (see docs/qa.md).
  await captureSetupStep(qaEnv, "oauth_complete", { shop });

  // Hand off to the embedded admin app.
  const target = `/?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(url.searchParams.get("host") ?? "")}`;
  return new Response(null, {
    status: 302,
    headers: { Location: target },
  });
}

// F-NEW-AV — friendly 401 (see auth.start.tsx for the same helper).
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

export default function AuthCallback() {
  return null;
}
