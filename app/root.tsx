import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "@remix-run/react";
import { useEffect } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Store FAQ</title>
        <Meta />
        <Links />
        {/* F-NEW-AS — Shopify App Bridge MUST be the first <script>
            tag and live in <head>. Loading it from <body> with
            `defer` (the pre-F-NEW-AS shape) makes App Bridge abort
            with "must be included as the first <script> tag … Do not
            use async, defer or type=module", which leaves
            window.shopify undefined and breaks embedded admin
            navigation. The shopify-api-key meta tag is rendered by
            child routes (`/app`) via the per-route meta export and
            appears above this script through <Meta />. */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

// Phase 3.8 D + F2-10 (2026-05-15) — frontend error boundary. Posts
// a redacted error report to /qa/error-report on mount; the route
// forwards to AppApprove via captureFrontendError(). Failures are
// swallowed — the merchant still sees the inline fallback either way.
//
// F2-10: payload now includes status/statusText (for RouteErrorResponse,
// since Remix uses these as the *real* error signal), error.cause if
// present, and userAgent. The QA route adds server-side context (env
// presence flags, request URL) before forwarding to AppApprove. Without
// this, the only signal an operator gets is "Unexpected Server Error"
// + a 6-line generic stack — F2-06 + F2-07 each cost ~30min of
// Vercel-log-roundtrips because of this.
export function ErrorBoundary() {
  const error = useRouteError();
  const isRouteResp = isRouteErrorResponse(error);
  const message = isRouteResp
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;
  const cause =
    error instanceof Error && error.cause
      ? typeof error.cause === "string"
        ? error.cause
        : (error.cause as Error)?.message ?? String(error.cause)
      : undefined;
  const status = isRouteResp ? error.status : undefined;
  const statusText = isRouteResp ? error.statusText : undefined;
  // RouteErrorResponse from a server-thrown Response often carries the
  // real error message in .data — surface it so operators see "Missing
  // session token" instead of just "401 Unauthorized".
  const responseData =
    isRouteResp && typeof error.data === "string" ? error.data : undefined;

  useEffect(() => {
    fetch("/qa/error-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        ...(typeof window !== "undefined" ? { url: window.location.href } : {}),
        ...(stack ? { stack } : {}),
        ...(cause ? { cause } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(statusText ? { statusText } : {}),
        ...(responseData ? { responseData } : {}),
        ...(typeof navigator !== "undefined" && navigator.userAgent
          ? { userAgent: navigator.userAgent.slice(0, 200) }
          : {}),
      }),
    }).catch(() => {});
  }, [message, stack, cause, status, statusText, responseData]);

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 720 }}>
      <h1>Something went wrong.</h1>
      <p>{message}</p>
      <p style={{ color: "#666", fontSize: "0.875rem" }}>
        The error has been reported. Reload the page or contact support if the issue persists.
      </p>
    </main>
  );
}
