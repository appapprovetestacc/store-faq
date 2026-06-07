# Store FAQ

Shopify App scaffolded by [AppApprove](https://appapprove.com). Built on
Remix + Cloudflare Workers.

## Local development

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Deploy

This repo is automatically deployed by AppApprove on every push to `main`.
Your live URL is `https://store-faq.appapprove.app`.

## What's in here

- `app/` - Remix routes and components
- `app/webhooks/` - Shopify webhook handlers (HMAC-verified by app/lib/webhook-router.server.ts)
- `app/crons/` - CF Cron Trigger handlers (dispatched by app/lib/cron-router.server.ts)
- `app/lib/review-evidence.ts` - reviewer setup, screencast, credential, and data-retention checklist
- `app/lib/sync.server.ts` - starter helpers for GraphQL backfill, webhook upserts, and replay-safe sync
- `extensions/` - editable theme app extension and Shopify Function starters
- `tests/` - generated review and webhook smoke tests
- `shopify.app.toml` - Shopify App configuration. Apply it to your Partner Dashboard yourself (or run `shopify app deploy`) - AppApprove does not sync it for you.
- `appapprove.config.ts` - webhook routes, cron handlers, build hooks, env mapping
- `pricing.yaml` - declarative billing plans
- `wrangler.toml` - Cloudflare Workers runtime config

## Background jobs

Cron schedules and CF Queues are declared in two places that must stay
in sync: `appapprove.config.ts` (handler dispatch) and `wrangler.toml`
(`[triggers]` + `[[queues.*]]`). The deploy pipeline diffs the two on
every push and warns when they drift.

To add an hourly cleanup job:

1. `app/crons/cleanup.ts` - write your handler (see `example-cleanup.ts`)
2. `appapprove.config.ts` - add `"0 * * * *": "~/crons/cleanup"` to `crons`
3. `wrangler.toml` - uncomment `[triggers]` and add the same schedule

Edit anything you like. Open the project in AppApprove's hosted Iterate
for AI-assisted changes with live preview.
