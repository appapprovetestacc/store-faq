import type { LoaderFunctionArgs } from "@remix-run/cloudflare";

export function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env ?? {};
  const d1Ready = Boolean(env.D1);
  return Response.json({
    status: d1Ready ? "ok" : "warning",
    components: [
      { name: "embedded_app", status: "ok" },
      { name: "webhooks", status: "ok" },
      {
        name: "d1",
        status: d1Ready ? "ok" : "warning",
        detail: d1Ready
          ? "D1 binding is present."
          : "D1 binding is not configured; sync-backed features should use an external DB or add a D1 binding before launch.",
      },
      { name: "billing", status: "ok" },
    ],
    checkedAt: new Date().toISOString(),
  });
}
