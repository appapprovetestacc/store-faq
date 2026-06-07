import { redirect, type AppLoadContext } from "@remix-run/cloudflare";
import type { Env } from "../../load-context";
import { isValidShop } from "./shopify.server";
import { loadOfflineSession, type OfflineSession } from "./session-storage.server";

// Embedded-admin loader auth (see CLAUDE.md "DON'T-MIX" note).
//
// The first top-level GET that Shopify makes when it loads the app iframe
// has NO Authorization header — App Bridge only attaches the session-token
// JWT to client-side fetches AFTER boot. So loaders must NOT call
// authenticate.admin() (that 401s on first paint). Instead we read the
// offline session that /auth/callback persisted at install time, exactly
// as the CLAUDE.md loader pattern prescribes.
//
// The preview-mode short-circuit mirrors authenticate.admin's: when the
// preview Worker (PREVIEW_MODE === "1") is hit with ?preview=1, return a
// sentinel session pointed at the preview shop so shopifyAdmin() serves
// fixture data instead of calling a non-existent store.

const PREVIEW_SHOP_DOMAIN = "appapprove-preview.myshopify.com";

export interface ResolvedAdminLoader {
  env: Env;
  shop: string;
  session: OfflineSession;
  host: string;
  preview: boolean;
}

export async function resolveAdminLoader(
  request: Request,
  context: AppLoadContext,
): Promise<ResolvedAdminLoader> {
  const env = (context.cloudflare?.env ?? {}) as Env;
  const url = new URL(request.url);
  const host = url.searchParams.get("host") ?? "";

  if (env.PREVIEW_MODE === "1" && url.searchParams.get("preview") === "1") {
    return {
      env,
      host,
      preview: true,
      shop: PREVIEW_SHOP_DOMAIN,
      session: {
        shop: PREVIEW_SHOP_DOMAIN,
        accessToken: "preview-mode-no-real-token",
        scope: "read_products",
        storedAt: 0,
      },
    };
  }

  const shop = url.searchParams.get("shop");
  if (!shop || !isValidShop(shop)) {
    throw new Response("Missing or invalid ?shop", { status: 400 });
  }
  const session = await loadOfflineSession(context, shop);
  if (!session) {
    throw redirect(`/auth?shop=${encodeURIComponent(shop)}`);
  }
  return { env, shop, session, host, preview: false };
}
