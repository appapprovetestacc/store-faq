// Phase 3.8 B + D — Merchant QA helpers. Used by:
//   - app/routes/qa.tsx (Phase 3.8 B): renders the test-merchant task
//     checklist + per-task feedback form, posts feedback to AppApprove.
//   - app/lib/qa-events.ts (Phase 3.8 D): capture hooks fire QA events
//     (install / setup_step / api_error / webhook_error / frontend_error)
//     to AppApprove for the timeline UI.
//
// All outbound posts go through reportToAppApprove() which signs the
// body with APPAPPROVE_DEPLOY_SECRET (the per-project HMAC key the
// AppApprove deploy pipeline pushed at provisioning time). Without the
// secret bound (e.g. fork without AppApprove integration), the helpers
// silently no-op so the generated app keeps working stand-alone.

export interface QaTask {
  id: string;
  title: string;
  expectedResult: string;
}

export interface QaFeedback {
  taskId: string;
  rating: "pass" | "blocked" | "unclear";
  notes: string;
  merchantEmail?: string;
  attachments?: QaAttachment[];
}

export interface QaAttachment {
  name: string;
  mimeType: string;
  sizeBytes: number;
  base64Data?: string;
}

export interface QaTimelineEvent {
  type: "qa_install" | "qa_setup_step" | "qa_api_error" | "qa_webhook_error" | "qa_frontend_error";
  message: string;
  occurredAt: string;
  metadata?: Record<string, string>;
}

export function defaultQaTasks(): QaTask[] {
  return [
    { id: "install", title: "Install from a clean development store", expectedResult: "OAuth completes and the embedded app opens." },
    { id: "setup", title: "Complete the first setup flow", expectedResult: "The app reaches a usable configured state." },
    { id: "core-feature", title: "Exercise the main merchant workflow", expectedResult: "The promised listing outcome works with realistic store data." },
    { id: "support", title: "Find support and privacy information", expectedResult: "Merchant can reach help, privacy, and status pages." },
  ];
}

export function feedbackToPrompt(feedback: QaFeedback): string {
  return "Merchant QA feedback for task " + feedback.taskId + ": " + feedback.rating + ". " + feedback.notes;
}

export function redactQaEvent(event: QaTimelineEvent): QaTimelineEvent {
  const metadata = event.metadata
    ? Object.fromEntries(
        Object.entries(event.metadata).map(([key, value]) => [
          key,
          /email|token|secret|phone|address/i.test(key) ? "[redacted]" : value,
        ]),
      )
    : undefined;
  return { ...event, ...(metadata ? { metadata } : {}) };
}

// Builds the install URL Shopify uses to OAuth-install the app on a
// fresh dev/staging store. Pass the merchant's myshopify.com domain
// (without protocol) — the URL launches the OAuth flow against the
// configured client_id from shopify.app.toml.
export function buildStagingInstallUrl(myshopifyDomain: string, clientId: string): string {
  const cleanDomain = myshopifyDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(cleanDomain)) {
    throw new Error("Invalid myshopify.com domain: " + cleanDomain);
  }
  return "https://" + cleanDomain + "/admin/oauth/install_custom_app?client_id=" + encodeURIComponent(clientId);
}

interface ReportEnv {
  APPAPPROVE_DEPLOY_URL?: string;
  APPAPPROVE_PROJECT_SLUG?: string;
  APPAPPROVE_DEPLOY_SECRET?: string;
}

interface ReportOptions {
  path: "qa-feedback" | "qa-event";
  body: Record<string, unknown>;
}

// Signs the body with HMAC-SHA256(deploy_secret, raw_body) and POSTs
// to AppApprove's matching ingest endpoint. Returns boolean for the
// caller to surface success/failure in UI.
export async function reportToAppApprove(env: ReportEnv, opts: ReportOptions): Promise<boolean> {
  if (!env.APPAPPROVE_DEPLOY_URL || !env.APPAPPROVE_DEPLOY_SECRET || !env.APPAPPROVE_PROJECT_SLUG) {
    return false;
  }
  const rawBody = JSON.stringify(opts.body);
  const sig = await hmacSha256Hex(env.APPAPPROVE_DEPLOY_SECRET, rawBody);
  const url = env.APPAPPROVE_DEPLOY_URL.replace(/\/+$/, "") + "/api/" + opts.path + "/" + encodeURIComponent(env.APPAPPROVE_PROJECT_SLUG);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-appapprove-signature": "sha256=" + sig,
      },
      body: rawBody,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Phase 3.8 D — capture-only event helpers. Each one runs the payload
// through redactQaEvent() before posting, so PII keys (email, phone,
// address, name, secret, token) are scrubbed at the source. Failures
// are swallowed: capture is observability, never a request blocker.
export async function captureQaEvent(env: ReportEnv, event: QaTimelineEvent): Promise<void> {
  const safe = redactQaEvent(event);
  await reportToAppApprove(env, {
    path: "qa-event",
    body: {
      type: safe.type,
      message: safe.message,
      occurredAt: safe.occurredAt,
      ...(safe.metadata ? { metadata: safe.metadata } : {}),
    },
  });
}

export async function captureInstall(env: ReportEnv, shop: string): Promise<void> {
  await captureQaEvent(env, {
    type: "qa_install",
    message: "Shop installed: " + shop,
    occurredAt: new Date().toISOString(),
    metadata: { shop },
  });
}

export async function captureSetupStep(
  env: ReportEnv,
  step: string,
  details?: Record<string, string>,
): Promise<void> {
  await captureQaEvent(env, {
    type: "qa_setup_step",
    message: "Setup step completed: " + step,
    occurredAt: new Date().toISOString(),
    metadata: { step, ...(details ?? {}) },
  });
}

export async function captureApiError(
  env: ReportEnv,
  endpoint: string,
  err: unknown,
): Promise<void> {
  await captureQaEvent(env, {
    type: "qa_api_error",
    message: err instanceof Error ? err.message : String(err),
    occurredAt: new Date().toISOString(),
    metadata: { endpoint },
  });
}

export async function captureWebhookError(
  env: ReportEnv,
  topic: string,
  err: unknown,
): Promise<void> {
  await captureQaEvent(env, {
    type: "qa_webhook_error",
    message: err instanceof Error ? err.message : String(err),
    occurredAt: new Date().toISOString(),
    metadata: { topic },
  });
}

export async function captureFrontendError(
  env: ReportEnv,
  message: string,
  details?: Record<string, string>,
): Promise<void> {
  await captureQaEvent(env, {
    type: "qa_frontend_error",
    message,
    occurredAt: new Date().toISOString(),
    metadata: details ?? {},
  });
}
