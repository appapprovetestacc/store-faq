import type { CronHandler } from "~/lib/appapprove-config";
import type { Env } from "../../load-context";
import {
  type AuditEntry,
  GDPR_WARN_THRESHOLD_MS,
} from "~/lib/gdpr.server";

// Daily scan of the GDPR audit KV. Lists all in-flight requests and
// flags ones whose 30-day deadline is less than 7 days away. Output is
// console.warn so it surfaces in the CF Workers logs / your log drain.
//
// Replace the warn() with a call into your own alerting (PagerDuty,
// Slack webhook, ticket creation) once you have that wired up.
const handler: CronHandler = async ({ context, scheduledAt }) => {
  const env = (context.cloudflare?.env ?? {}) as Env;
  const ns = env.GDPR_AUDIT;
  if (!ns) {
    console.warn("[gdpr-deadline-check] GDPR_AUDIT KV not bound — skipping");
    return;
  }
  const now = scheduledAt ?? Date.now();
  const cursor: string | undefined = undefined;
  let scanned = 0;
  let openRequests = 0;
  let warned = 0;
  let breached = 0;
  let listCursor: string | undefined = cursor;
  // KV list returns up to 1000 keys per page; loop with cursor for safety.
  do {
    const page: { keys: Array<{ name: string }>; list_complete: boolean; cursor?: string } =
      await ns.list({ prefix: "audit:", cursor: listCursor });
    for (const k of page.keys) {
      scanned++;
      const raw = await ns.get(k.name);
      if (!raw) continue;
      let entry: AuditEntry;
      try {
        entry = JSON.parse(raw) as AuditEntry;
      } catch {
        continue;
      }
      if (entry.completedAt !== null) continue;
      openRequests++;
      const remaining = entry.deadlineAt - now;
      if (remaining <= 0) {
        breached++;
        console.error(
          `[gdpr-deadline-check] BREACHED: ${entry.topic} for ${entry.shop} (received ${new Date(entry.receivedAt).toISOString()}, deadline ${new Date(entry.deadlineAt).toISOString()})`,
        );
      } else if (remaining <= GDPR_WARN_THRESHOLD_MS) {
        warned++;
        const days = Math.ceil(remaining / 86_400_000);
        console.warn(
          `[gdpr-deadline-check] T-${days}d: ${entry.topic} for ${entry.shop} (deadline ${new Date(entry.deadlineAt).toISOString()})`,
        );
      }
    }
    listCursor = page.list_complete ? undefined : page.cursor;
  } while (listCursor);

  console.log(
    `[gdpr-deadline-check] scanned=${scanned} open=${openRequests} warn=${warned} breached=${breached}`,
  );
};

export default handler;
