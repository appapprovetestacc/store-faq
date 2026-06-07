import type { WebhookHandler } from "~/lib/appapprove-config";
import type { Env } from "../../load-context";
import { recordActivation } from "~/lib/trial.server";
import { captureSetupStep } from "~/lib/merchant-qa.server";

interface SubscriptionUpdatePayload {
  app_subscription: {
    admin_graphql_api_id: string;
    name: string;
    status: string;
    trial_days: number | null;
    created_at: string;
  };
}

const handler: WebhookHandler = async ({ shop, payload, context }) => {
  const sub = (payload as SubscriptionUpdatePayload).app_subscription;
  if (!sub) {
    return new Response("Bad payload", { status: 400 });
  }
  await recordActivation(context, {
    shop,
    subscriptionId: sub.admin_graphql_api_id,
    planName: sub.name,
    status: sub.status,
    trialDays: sub.trial_days,
    recordedAt: Date.now(),
  });
  // Phase 3 hardening — fire setup-step on billing activation so the
  // AppApprove QA timeline shows when each merchant moves from "free /
  // trial" to a real subscription. Status filter excludes pending/
  // declined/cancelled — only the active transitions count as setup.
  if (sub.status === "ACTIVE" || sub.status === "active") {
    const env = (context.cloudflare?.env ?? {}) as Env;
    await captureSetupStep(env, "billing_activated", {
      shop,
      plan: sub.name,
      trialDays: String(sub.trial_days ?? 0),
    });
  }
  return new Response("OK", { status: 200 });
};

export default handler;
