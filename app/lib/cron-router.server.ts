import type { AppLoadContext } from "@remix-run/cloudflare";
import type { CronHandler } from "./appapprove-config";
import config from "../../appapprove.config";

// Lazy-loaded handlers — Vite/Wrangler bundle each on first dispatch.
// AppApprove's codegen pipeline rewrites this map at build time from
// appapprove.config.ts `crons` so the static import paths line up with
// what the bundler expects (it can't follow dynamic imports built from
// runtime config).
const HANDLERS: Record<string, () => Promise<{ default: CronHandler }>> = {
  // Example — uncomment after adding the schedule to wrangler.toml [triggers]:
  // "0 * * * *": () => import("../crons/example-cleanup"),
  "0 8 * * *": () => import("../crons/gdpr-deadline-check"),
};

// CF Workers `scheduled` event entry point. Wire this from your Worker's
// top-level scheduled export (Sprint 29.5 ships the wrapper that
// re-exports Remix's default + adds scheduled). Until then, copy the
// dispatchScheduled signature into a separate cron-only Worker if you
// need crons before the wrapper lands:
//
//   export default {
//     async scheduled(event, env, ctx) {
//       await dispatchScheduled(event, { cloudflare: { env, ctx } });
//     }
//   }
export async function dispatchScheduled(
  event: { cron: string; scheduledTime: number },
  context: AppLoadContext,
): Promise<void> {
  const loadHandler = HANDLERS[event.cron];
  if (!loadHandler) {
    console.warn(`[cron] no handler registered for "${event.cron}"`);
    return;
  }
  const mod = await loadHandler();
  await mod.default({
    schedule: event.cron,
    scheduledAt: event.scheduledTime,
    context,
  });
}

// Touch `config` so the unused-import linter doesn't strip it. The build
// pipeline reads this same module at deploy time to wire HANDLERS above.
void config;
