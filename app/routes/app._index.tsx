import {
  type LoaderFunctionArgs,
  type MetaFunction,
  json,
} from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

// F-NEW-AR — base /app embedded-admin shell. Renders an auth-free
// page on the FIRST top-level navigation from Shopify admin (which
// has no Authorization header — auth.admin would throw 401). App
// Bridge then re-fetches child routes with the session token via
// XHR; those child routes do the real auth. Customer iterations
// replace this with a Polaris dashboard.
//
// Loader exposes ?shop + the SHOPIFY_API_KEY so the meta tag App
// Bridge looks for renders with the correct value. apiKey is the
// public OAuth client_id — already exposed by every embedded Shopify
// app + safe to render in HTML.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const env = context.cloudflare?.env;
  return json({
    shop,
    projectName: "Store FAQ",
    apiKey: env?.SHOPIFY_API_KEY ?? "",
  });
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: "Store FAQ" },
  // App Bridge meta tag — the CDN script reads this to know which
  // app it's bootstrapping for. Required by Shopify reviewer checks
  // for any embedded app entry.
  { name: "shopify-api-key", content: data?.apiKey ?? "" },
];

export default function AppIndex() {
  const { shop, projectName } = useLoaderData<typeof loader>();
  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "2rem",
        maxWidth: 720,
        margin: "0 auto",
        color: "#1a1a1a",
      }}
    >
      <h1 style={{ marginTop: 0, fontSize: "1.6rem", fontWeight: 600 }}>
        {projectName}
      </h1>
      {shop ? (
        <p style={{ color: "#555", fontSize: "0.95rem", margin: "0 0 1.5rem" }}>
          Installed on <strong>{shop}</strong>.
        </p>
      ) : null}
      <p style={{ color: "#444", fontSize: "0.95rem", lineHeight: 1.5 }}>
        This app is installed and ready. Configure your settings or open the
        features below as they are added.
      </p>
      {/* F-NEW-AS — App Bridge CDN script lives in root.tsx <head>
          (first <script> tag, no defer/async/type=module). Loading it
          from <body> with defer makes App Bridge abort with
          "must be included as the first <script> tag" + leaves
          window.shopify undefined. */}
    </main>
  );
}
