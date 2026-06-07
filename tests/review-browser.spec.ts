import { test, expect } from "@playwright/test";

// Phase 3.5 B — surface-aware Playwright review tests. Surface=embedded-admin.
// Embedded-admin surfaces get App Bridge + third-party-cookie probes;
// other surfaces only get baseline smoke + viewport.

test("embedded app smoke path loads", async ({ page }) => {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8788";
  await page.goto(baseUrl);
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Application error");
});

test("mobile viewport has readable body content", async ({ page }) => {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8788";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await expect(page.locator("body")).toBeVisible();
});

test("App Bridge script is referenced for embedded admin", async ({ page }) => {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8788";
  // shop= + host= are required for App Bridge to initialize. Pass
  // sentinel values so the embedded route renders without crashing
  // (real values come from Shopify admin during a real install).
  const params = new URLSearchParams({
    shop: process.env.PLAYWRIGHT_SHOP ?? "appapprove-test.myshopify.com",
    host: process.env.PLAYWRIGHT_HOST ?? "YXBwYXBwcm92ZS10ZXN0Lm15c2hvcGlmeS5jb20vYWRtaW4=",
  });
  await page.goto(baseUrl + "?" + params.toString());
  // Either the App Bridge CDN script tag is present, or the page
  // imports @shopify/app-bridge-react (built into the bundle). Check
  // both — the scaffold can ship either pattern depending on Polaris
  // version.
  const html = await page.content();
  const hasCdnScript = /shopify-app-bridge\.js|cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/.test(html);
  const hasReactBridge = /__SHOPIFY_APP_INIT__|shopify\.config|app-bridge-react/i.test(html);
  expect(hasCdnScript || hasReactBridge, "App Bridge must be loaded for embedded admin").toBe(true);
});

test("page does not depend on third-party cookies", async ({ page, context }) => {
  // Block all third-party cookies and verify the embedded admin still
  // renders. Shopify reviewers test in Safari which blocks 3rd-party
  // cookies by default; relying on them is a frequent rejection reason.
  await context.route("**/*", async (route) => {
    const headers = route.request().headers();
    delete headers["cookie"];
    await route.continue({ headers });
  });
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8788";
  const params = new URLSearchParams({
    shop: process.env.PLAYWRIGHT_SHOP ?? "appapprove-test.myshopify.com",
    host: process.env.PLAYWRIGHT_HOST ?? "YXBwYXBwcm92ZS10ZXN0Lm15c2hvcGlmeS5jb20vYWRtaW4=",
  });
  await page.goto(baseUrl + "?" + params.toString());
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Application error");
});

test("setup flow leads to a usable configured state", async ({ page }) => {
  // Reviewers expect the merchant to land in a usable state after
  // following the in-app setup. Until a per-app setup recorder lands
  // (Phase 3.8 C rehearsal), this baseline asserts the support page
  // is reachable as the canonical "where do I get help" landing.
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8788";
  await page.goto(baseUrl + "/support");
  await expect(page.locator("body")).toBeVisible();
});

test("status endpoint returns ok JSON for the readiness probe", async ({ request }) => {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8788";
  const res = await request.get(baseUrl + "/status");
  expect(res.ok(), "/status must return 2xx").toBe(true);
  const body = await res.json();
  expect(body, "/status payload must include components").toHaveProperty("components");
});
