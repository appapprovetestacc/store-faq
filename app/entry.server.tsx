import type { AppLoadContext, EntryContext } from "@remix-run/cloudflare";
import { RemixServer } from "@remix-run/react";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const body = await renderToReadableStream(
    <RemixServer context={remixContext} url={request.url} />,
    {
      signal: request.signal,
      onError(error: unknown) {
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  if (isbot(request.headers.get("user-agent") ?? "")) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  // F-NEW-S/T/U — security headers required by shopify-check.
  // CSP frame-ancestors limits where the embedded admin can be framed
  // (Shopify admin only). HSTS enforces HTTPS for repeat visitors.
  // nosniff blocks MIME-sniffing attacks on static assets.
  // F-NEW-Y Layer 2 — also allow https://appapprove.com (the landing-
  // app parent origin) so the iterate-page iframe can embed this app
  // for live preview. `*.appapprove.com` covers preview subdomains
  // (e.g. PR previews on Vercel). Without this allowlist the browser
  // blocks the iframe with "Refused to frame … because an ancestor
  // violates the following Content Security Policy directive".
  responseHeaders.set(
    "Content-Security-Policy",
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://appapprove.com https://*.appapprove.com",
  );
  responseHeaders.set("Strict-Transport-Security", "max-age=15768000; includeSubDomains");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
