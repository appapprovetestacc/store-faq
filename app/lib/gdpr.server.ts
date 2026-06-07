import type { AppLoadContext } from "@remix-run/cloudflare";
import type { Env } from "../../load-context";

// GDPR mandatory webhooks share three concerns:
//   1. parse the payload into a typed shape
//   2. call a user-implemented data adapter
//   3. record the request + outcome in an append-only audit log
//
// The default adapter is a no-op. Replace it with one that talks to your
// real data store (D1, R2, external DB) before you submit to App Review.

export interface CustomerDataRequestPayload {
  shop_id: number;
  shop_domain: string;
  orders_requested: number[];
  customer: { id: number; email: string; phone?: string };
  data_request: { id: number };
}

export interface CustomerRedactPayload {
  shop_id: number;
  shop_domain: string;
  customer: { id: number; email: string; phone?: string };
  orders_to_redact: number[];
}

export interface ShopRedactPayload {
  shop_id: number;
  shop_domain: string;
}

export interface GdprDataAdapter {
  exportCustomerData(input: {
    payload: CustomerDataRequestPayload;
  }): Promise<void>;
  redactCustomer(input: { payload: CustomerRedactPayload }): Promise<void>;
  redactShop(input: { payload: ShopRedactPayload }): Promise<void>;
}

// Default adapter — logs only, no real work. Replace this when you have
// real customer/shop data to export or delete.
export const defaultAdapter: GdprDataAdapter = {
  async exportCustomerData({ payload }) {
    console.warn(
      `[gdpr] default adapter: would export data for customer ${payload.customer.id} on shop ${payload.shop_domain}`,
    );
  },
  async redactCustomer({ payload }) {
    console.warn(
      `[gdpr] default adapter: would redact customer ${payload.customer.id} on shop ${payload.shop_domain}`,
    );
  },
  async redactShop({ payload }) {
    console.warn(
      `[gdpr] default adapter: would redact shop ${payload.shop_domain}`,
    );
  },
};

export interface AuditEntry {
  topic: string;
  shop: string;
  payload: unknown;
  receivedAt: number;
  completedAt: number | null;
  error: string | null;
  // GDPR mandates fulfillment within 30 days of receipt. We record the
  // deadline here so the gdpr-deadline-check cron can warn before the
  // window closes; values are in epoch-ms like receivedAt.
  deadlineAt: number;
}

// GDPR fulfillment SLA — 30 days from receipt for both data_request and
// customer/shop redact. Shopify enforces this via App Store reviews; the
// cron handler below warns 7 days before the window closes.
export const GDPR_DEADLINE_MS = 30 * 86_400_000;
export const GDPR_WARN_THRESHOLD_MS = 7 * 86_400_000;

function audit(context: AppLoadContext): KVNamespace | null {
  const env = (context.cloudflare?.env ?? {}) as Env;
  return env.GDPR_AUDIT ?? null;
}

function key(topic: string, shop: string): string {
  return `audit:${topic}:${shop}:${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function recordGdprRequest(
  context: AppLoadContext,
  input: {
    topic: string;
    shop: string;
    payload: unknown;
    fn: () => Promise<void>;
  },
): Promise<Response> {
  const k = key(input.topic, input.shop);
  const ns = audit(context);
  const receivedAt = Date.now();
  const baseEntry: AuditEntry = {
    topic: input.topic,
    shop: input.shop,
    payload: input.payload,
    receivedAt,
    completedAt: null,
    error: null,
    deadlineAt: receivedAt + GDPR_DEADLINE_MS,
  };
  if (ns) await ns.put(k, JSON.stringify(baseEntry));
  try {
    await input.fn();
    if (ns) {
      await ns.put(
        k,
        JSON.stringify({ ...baseEntry, completedAt: Date.now() }),
      );
    }
    return new Response("OK", { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (ns) {
      await ns.put(
        k,
        JSON.stringify({
          ...baseEntry,
          completedAt: Date.now(),
          error: message,
        }),
      );
    }
    console.error(`[gdpr] handler failed for ${input.topic}`, message);
    // Still return 200 — Shopify retries 4xx/5xx, but the data adapter
    // should surface real failures via your own monitoring + retry queue,
    // not via the Shopify retry loop.
    return new Response("OK (logged)", { status: 200 });
  }
}
