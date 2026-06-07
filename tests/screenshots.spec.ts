import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Phase 4 Sprint A — captures listing-screenshot candidates and
// writes them to ./screenshots/ for the post-screenshots ingest
// script to pick up + POST. Surface=embedded-admin.
//
// Specs are baked at scaffold time from the wizard answers; only the
// shots that actually apply to this app are captured. To re-shoot:
// push to main + the CI workflow runs this spec automatically.

interface Spec {
  id: string;
  kind: "admin" | "storefront" | "setup" | "billing" | "mobile";
  route: string;
  label: string;
  capture: "viewport" | "fullPage";
  viewport?: { width: number; height: number };
  requiresEmbeddedSession: boolean;
}

const SPECS: Spec[] = [
  {
    "id": "admin-dashboard",
    "kind": "admin",
    "route": "/",
    "label": "Dashboard",
    "capture": "fullPage",
    "requiresEmbeddedSession": true
  },
  {
    "id": "qa-page",
    "kind": "setup",
    "route": "/qa",
    "label": "Merchant QA / setup checklist",
    "capture": "fullPage",
    "requiresEmbeddedSession": false
  },
  {
    "id": "support-page",
    "kind": "admin",
    "route": "/support",
    "label": "Support + contact",
    "capture": "viewport",
    "requiresEmbeddedSession": false
  },
  {
    "id": "mobile-dashboard",
    "kind": "mobile",
    "route": "/",
    "label": "Dashboard (mobile)",
    "capture": "viewport",
    "viewport": {
      "width": 390,
      "height": 844
    },
    "requiresEmbeddedSession": true
  },
  {
    "id": "settings",
    "kind": "admin",
    "route": "/settings",
    "label": "Settings",
    "capture": "fullPage",
    "requiresEmbeddedSession": true
  }
];
const OUT_DIR = "screenshots";

function buildUrl(baseUrl: string, route: string, embedded: boolean): string {
  const url = new URL(route, baseUrl);
  if (embedded) {
    // Embedded routes need shop= + host= — App Bridge crashes
    // without them. Sentinel values let the route render.
    url.searchParams.set(
      "shop",
      process.env.PLAYWRIGHT_SHOP ?? "appapprove-test.myshopify.com",
    );
    url.searchParams.set(
      "host",
      process.env.PLAYWRIGHT_HOST ??
        "YXBwYXBwcm92ZS10ZXN0Lm15c2hvcGlmeS5jb20vYWRtaW4=",
    );
  }
  // Phase 7 E3 — always add ?preview=1. Combined with PREVIEW_MODE=1
  // env (only set on the preview Worker built in 7 E2), this triggers
  // the auth-bypass + GraphQL short-circuit so screenshots show the
  // real Polaris admin UI with mock fixtures instead of OAuth-redirect
  // pages. On production deploys the preview-mode Worker isn't reached
  // so this query param is a no-op.
  url.searchParams.set("preview", "1");
  return url.toString();
}

mkdirSync(OUT_DIR, { recursive: true });

for (const spec of SPECS) {
  test("capture " + spec.id, async ({ page }) => {
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8788";
    if (spec.viewport) {
      await page.setViewportSize(spec.viewport);
    } else {
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    await page.goto(buildUrl(baseUrl, spec.route, spec.requiresEmbeddedSession));
    // Body present is the minimum proof the route rendered. We
    // continue even on application errors — better to capture the
    // error state for the user to review than silently skip.
    await expect(page.locator("body")).toBeVisible();
    const buf = await page.screenshot({
      fullPage: spec.capture === "fullPage",
      type: "png",
    });
    const filename = spec.id + ".png";
    writeFileSync(join(OUT_DIR, filename), buf);
    // Sidecar JSON manifest entry — picked up by the post script.
    const manifestEntry = {
      id: spec.id,
      kind: spec.kind,
      filename,
      label: spec.label,
      capture: spec.capture,
      viewport: spec.viewport ?? { width: 1280, height: 800 },
      bytes: buf.length,
    };
    writeFileSync(
      join(OUT_DIR, spec.id + ".json"),
      JSON.stringify(manifestEntry, null, 2),
    );
  });
}
