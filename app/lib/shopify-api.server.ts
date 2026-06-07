import type { OfflineSession } from "./session-storage.server";
import type { Env } from "../../load-context";
import { captureApiError } from "./merchant-qa.server";
import { LATEST_API_VERSION } from "./shopify.server";

// Phase 3 hardening — official Shopify Admin API wrapper. Every call
// is wrapped with captureApiError so failures land in the AppApprove
// QA timeline. Use this helper for ALL Admin API calls in this app:
//
//   import { shopifyAdmin } from "~/lib/shopify-api.server";
//   const { admin } = await authenticate.admin(request, context);
//   const api = shopifyAdmin(env, session, shop);
//   const res = await api.graphql(\`{ shop { name } }\`);
//
// Direct admin.graphql / fetch("https://...myshopify.com") calls are
// discouraged — they bypass the QA timeline and will surface as
// "missing wrapper" warnings on the readiness page.

export interface ShopifyAdminClient {
  graphql<T = unknown>(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<T>;
  rest<T = unknown>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options?: { body?: unknown; query?: Record<string, string | number | boolean> },
  ): Promise<T>;
}

export interface ShopifyAdminContext {
  env: Env;
  session: OfflineSession;
  shop: string;
  apiVersion?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RATE_LIMIT_STATUS = 429;

interface ShopifyApiError extends Error {
  status?: number;
  body?: string;
  endpoint?: string;
}

function makeError(
  endpoint: string,
  status: number,
  body: string,
  message?: string,
): ShopifyApiError {
  const err = new Error(
    message ??
      "Shopify Admin API " +
        endpoint +
        " returned " +
        status +
        ": " +
        body.slice(0, 500),
  ) as ShopifyApiError;
  err.status = status;
  err.body = body;
  err.endpoint = endpoint;
  return err;
}

// Common request runner with retry-after handling for 429 + a single
// retry on 5xx (Shopify recommends back-off on transient failures).
async function runRequest(
  endpoint: string,
  init: RequestInit,
  attempt: number = 0,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(endpoint, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === RATE_LIMIT_STATUS && attempt < 1) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    const delayMs = Math.min(Math.max(retryAfter, 1), 4) * 1000;
    await new Promise((r) => setTimeout(r, delayMs));
    return runRequest(endpoint, init, attempt + 1);
  }
  if (RETRYABLE_STATUSES.has(res.status) && attempt < 1) {
    await new Promise((r) => setTimeout(r, 500));
    return runRequest(endpoint, init, attempt + 1);
  }
  return res;
}

// Phase 7 E1 — preview-mode short-circuit. When the auth-bypass in
// shopify.server.ts returns the preview sentinel session (because
// PREVIEW_MODE === "1" AND the request had ?preview=1), the shop is
// "appapprove-preview.myshopify.com" — no real Shopify store exists
// at that hostname. Without this short-circuit, every Admin API call
// would fail DNS resolution. With it, .graphql() / .rest() return
// canned fixture data so route loaders render the embedded admin UI
// with plausible mock products / orders / customers.
//
// Defense-in-depth: this branch is only reached when the auth path
// already returned the preview sentinel — which itself requires
// PREVIEW_MODE === "1". So even if a malicious request crafted a
// session pointing at the preview shop, the prod Worker (no
// PREVIEW_MODE) would fall through to the real Admin API and fail
// auth there.
import { matchPreviewFixture, PREVIEW_SHOP_DOMAIN } from "./preview-fixtures";

export function shopifyAdmin(input: ShopifyAdminContext): ShopifyAdminClient {
  const { env, session, shop } = input;
  const apiVersion = input.apiVersion ?? LATEST_API_VERSION;
  const baseGraphql = "https://" + shop + "/admin/api/" + apiVersion + "/graphql.json";
  const baseRest = "https://" + shop + "/admin/api/" + apiVersion;

  // Preview-mode short-circuit — see comment above.
  const isPreview = env.PREVIEW_MODE === "1" && shop === PREVIEW_SHOP_DOMAIN;

  return {
    async graphql<T = unknown>(
      query: string,
      _options?: { variables?: Record<string, unknown> },
    ): Promise<T> {
      if (isPreview) {
        // Fixture matcher pattern-matches the query body against
        // common operation shapes (products, orders, customers, shop,
        // currentAppInstallation). Unmatched queries fall through to
        // an empty object so destructures don't blow up.
        return matchPreviewFixture<T>(query);
      }
      const options = _options;
      const endpoint = baseGraphql;
      try {
        const res = await runRequest(endpoint, {
          method: "POST",
          headers: {
            "x-shopify-access-token": session.accessToken,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            query,
            ...(options?.variables ? { variables: options.variables } : {}),
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          const err = makeError("graphql", res.status, body);
          await captureApiError(env, "graphql " + truncateQuery(query), err);
          throw err;
        }
        const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
        if (json.errors && json.errors.length > 0) {
          const msg = json.errors.map((e) => e.message).join("; ");
          const err = makeError("graphql", 200, msg, "Shopify GraphQL error: " + msg);
          await captureApiError(env, "graphql " + truncateQuery(query), err);
          throw err;
        }
        return (json.data ?? ({} as T)) as T;
      } catch (err) {
        // Network errors (timeout, DNS, etc.) — capture + re-throw.
        if (!(err instanceof Error) || !("status" in err)) {
          await captureApiError(env, "graphql " + truncateQuery(query), err);
        }
        throw err;
      }
    },

    async rest<T = unknown>(
      method: "GET" | "POST" | "PUT" | "DELETE",
      path: string,
      options?: { body?: unknown; query?: Record<string, string | number | boolean> },
    ): Promise<T> {
      if (isPreview) {
        // REST endpoints get a minimal generic stub. Most modern
        // Shopify-app code uses GraphQL; REST fallback returns empty
        // collection / null. Mutating REST verbs (POST/PUT/DELETE)
        // also no-op so preview mode can't accidentally try to write
        // to a fake shop.
        if (method === "GET") return {} as T;
        return { ok: true } as T;
      }
      const cleanPath = path.startsWith("/") ? path : "/" + path;
      let url = baseRest + cleanPath;
      if (options?.query) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(options.query)) {
          params.set(k, String(v));
        }
        url += "?" + params.toString();
      }
      const init: RequestInit = {
        method,
        headers: {
          "x-shopify-access-token": session.accessToken,
          accept: "application/json",
          ...(options?.body ? { "content-type": "application/json" } : {}),
        },
        ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      };
      const endpointLabel = method + " " + cleanPath;
      try {
        const res = await runRequest(url, init);
        if (!res.ok) {
          const body = await res.text();
          const err = makeError(endpointLabel, res.status, body);
          await captureApiError(env, endpointLabel, err);
          throw err;
        }
        if (res.status === 204) return undefined as unknown as T;
        return (await res.json()) as T;
      } catch (err) {
        if (!(err instanceof Error) || !("status" in err)) {
          await captureApiError(env, endpointLabel, err);
        }
        throw err;
      }
    },
  };
}

function truncateQuery(query: string): string {
  // First 80 chars of the query / mutation, single-line. Used as the
  // `endpoint` label in QA events so the timeline shows e.g.
  // "graphql query Products { products(first: 50) ..." instead of
  // a 2KB query body.
  return query.replace(/\s+/g, " ").trim().slice(0, 80);
}
