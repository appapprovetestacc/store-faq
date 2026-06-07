#!/usr/bin/env bash
# AppApprove Playwright result ingest. Reads playwright-results.json
# (Playwright --reporter=json output), summarises pass/fail counts,
# signs the body with HMAC-SHA256(APPAPPROVE_DEPLOY_SECRET, body), and
# POSTs to /api/playwright-results/<slug>. Non-fatal — a missing
# secret or failed POST still lets the deploy succeed.
set -euo pipefail

if [ -z "${DEPLOY_URL:-}" ] || [ -z "${DEPLOY_SECRET:-}" ] || [ -z "${PROJECT_SLUG:-}" ]; then
  echo "[appapprove] DEPLOY_URL / DEPLOY_SECRET / PROJECT_SLUG unset — skipping ingest"
  exit 0
fi
if [ ! -f playwright-results.json ]; then
  echo "[appapprove] playwright-results.json missing — skipping ingest"
  exit 0
fi

SUMMARY=$(node .github/scripts/post-playwright-summary.mjs)
SIG=$(printf '%s' "${SUMMARY}" | openssl dgst -sha256 -hmac "${DEPLOY_SECRET}" | awk '{print $2}')

curl -fsSL -X POST \
  -H "Content-Type: application/json" \
  -H "X-AppApprove-Signature: sha256=${SIG}" \
  --data "${SUMMARY}" \
  "${DEPLOY_URL%/}/api/playwright-results/${PROJECT_SLUG}" \
  || echo "[appapprove] playwright ingest failed (non-fatal)"
