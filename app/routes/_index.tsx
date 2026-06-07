import { redirect, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/cloudflare";

export const meta: MetaFunction = () => [
  { title: "Store FAQ" },
  {
    name: "description",
    content:
      "Store FAQ is a Shopify App that runs inside your store's admin. Install via Shopify admin → Apps to enable it on your storefront.",
  },
];

// F-NEW-V + F-NEW-AM + F-NEW-AP — Shopify / entry routing.
//
// Three disjoint scenarios hit /:
//   (1) App Store "Add app" / first install: ?shop=&hmac=&host=&timestamp=
//       Signed by Shopify; we MUST redirect to /auth immediately or the
//       reviewer flags "app must request install immediately when Add
//       app is clicked" (shopify-check install-flow).
//   (2) Embedded admin entry (Shopify Partner's application_url = root):
//       Shopify renders the app iframe with ?shop=&host= (no hmac). The
//       host param is the canonical embedded-context signal. We MUST
//       redirect to /app (where the Polaris admin shell lives), or
//       the merchant sees the marketing landing copy instead of the
//       actual app.
//   (3) Marketing visit / direct URL hit (no params at all): render the
//       marketing index (this component).
//
// Post-OAuth callback land-back is folded into (2): the callback
// redirects to /?shop=&host= which now goes to /app like any other
// embedded entry — no special handling needed.
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const hmac = url.searchParams.get("hmac");
  const host = url.searchParams.get("host");
  if (shop && hmac) {
    return redirect(`/auth?shop=${encodeURIComponent(shop)}`);
  }
  if (host) {
    const params = new URLSearchParams();
    if (shop) params.set("shop", shop);
    params.set("host", host);
    return redirect(`/app?${params.toString()}`);
  }
  return null;
}

export default function Index() {
  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "linear-gradient(180deg, #fafafa 0%, #f0f0f0 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "#fff",
          padding: "2.5rem 2rem",
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.75rem", fontWeight: 600 }}>
          Store FAQ
        </h1>
        <p style={{ margin: "0 0 1.75rem", color: "#666", fontSize: "0.95rem", lineHeight: 1.5 }}>
          Install on your Shopify store to start using Store FAQ.
        </p>
        <form method="get" action="/auth" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <label htmlFor="shop" style={{ fontSize: "0.85rem", fontWeight: 500, color: "#333" }}>
            Your Shopify store URL
          </label>
          <input
            id="shop"
            name="shop"
            type="text"
            pattern="[a-z0-9][a-z0-9-]*\\.myshopify\\.com"
            placeholder="your-store.myshopify.com"
            required
            autoFocus
            style={{
              padding: "0.7rem 0.85rem",
              fontSize: "0.95rem",
              border: "1px solid #d0d0d0",
              borderRadius: 6,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "0.75rem",
              fontSize: "0.95rem",
              fontWeight: 500,
              color: "#fff",
              background: "#008060",
              border: 0,
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Install Store FAQ
          </button>
        </form>
        <p style={{ margin: "1.5rem 0 0", fontSize: "0.8rem", color: "#999", textAlign: "center" }}>
          Already installed? Open from your Shopify admin → Apps.
        </p>
      </div>
    </main>
  );
}
