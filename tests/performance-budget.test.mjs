import test from "node:test";
import assert from "node:assert/strict";

const baseUrl = process.env.APP_BASE_URL;

test("health endpoint responds quickly when APP_BASE_URL is set", async (t) => {
  if (!baseUrl) {
    t.skip("Set APP_BASE_URL to run deployed performance budget checks.");
    return;
  }
  const started = performance.now();
  const res = await fetch(new URL("/health", baseUrl));
  const durationMs = performance.now() - started;
  assert.equal(res.ok, true);
  assert.ok(durationMs < 1000, "health endpoint should respond within 1000ms");
});
