# Merchant QA + telemetry

This app reports a small set of merchant-QA events to AppApprove so the
project's "Merchant QA" tab shows a live timeline. You don't need to wire
anything for the defaults — they fire automatically. Custom setup steps
(specific to your app's onboarding flow) need a one-line call wherever
you decide the step is "complete".

## What's auto-captured

| Event | When it fires | Source |
|---|---|---|
| \`qa_install\` | OAuth callback completes for a new shop | \`app/routes/auth.callback.tsx\` |
| \`qa_setup_step\` (oauth_complete) | Same — paired with install | \`app/routes/auth.callback.tsx\` |
| \`qa_setup_step\` (billing_activated) | \`app_subscriptions/update\` webhook with status=active | \`app/webhooks/app-subscriptions-update.ts\` |
| \`qa_setup_step\` (qa_page_opened) | Test merchant lands on /qa | \`app/routes/qa.tsx\` |
| \`qa_setup_step\` (qa_feedback_submitted) | Feedback form submission succeeds | \`app/routes/qa.tsx\` |
| \`qa_setup_step\` (sync_backfill_*) | Per (shop, resource) backfill transitions | \`app/crons/sync-backfill.ts\` |
| \`qa_api_error\` | Any Shopify Admin API call (graphql or rest) fails | \`app/lib/shopify-api.server.ts\` (auto-wrapped) |
| \`qa_webhook_error\` | A webhook handler throws | \`app/lib/webhook-router.server.ts\` |
| \`qa_frontend_error\` | The root error boundary catches a render error | \`app/root.tsx\` |

All events route through \`captureQaEvent\` in \`app/lib/merchant-qa.server.ts\`,
which scrubs PII keys (email/phone/address/name/secret/token) before posting
to AppApprove via HMAC-signed POST. The post is non-blocking — failures don't
break the request.

## Adding your own setup steps

Whenever your app reaches a meaningful onboarding milestone, add a one-
line call. The QA timeline will show a "Setup step" badge with your
chosen step ID + metadata.

### Example — settings saved

\`\`\`ts
// app/routes/settings.tsx
import { captureSetupStep } from "~/lib/merchant-qa.server";
import type { Env } from "../../load-context";

export async function action({ request, context }) {
  const env = (context.cloudflare?.env ?? {}) as Env;
  const formData = await request.formData();
  await saveSettings(formData);

  await captureSetupStep(env, "settings_saved", {
    shop,
    field_count: String(formData.entries.length),
  });

  return json({ ok: true });
}
\`\`\`

### Example — third-party integration connected

\`\`\`ts
// app/routes/integrations.klaviyo.tsx (callback after OAuth)
await captureSetupStep(env, "klaviyo_connected", {
  shop,
  list_count: String(lists.length),
});
\`\`\`

## Step-ID conventions

- Use snake_case: \`product_imported\`, \`first_discount_created\`.
- Don't include shop or PII in the step ID itself — pass them in the
  metadata object instead (PII gets auto-redacted there).
- Keep step IDs stable across deploys — they're how the AppApprove
  dashboard groups timelines.

## Shopify Admin API calls

Every \`shopifyAdmin().graphql()\` and \`.rest()\` call (from
\`app/lib/shopify-api.server.ts\`) is auto-wrapped: failures fire
\`captureApiError\` before re-throwing. You don't need to wrap your own
try/catches around API calls — the timeline will show every failure
automatically with the endpoint label and error message.

If you hand-roll a \`fetch()\` against \`*.myshopify.com/admin/...\`,
you bypass the wrapper. Use \`shopifyAdmin\` instead so the failure
timeline stays accurate.

## Privacy + retention

- All metadata strings are scrubbed for keys matching \`/email|phone|
  address|name|secret|token/i\` before send.
- AppApprove retains QA events on the \`project_activity\` table.
- The merchant's deploy secret signs every QA POST. Without
  \`APPAPPROVE_DEPLOY_SECRET\` bound (e.g. self-hosted forks), the
  capture helpers silently no-op so the app still runs.
