import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Phase 3.5 A — vertical-aware review smoke tests. Generated from
// wizard answers (surface=embedded-admin, pricingMode=free,
// features=[admin-ui], sync=[]).
// The required-files list and the optional billing/sync/surface
// blocks below are tailored to what THIS app actually ships.

const requiredFiles = [
  "shopify.app.toml",
  "appapprove.config.ts",
  "pricing.yaml",
  "app/lib/shopify.server.ts",
  "app/lib/gdpr.server.ts",
  "app/lib/review-evidence.ts",
  "app/routes/health.tsx",
  "app/routes/status.tsx",
  "app/routes/privacy.tsx",
  "app/routes/support.tsx",
  "app/routes/version.tsx",
  "app/routes/qa.tsx",
  "app/routes/auth._index.tsx",
  "app/routes/auth.callback.tsx",
  "app/routes/_index.tsx"
];

test("review-critical files exist", () => {
  for (const path of requiredFiles) {
    assert.equal(existsSync(path), true, path + " should exist");
  }
});

test("shopify app config declares a modern api version", () => {
  const toml = readFileSync("shopify.app.toml", "utf8");
  assert.match(toml, /api_version\s*=\s*"20(2[5-9]|[3-9]\d)-/);
});

test("declared scopes are explicit", () => {
  const toml = readFileSync("shopify.app.toml", "utf8");
  assert.match(toml, /scopes\s*=\s*"[^"]+"/);
});

test("OAuth install + callback routes are wired", () => {
  assert.equal(existsSync("app/routes/auth._index.tsx"), true, "/auth start route");
  assert.equal(existsSync("app/routes/auth.callback.tsx"), true, "/auth callback route");
  const callback = readFileSync("app/routes/auth.callback.tsx", "utf8");
  assert.match(callback, /verifyOAuthHmac/);
  assert.match(callback, /exchangeCodeForOfflineToken/);
});

test("OAuth callback persists the offline session for reinstall coverage", () => {
  const callback = readFileSync("app/routes/auth.callback.tsx", "utf8");
  assert.match(callback, /saveOfflineSession/);
});

test("uninstall flow advertises GDPR redact + revoke handling to merchants", () => {
  const uninstall = existsSync("app/routes/uninstall.tsx");
  if (!uninstall) {
    // Older scaffolds bundled the copy into /support; tolerate either path.
    const support = readFileSync("app/routes/support.tsx", "utf8");
    assert.match(support, /uninstall|redact|delete/i);
    return;
  }
  const body = readFileSync("app/routes/uninstall.tsx", "utf8");
  assert.match(body, /redact|delete|cleanup/i);
});

test("shopify.app.toml declares embedded=true for the embedded admin surface", () => {
  const toml = readFileSync("shopify.app.toml", "utf8");
  assert.match(toml, /embedded\s*=\s*true/);
});
