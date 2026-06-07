import type { AppLoadContext } from "@remix-run/cloudflare";
import type { Env } from "../../load-context";

// Cloudflare KV-backed Shopify session storage. Bind a KV namespace named
// SESSIONS in wrangler.toml; AppApprove provisions one automatically at
// deploy time (Sprint 27). When unbound (local dev without --remote-bindings),
// falls back to an in-memory map so the app still boots.

export interface OfflineSession {
  shop: string;
  accessToken: string;
  scope: string;
  storedAt: number;
}

const memory = new Map<string, OfflineSession>();

function kv(context: AppLoadContext): KVNamespace | null {
  const env = (context.cloudflare?.env ?? {}) as Env;
  return env.SESSIONS ?? null;
}

function key(shop: string): string {
  return `offline:${shop}`;
}

export async function loadOfflineSession(
  context: AppLoadContext,
  shop: string,
): Promise<OfflineSession | null> {
  const ns = kv(context);
  if (ns) {
    const raw = await ns.get(key(shop));
    return raw ? (JSON.parse(raw) as OfflineSession) : null;
  }
  return memory.get(key(shop)) ?? null;
}

export async function saveOfflineSession(
  context: AppLoadContext,
  session: OfflineSession,
): Promise<void> {
  const ns = kv(context);
  const value = JSON.stringify(session);
  if (ns) {
    await ns.put(key(session.shop), value);
    return;
  }
  memory.set(key(session.shop), session);
}

export async function deleteOfflineSession(
  context: AppLoadContext,
  shop: string,
): Promise<void> {
  const ns = kv(context);
  if (ns) {
    await ns.delete(key(shop));
    return;
  }
  memory.delete(key(shop));
}
