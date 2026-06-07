// Trial-status helpers + KV-backed activation tracking. The
// app_subscriptions/update webhook calls these when a subscription's state
// transitions, so the UI doesn't have to recompute trial dates from
// Shopify on every request.

import type { AppLoadContext } from "@remix-run/cloudflare";
import type { Env } from "../../load-context";

export type TrialState =
  | { kind: "none" }
  | { kind: "active"; daysLeft: number; trialEnd: Date }
  | { kind: "expired"; expiredAt: Date }
  | { kind: "converted"; convertedAt: Date };

export function computeTrialState(input: {
  createdAt: string | Date;
  trialDays: number | null;
  status: string;
  now?: Date;
}): TrialState {
  const trialDays = input.trialDays ?? 0;
  if (trialDays <= 0) return { kind: "none" };
  const now = input.now ?? new Date();
  const created =
    typeof input.createdAt === "string"
      ? new Date(input.createdAt)
      : input.createdAt;
  const trialEnd = new Date(created.getTime() + trialDays * 86_400_000);
  if (input.status === "CANCELLED" || input.status === "EXPIRED") {
    return { kind: "expired", expiredAt: trialEnd };
  }
  if (now >= trialEnd) {
    // Trial period elapsed. If still ACTIVE, the merchant has converted.
    if (input.status === "ACTIVE")
      return { kind: "converted", convertedAt: trialEnd };
    return { kind: "expired", expiredAt: trialEnd };
  }
  const msLeft = trialEnd.getTime() - now.getTime();
  return {
    kind: "active",
    trialEnd,
    daysLeft: Math.max(0, Math.ceil(msLeft / 86_400_000)),
  };
}

interface ActivationRecord {
  shop: string;
  subscriptionId: string;
  planName: string;
  status: string;
  recordedAt: number;
  trialDays: number | null;
}

function audit(context: AppLoadContext): KVNamespace | null {
  const env = (context.cloudflare?.env ?? {}) as Env;
  return env.GDPR_AUDIT ?? null; // reuse the audit KV — same retention guarantees
}

export async function recordActivation(
  context: AppLoadContext,
  rec: ActivationRecord,
): Promise<void> {
  const ns = audit(context);
  if (!ns) return;
  const key = `activation:${rec.shop}:${rec.subscriptionId}:${rec.recordedAt}`;
  await ns.put(key, JSON.stringify(rec));
}

// Per-shop "first time we ever saw this shop" timestamp. Persisted on
// first OAuth completion + read whenever a subscription is created so the
// trial window can't be reset by uninstalling and reinstalling. Reads
// before write (best-effort idempotency); concurrent first-installs may
// each see "no record" but the later put wins by a few ms — close enough
// for trial accounting.
const FIRST_INSTALL_PREFIX = "first_install:";

export async function getOrSetFirstInstallAt(
  context: AppLoadContext,
  shop: string,
): Promise<Date> {
  const ns = audit(context);
  const now = new Date();
  if (!ns) return now;
  const key = FIRST_INSTALL_PREFIX + shop;
  const existing = await ns.get(key);
  if (existing) {
    const ts = Number(existing);
    if (Number.isFinite(ts) && ts > 0) return new Date(ts);
  }
  await ns.put(key, String(now.getTime()));
  return now;
}

export async function getFirstInstallAt(
  context: AppLoadContext,
  shop: string,
): Promise<Date | null> {
  const ns = audit(context);
  if (!ns) return null;
  const v = await ns.get(FIRST_INSTALL_PREFIX + shop);
  if (!v) return null;
  const ts = Number(v);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return new Date(ts);
}

// Compensates configured trial days against "first install" history so a
// shop that uninstalls + reinstalls can't get a fresh trial window. If the
// configured trial period has fully elapsed since first install, returns 0.
export function effectiveTrialDays(input: {
  configured: number;
  firstInstallAt: Date | null;
  now?: Date;
}): number {
  if (input.configured <= 0) return 0;
  if (!input.firstInstallAt) return input.configured;
  const now = input.now ?? new Date();
  const elapsedDays = Math.floor(
    (now.getTime() - input.firstInstallAt.getTime()) / 86_400_000,
  );
  if (elapsedDays >= input.configured) return 0;
  return input.configured - elapsedDays;
}
