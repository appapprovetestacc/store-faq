import type { AppLoadContext } from "@remix-run/cloudflare";
import type { Env } from "../../load-context";
import { loadOfflineSession, type OfflineSession } from "./session-storage.server";

// Hand-rolled Shopify OAuth + App Bridge JWT verification, written for the
// Cloudflare Workers runtime (no node:crypto, no Buffer). Uses crypto.subtle
// for HMAC + JWT verification.
//
// For a full SDK, swap to @shopify/shopify-app-remix once they ship a
// supported Cloudflare-Workers adapter — the public API of this file
// matches what the SDK exposes so the migration is mechanical.

export const LATEST_API_VERSION = "2025-01";

function env(context: AppLoadContext): Env {
  return (context.cloudflare?.env ?? {}) as Env;
}

export function shopifyApi(context: AppLoadContext) {
  const e = env(context);
  if (!e.SHOPIFY_API_KEY || !e.SHOPIFY_API_SECRET || !e.SHOPIFY_APP_URL) {
    throw new Error(
      "Missing SHOPIFY_API_KEY / SHOPIFY_API_SECRET / SHOPIFY_APP_URL in env.",
    );
  }
  return {
    apiKey: e.SHOPIFY_API_KEY,
    apiSecret: e.SHOPIFY_API_SECRET,
    appUrl: e.SHOPIFY_APP_URL,
    scopes: (e.SCOPES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    apiVersion: LATEST_API_VERSION,
  };
}

export function isValidShop(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

export function buildInstallUrl(input: {
  shop: string;
  apiKey: string;
  scopes: string[];
  redirectUri: string;
  state: string;
}): string {
  const u = new URL(`https://${input.shop}/admin/oauth/authorize`);
  u.searchParams.set("client_id", input.apiKey);
  u.searchParams.set("scope", input.scopes.join(","));
  u.searchParams.set("redirect_uri", input.redirectUri);
  u.searchParams.set("state", input.state);
  return u.toString();
}

export async function exchangeCodeForOfflineToken(input: {
  shop: string;
  code: string;
  apiKey: string;
  apiSecret: string;
}): Promise<{ accessToken: string; scope: string }> {
  const res = await fetch(`https://${input.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: input.apiKey,
      client_secret: input.apiSecret,
      code: input.code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Shopify token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token: string; scope: string };
  return { accessToken: json.access_token, scope: json.scope };
}

// F-NEW-AN — Shopify OAuth callback HMAC validation. Duplicated from
// runtime/oauth-hmac.ts (the behaviour-tested reference); drift detected
// by oauth-state-template-inline.test.ts.
// Spec: https://shopify.dev/docs/apps/auth/oauth/getting-started#step-2-validate-the-callback
export async function verifyOAuthHmac(
  search: URLSearchParams,
  apiSecret: string,
): Promise<boolean> {
  const hmac = search.get("hmac");
  if (!hmac) return false;
  const params = Array.from(search.entries())
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(params)),
  );
  const expected = Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== hmac.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ hmac.charCodeAt(i);
  }
  return mismatch === 0;
}

// App Bridge session token verification (JWT signed with apiSecret).
// Spec: https://shopify.dev/docs/api/app-bridge-library/reference/session-tokens
export interface SessionTokenPayload {
  iss: string;
  dest: string;
  aud: string;
  sub: string;
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
  sid: string;
}

export async function verifySessionToken(
  jwt: string,
  apiKey: string,
  apiSecret: string,
): Promise<SessionTokenPayload> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT.");
  const headerPart = parts[0]!;
  const payloadPart = parts[1]!;
  const signaturePart = parts[2]!;
  const data = `${headerPart}.${payloadPart}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBytes = base64UrlDecode(signaturePart);
  const dataBytes = enc.encode(data);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes.buffer.slice(
      signatureBytes.byteOffset,
      signatureBytes.byteOffset + signatureBytes.byteLength,
    ) as ArrayBuffer,
    dataBytes.buffer.slice(
      dataBytes.byteOffset,
      dataBytes.byteOffset + dataBytes.byteLength,
    ) as ArrayBuffer,
  );
  if (!ok) throw new Error("Invalid JWT signature.");

  const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadPart));
  const payload = JSON.parse(payloadJson) as SessionTokenPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("JWT expired.");
  if (payload.nbf > now + 5) throw new Error("JWT not yet valid.");
  if (payload.aud !== apiKey)
    throw new Error("JWT aud mismatch (wrong API key).");
  return payload;
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    s.length + ((4 - (s.length % 4)) % 4),
    "=",
  );
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// F-NEW-AM + F-NEW-AN — OAuth state algorithm (nonce, signedState,
// verifySignedState, hmacHex, base64Url helpers). Duplicated from
// runtime/oauth-state.ts (the behaviour-tested reference); drift
// detected by oauth-state-template-inline.test.ts.
export function nonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signedState(input: {
  shop: string;
  apiSecret: string;
  ttlSeconds?: number;
}): Promise<string> {
  const ttl = input.ttlSeconds ?? 600;
  const nonceHex = nonce();
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${input.shop}|${nonceHex}|${expiry}`;
  const sig = await hmacHex(payload, input.apiSecret);
  return base64UrlEncode(`${payload}|${sig}`);
}

export async function verifySignedState(input: {
  state: string;
  expectedShop: string;
  apiSecret: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  let decoded: string;
  try {
    decoded = base64UrlDecodeToString(input.state);
  } catch {
    return { ok: false, reason: "state-not-base64url" };
  }
  const parts = decoded.split("|");
  if (parts.length !== 4) return { ok: false, reason: "state-malformed" };
  const [shop, nonceHex, expiryStr, sig] = parts as [string, string, string, string];
  if (shop !== input.expectedShop) {
    return { ok: false, reason: "state-shop-mismatch" };
  }
  const expiry = Number.parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry)) {
    return { ok: false, reason: "state-expiry-malformed" };
  }
  if (Math.floor(Date.now() / 1000) > expiry) {
    return { ok: false, reason: "state-expired" };
  }
  const payload = `${shop}|${nonceHex}|${expiryStr}`;
  const expected = await hmacHex(payload, input.apiSecret);
  if (expected.length !== sig.length) {
    return { ok: false, reason: "state-sig-length-mismatch" };
  }
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (mismatch !== 0) return { ok: false, reason: "state-sig-mismatch" };
  return { ok: true };
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(data)),
  );
  return Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(s: string): string {
  const bin = btoa(unescape(encodeURIComponent(s)));
  return bin.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeToString(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    s.length + ((4 - (s.length % 4)) % 4),
    "=",
  );
  const bin = atob(padded);
  return decodeURIComponent(escape(bin));
}

// ─── Authenticate API ──────────────────────────────────────────────
//
// Higher-level facade over the primitives above. Matches the shape
// that `@shopify/shopify-app-remix` exposes so AI-generated routes
// can use the SDK-conventional pattern:
//
//   import { authenticate } from "~/lib/shopify.server";
//   const { session, shop } = await authenticate.admin(request, context);
//   const { topic, payload } = await authenticate.webhook(request, context);
//
// Differs from the upstream SDK in that we take an explicit `context`
// arg — Cloudflare bindings live there, not in module scope. Routes
// running on Cloudflare Workers have to pass `context` from the
// loader/action signature.

export interface AdminAuthResult {
  session: OfflineSession;
  sessionToken: SessionTokenPayload;
  shop: string;
}

export interface WebhookAuthResult {
  topic: string;
  shop: string;
  webhookId: string;
  payload: unknown;
  raw: string;
}

// F-NEW-AN — Shopify webhook signature validation. Duplicated from
// runtime/webhook-hmac.ts (the behaviour-tested reference); drift
// detected by oauth-state-template-inline.test.ts. Exported so the
// runtime module's inline region (which uses export for testability)
// matches byte-for-byte.
export async function verifyWebhookHmac(
  body: string,
  hmacHeader: string,
  apiSecret: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(body)),
  );
  let binary = "";
  for (const b of sigBytes) binary += String.fromCharCode(b);
  const expected = btoa(binary);
  if (expected.length !== hmacHeader.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ hmacHeader.charCodeAt(i);
  }
  return mismatch === 0;
}

// Phase 7 E1 — preview-mode sentinel + bypass. Returned by both
// authenticate.admin and authenticate.public when:
//   1. env.PREVIEW_MODE === "1" (build-time flag, baked only into the
//      preview Worker — prod Worker has it unset so this branch is
//      unreachable in production binary), AND
//   2. URL has ?preview=1 query param (so a stray request to the
//      preview Worker URL without the param still returns 401 — keeps
//      the bypass invisible to crawlers/scanners)
//
// The mock session has shape-compatible OfflineSession + SessionToken
// so route code that destructures `{ session, shop }` works unchanged.
// shop value is the preview sentinel; the GraphQL client's preview-mode
// short-circuit (in shopify-api.server.ts) keys on this sentinel to
// return canned fixture data instead of hitting the real Admin API.
const PREVIEW_SHOP_DOMAIN = "appapprove-preview.myshopify.com";

function isPreviewModeRequest(request: Request, context: AppLoadContext): boolean {
  const e = env(context);
  if (e.PREVIEW_MODE !== "1") return false;
  try {
    return new URL(request.url).searchParams.get("preview") === "1";
  } catch {
    return false;
  }
}

function previewModeAdminResult(): AdminAuthResult {
  const now = Math.floor(Date.now() / 1000);
  return {
    session: {
      id: "preview|" + PREVIEW_SHOP_DOMAIN,
      shop: PREVIEW_SHOP_DOMAIN,
      state: "preview-mode",
      isOnline: false,
      accessToken: "preview-mode-no-real-token",
      scope: "preview",
    },
    sessionToken: {
      iss: "https://" + PREVIEW_SHOP_DOMAIN + "/admin",
      dest: "https://" + PREVIEW_SHOP_DOMAIN,
      aud: "preview-mode",
      sub: "preview-user",
      exp: now + 3600,
      nbf: now - 60,
      iat: now,
      jti: "preview-jti",
      sid: "preview-sid",
    } as SessionTokenPayload,
    shop: PREVIEW_SHOP_DOMAIN,
  };
}

async function authenticateAdmin(
  request: Request,
  context: AppLoadContext,
): Promise<AdminAuthResult> {
  if (isPreviewModeRequest(request, context)) {
    return previewModeAdminResult();
  }
  // F-NEW-AZ — session-token sources, in priority order: the
  // Authorization header (App Bridge attaches it once booted), then
  // the ?id_token= query param. Shopify delivers id_token on the
  // FIRST embedded load — before App Bridge has booted to attach the
  // header — so a header-only check 401s every app's first open
  // ("Something went wrong") and every reviewer's first probe; a
  // reload only "works" because App Bridge is warm by then.
  const bearer = (request.headers.get("authorization") ?? "").match(
    /^Bearer (.+)$/i,
  );
  const token =
    bearer?.[1] ?? new URL(request.url).searchParams.get("id_token");
  if (!token) {
    throw new Response("Missing session token", { status: 401 });
  }
  const cfg = shopifyApi(context);
  const sessionToken = await verifySessionToken(token, cfg.apiKey, cfg.apiSecret);
  // sessionToken.dest is the shop URL like "https://x.myshopify.com"
  const shop = new URL(sessionToken.dest).hostname;
  const session = await loadOfflineSession(context, shop);
  if (!session) {
    throw new Response("No offline session for this shop — reinstall required.", {
      status: 401,
    });
  }
  return { session, sessionToken, shop };
}

async function authenticateWebhook(
  request: Request,
  context: AppLoadContext,
): Promise<WebhookAuthResult> {
  const cfg = shopifyApi(context);
  const raw = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const ok = await verifyWebhookHmac(raw, hmac, cfg.apiSecret);
  if (!ok) {
    throw new Response("Invalid webhook HMAC", { status: 401 });
  }
  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shop = request.headers.get("x-shopify-shop-domain") ?? "";
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? "";
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = raw;
  }
  return { topic, shop, webhookId, payload, raw };
}

function authenticatePublic(
  request: Request,
  context: AppLoadContext,
): { shop: string } {
  if (isPreviewModeRequest(request, context)) {
    return { shop: PREVIEW_SHOP_DOMAIN };
  }
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  if (!isValidShop(shop)) {
    throw new Response("Invalid or missing shop param", { status: 400 });
  }
  return { shop };
}

export const authenticate = {
  admin: authenticateAdmin,
  webhook: authenticateWebhook,
  public: authenticatePublic,
};
