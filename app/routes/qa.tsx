import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import type { Env } from "../../load-context";
import {
  buildStagingInstallUrl,
  captureSetupStep,
  defaultQaTasks,
  reportToAppApprove,
  type QaAttachment,
} from "~/lib/merchant-qa.server";

// Phase 3.8 B - merchant test-mode page. Renders the task checklist,
// the per-task feedback form, and a one-click staging install link
// when SHOPIFY_API_KEY + a ?store= query param are available. Feedback
// posts to action() below which forwards to AppApprove via the signed
// reportToAppApprove() helper. Without an APPAPPROVE_DEPLOY_SECRET
// binding (e.g. fork without AppApprove integration) the form still
// works locally — it just doesn't reach the AppApprove dashboard.

const MAX_ATTACHMENT_BYTES = 100 * 1024;
const MAX_ATTACHMENTS = 5;

export async function loader({ context, request }: LoaderFunctionArgs) {
  const env = (context.cloudflare?.env ?? {}) as Env;
  const url = new URL(request.url);
  const store = url.searchParams.get("store") ?? "";
  let installUrl: string | null = null;
  if (store && env.SHOPIFY_API_KEY) {
    try {
      installUrl = buildStagingInstallUrl(store, env.SHOPIFY_API_KEY);
    } catch {
      installUrl = null;
    }
  }
  // Phase 3 hardening — fire setup-step on QA page open so the
  // AppApprove timeline shows when test merchants land here.
  await captureSetupStep(env, "qa_page_opened", store ? { store } : {});
  return json({
    tasks: defaultQaTasks(),
    installUrl,
    storeQuery: store,
    appApproveLinked: Boolean(env.APPAPPROVE_DEPLOY_SECRET && env.APPAPPROVE_DEPLOY_URL),
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context.cloudflare?.env ?? {}) as Env;
  const formData = await request.formData();
  const taskId = String(formData.get("taskId") ?? "").slice(0, 80);
  const rating = String(formData.get("rating") ?? "");
  const notes = String(formData.get("notes") ?? "").slice(0, 4000);
  const merchantEmail = String(formData.get("merchantEmail") ?? "").slice(0, 200);

  if (!taskId) return json({ ok: false as const, error: "Pick a task." }, { status: 400 });
  if (!["pass", "blocked", "unclear"].includes(rating)) {
    return json({ ok: false as const, error: "Pick a rating." }, { status: 400 });
  }

  // File attachments — collected as multiple "attachments[]" entries.
  // Anything > MAX_ATTACHMENT_BYTES is dropped (not silently truncated)
  // so the merchant sees a clear "too large" error instead of a corrupt
  // upload landing in the timeline.
  const files = formData.getAll("attachments");
  const attachments: QaAttachment[] = [];
  for (const file of files) {
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return json(
        { ok: false as const, error: file.name + " exceeds the 100KB upload cap." },
        { status: 400 },
      );
    }
    if (attachments.length >= MAX_ATTACHMENTS) {
      return json({ ok: false as const, error: "Maximum 5 attachments per submission." }, { status: 400 });
    }
    const buf = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    attachments.push({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      base64Data: base64,
    });
  }

  const reported = await reportToAppApprove(env, {
    path: "qa-feedback",
    body: {
      taskId,
      rating,
      notes,
      ...(merchantEmail ? { merchantEmail } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      occurredAt: new Date().toISOString(),
    },
  });
  // Phase 3 hardening — fire setup-step on feedback submission so the
  // QA timeline links the feedback row to the implicit "merchant
  // exercised the QA flow" milestone.
  await captureSetupStep(env, "qa_feedback_submitted", { taskId, rating });

  return json({ ok: true as const, reported });
}

export default function QaRoute() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 760 }}>
      <h1>Merchant QA</h1>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Install on a test store</h2>
        <Form method="get" style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            name="store"
            defaultValue={data.storeQuery}
            placeholder="your-test-store.myshopify.com"
            style={{ flex: 1, padding: "0.5rem" }}
            required
          />
          <button type="submit">Build install link</button>
        </Form>
        {data.installUrl ? (
          <p style={{ marginTop: "0.5rem" }}>
            <a href={data.installUrl} target="_blank" rel="noreferrer">Install on {data.storeQuery} ↗</a>
          </p>
        ) : data.storeQuery ? (
          <p style={{ marginTop: "0.5rem", color: "#a00" }}>
            Set SHOPIFY_API_KEY in env or check the store domain (must end in .myshopify.com).
          </p>
        ) : null}
      </section>

      <section>
        <h2>Tasks &amp; feedback</h2>
        <ol>
          {data.tasks.map((task) => (
            <li key={task.id} style={{ marginBottom: "1.5rem" }}>
              <strong>{task.title}</strong>
              <p>{task.expectedResult}</p>
              <Form method="post" encType="multipart/form-data" style={{ display: "grid", gap: "0.5rem", maxWidth: 480 }}>
                <input type="hidden" name="taskId" value={task.id} />
                <label>
                  Rating:
                  <select name="rating" required>
                    <option value="">Choose…</option>
                    <option value="pass">Pass</option>
                    <option value="blocked">Blocked</option>
                    <option value="unclear">Unclear</option>
                  </select>
                </label>
                <label>
                  Notes:
                  <textarea name="notes" rows={3} maxLength={4000} required />
                </label>
                <label>
                  Your email (optional):
                  <input type="email" name="merchantEmail" />
                </label>
                <label>
                  Attach screenshots/logs (≤100KB each, up to 5):
                  <input type="file" name="attachments" multiple />
                </label>
                <button type="submit" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit feedback"}
                </button>
              </Form>
            </li>
          ))}
        </ol>
        {result && "ok" in result ? (
          result.ok ? (
            <p style={{ color: "#080" }}>
              Feedback recorded.{" "}
              {data.appApproveLinked
                ? result.reported
                  ? "Forwarded to AppApprove."
                  : "Could not reach AppApprove (network or auth issue)."
                : "AppApprove not linked — feedback only stored locally."}
            </p>
          ) : (
            <p style={{ color: "#a00" }}>{result.error}</p>
          )
        ) : null}
      </section>
    </main>
  );
}
