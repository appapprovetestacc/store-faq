import { type PlatformProxy } from "wrangler";

type Cloudflare = Omit<PlatformProxy<Env>, "dispose">;

declare module "@remix-run/cloudflare" {
  interface AppLoadContext {
    cloudflare: Cloudflare;
  }
}

export interface Env {
  APPAPPROVE_PROJECT_SLUG: string;
  SHOPIFY_API_KEY?: string;
  SHOPIFY_API_SECRET?: string;
  SHOPIFY_APP_URL?: string;
  SCOPES?: string;
  SUPPORT_EMAIL?: string;
  EMERGENCY_CONTACT_EMAIL?: string;
  DPA_CONTACT_NAME?: string;
  DPA_CONTACT_EMAIL?: string;
  DATA_DELETION_INSTRUCTIONS_URL?: string;
  STATUS_INGEST_URL?: string;
  // Cloudflare KV namespace for Shopify session storage. Bind in wrangler.toml:
  //   [[kv_namespaces]]
  //   binding = "SESSIONS"
  //   id = "<your KV namespace id>"
  SESSIONS?: KVNamespace;
  // Cloudflare KV namespace for the GDPR audit log. Bind separately so
  // session secrets and compliance records have isolated retention policies.
  GDPR_AUDIT?: KVNamespace;
  // Phase 3.8 B + D — outbound link to AppApprove for QA feedback +
  // event ingest. Both are pushed by the AppApprove deploy pipeline at
  // provisioning time (mirroring APPAPPROVE_DEPLOY_SECRET from the
  // deploy-callback flow). Without them bound, reportToAppApprove()
  // silently no-ops so forks of the scaffold keep working stand-alone.
  APPAPPROVE_DEPLOY_URL?: string;
  APPAPPROVE_DEPLOY_SECRET?: string;
  // Phase 7 E1 — preview-mode flag, set ONLY on the per-project
  // preview Worker (appapprove-app-{slug}-preview). On the prod
  // Worker (appapprove-app-{slug}) this is undefined so the
  // preview-mode auth-bypass + GraphQL short-circuit are unreachable.
  PREVIEW_MODE?: "0" | "1";
  // Phase 7 C3 — mail sender (BYOK Resend path). Customer sets via
  // /app/<slug>/settings/env. When unset, app/lib/mail.server.ts
  // falls back to the AppApprove default sender via /api/mail/send
  // proxy (forced from = noreply-{slug}@apps.appapprove.com).
  RESEND_API_KEY?: string;
  MAIL_SENDER_FROM?: string;
  // Phase 10 B — per-project HMAC secret used by app/lib/error-reporter.server.ts
  // to sign POSTs to AppApprove's /api/v1/error-report. Provisioned at
  // project-create + pushed via wrangler secret put on every deploy.
  // Undefined means the reporter no-ops (pre-Phase-10-B projects before
  // the next re-provisioning of repo secrets).
  APP_APPROVE_PROJECT_SECRET?: string;
  // Optional Cloudflare bindings — declared here so AI-generated routes
  // that reference env.D1 / env.R2 / env.QUEUE / env.MY_DO compile cleanly
  // even when the user hasn't yet bound them in wrangler.toml. Bindings
  // that are unbound at runtime are `undefined`; route code that uses
  // them must defensively check first or the user will see a runtime error.
  // To activate: add the matching block to wrangler.toml:
  //   [[d1_databases]] / [[r2_buckets]] / [[queues.producers]] /
  //   [[durable_objects.bindings]]
  D1?: D1Database;
  R2?: R2Bucket;
  QUEUE?: Queue;
  // Phase 7.1 C — user-provided env vars (BYOK-UI). Customers paste
  // RESEND_API_KEY / SENTRY_DSN / KLAVIYO_API_KEY etc. in
  // /app/[slug]/settings/env on AppApprove. The deploy workflow reads
  // them via /api/internal/projects/[slug]/env-vars/manifest + pushes
  // each as a Worker secret via wrangler secret put before the deploy.
  // The index signature lets AI-generated route code reference any
  // env.WHATEVER_KEY without per-deploy codegen — at the cost of less
  // strict typing for user-provided keys (acceptable trade-off).
  [key: string]: string | undefined | KVNamespace | D1Database | R2Bucket | Queue;
}
