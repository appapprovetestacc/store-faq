import { json, type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

export function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env ?? {};
  const d1Ready = Boolean(env.D1);
  return json({
    components: [
      { name: "Embedded app", status: "ok", detail: "Admin entry route is deployed." },
      { name: "Webhooks", status: "ok", detail: "Webhook router is deployed." },
      {
        name: "D1 data store",
        status: d1Ready ? "ok" : "warning",
        detail: d1Ready ? "D1 binding is present." : "D1 binding is not configured.",
      },
      { name: "Billing", status: "ok", detail: "Billing route is deployed." },
    ],
    checkedAt: new Date().toISOString(),
    ingestUrl: env.STATUS_INGEST_URL ?? null,
  });
}

export default function PublicStatusRoute() {
  const { components, checkedAt, ingestUrl } = useLoaderData<typeof loader>();
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 860 }}>
      <h1>Status</h1>
      <p>Last checked: {checkedAt}</p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "left" }}>Component</th>
            <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "left" }}>Status</th>
            <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "left" }}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {components.map((component: { name: string; status: string; detail: string }) => (
            <tr key={component.name}>
              <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>{component.name}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>{component.status}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>{component.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ingestUrl ? (
        <p>
          <a href={ingestUrl}>AppApprove monitor ingest endpoint</a>
        </p>
      ) : null}
    </main>
  );
}
