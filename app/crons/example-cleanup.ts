import type { CronHandler } from "~/lib/appapprove-config";

// Example cron handler — runs hourly when wired up. To enable:
//   1. Add "0 * * * *": "~/crons/example-cleanup" to appapprove.config.ts `crons`
//   2. Add the same schedule to wrangler.toml [triggers] crons array
//   3. Deploy. AppApprove diffs the two on next deploy and warns on drift.
const handler: CronHandler = async ({ schedule, scheduledAt, context }) => {
  console.log(`[cron] ${schedule} fired at ${new Date(scheduledAt).toISOString()}`);
  void context; // example: read KV / D1 / external APIs via context.cloudflare.env
};

export default handler;
