import type { Env } from "../../load-context";

// Phase 7 C3 — single send-email entry point for the generated app.
// Auto-detects customer setup state:
//
//   1. If env.RESEND_API_KEY is set (Phase 7.1 BYOK) → call Resend
//      directly using the customer's account. Sender = whatever the
//      customer set in env.MAIL_SENDER_FROM (or defaults to
//      "noreply@<resend-verified-domain>"). Customer owns deliverability.
//
//   2. Else → POST to AppApprove's /api/mail/send proxy. AppApprove
//      forwards via OUR Resend account from
//      noreply-{slug}@apps.appapprove.com. Per-tier daily quota
//      applies (free 10/day, pro 100/day). Customer can upgrade by
//      adding their own RESEND_API_KEY in /app/<slug>/settings/env.
//
// USAGE (route code):
//   import { sendMail } from "~/lib/mail.server";
//   await sendMail(context, {
//     to: "customer@example.com",
//     subject: "Order confirmed",
//     html: "<p>Thanks for your order!</p>",
//     replyTo: "support@yourstore.com",
//   });
//
// AI codegen + concierge operator MUST use this helper. Do NOT call
// the Resend SDK directly — the BYOK / fallback split breaks if you
// hardcode Resend calls.

import type { AppLoadContext } from "@remix-run/cloudflare";

const APPAPPROVE_DEFAULT_BASE =
  "https://appapprove.com/api/mail/send";

export interface SendMailInput {
  /** Single recipient or array (max 50). */
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Customer's support inbox; replies route here. Optional. */
  replyTo?: string;
  /** Optional Resend tags. project_id + project_slug auto-added by the proxy. */
  tags?: Array<{ name: string; value: string }>;
}

export interface SendMailResult {
  ok: boolean;
  /** Resend delivery id if sent (BYOK or fallback both return this). */
  id?: string;
  /** Path taken — for debugging + analytics. */
  via: "byok" | "appapprove-fallback";
  /** Recipients that were dropped due to suppression-list (fallback path only). */
  suppressed?: string[];
  /** Quota state (fallback path only). */
  quota?: {
    remaining: number;
    used: number;
    limit: number;
    resetAtUtc: string;
  };
  error?: string;
}

function envOf(context: AppLoadContext): Env {
  return (context.cloudflare?.env ?? {}) as Env;
}

async function sendViaBYOK(
  env: Env,
  input: SendMailInput,
): Promise<SendMailResult> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, via: "byok", error: "BYOK path called without RESEND_API_KEY" };
  }
  const from =
    env.MAIL_SENDER_FROM ?? "noreply@example.com (set MAIL_SENDER_FROM env var)";
  const body = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    ...(input.html ? { html: input.html } : {}),
    ...(input.text ? { text: input.text } : {}),
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      via: "byok",
      error: `Resend HTTP ${res.status}: ${text.slice(0, 300)}`,
    };
  }
  const json = (await res.json()) as { id?: string };
  return { ok: true, via: "byok", id: json.id };
}

async function sendViaAppApprove(
  env: Env,
  input: SendMailInput,
): Promise<SendMailResult> {
  const slug = env.APPAPPROVE_PROJECT_SLUG;
  const deploySecret = env.APPAPPROVE_DEPLOY_SECRET;
  if (!slug || !deploySecret) {
    return {
      ok: false,
      via: "appapprove-fallback",
      error:
        "AppApprove fallback unavailable — APPAPPROVE_PROJECT_SLUG or APPAPPROVE_DEPLOY_SECRET missing.",
    };
  }
  const body = JSON.stringify({
    to: input.to,
    subject: input.subject,
    ...(input.html ? { html: input.html } : {}),
    ...(input.text ? { text: input.text } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  });
  const sig = await hmacSha256Hex(deploySecret, body);
  const url = `${APPAPPROVE_DEFAULT_BASE}?slug=${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AppApprove-Signature": `sha256=${sig}`,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  let json: {
    ok?: boolean;
    error?: string;
    delivered?: { id?: string };
    suppressed?: string[];
    quota?: SendMailResult["quota"];
  } = {};
  try {
    json = await res.json();
  } catch {
    // ignore parse errors
  }
  if (!res.ok || !json.ok) {
    return {
      ok: false,
      via: "appapprove-fallback",
      error: json.error ?? `HTTP ${res.status}`,
      suppressed: json.suppressed,
      quota: json.quota,
    };
  }
  return {
    ok: true,
    via: "appapprove-fallback",
    id: json.delivered?.id,
    suppressed: json.suppressed,
    quota: json.quota,
  };
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  // crypto.subtle is the Workers-compatible HMAC primitive (no node:crypto).
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(body)),
  );
  return Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sendMail(
  context: AppLoadContext,
  input: SendMailInput,
): Promise<SendMailResult> {
  const env = envOf(context);
  if (env.RESEND_API_KEY) return sendViaBYOK(env, input);
  return sendViaAppApprove(env, input);
}
