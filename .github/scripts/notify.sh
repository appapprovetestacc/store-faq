#!/usr/bin/env bash
# AppApprove deploy callback. Called from .github/workflows/deploy.yml at
# each lifecycle stage. Skips silently if the AppApprove URL/secret aren't
# wired up so the build still succeeds in self-hosted forks.
set -euo pipefail

STATUS="${1:-}"
DEPLOYED_URL="${2:-}"

if [ -z "${DEPLOY_URL:-}" ] || [ -z "${DEPLOY_SECRET:-}" ]; then
  echo "[appapprove] DEPLOY_URL or DEPLOY_SECRET unset — skipping callback"
  exit 0
fi
if [ -z "${APPAPPROVE_PROJECT_ID:-}" ]; then
  echo "[appapprove] APPAPPROVE_PROJECT_ID unset — skipping callback"
  exit 0
fi

BODY=$(cat <<JSON
{"commit_sha":"${GITHUB_SHA:-}","status":"${STATUS}","deployed_url":"${DEPLOYED_URL}","run_id":"${GITHUB_RUN_ID:-}","actor":"${GITHUB_ACTOR:-}","branch":"${GITHUB_REF_NAME:-main}"}
JSON
)

SIG=$(printf '%s' "${BODY}" | openssl dgst -sha256 -hmac "${DEPLOY_SECRET}" | awk '{print $2}')

# -L follows 308/301 redirects (Vercel emits one when DEPLOY_URL is the
# apex but production lives at the www subdomain). Without -L curl prints
# the redirect body ("Redirecting...") and exits 0, silently swallowing
# the callback. 308 preserves POST + body, so the HMAC stays valid on
# the re-issued request.
curl -fsSL -X POST \
  -H "Content-Type: application/json" \
  -H "X-AppApprove-Signature: sha256=${SIG}" \
  --data "${BODY}" \
  "${DEPLOY_URL%/}/api/deploy-callback/${APPAPPROVE_PROJECT_ID}" \
  || echo "[appapprove] callback for status=${STATUS} failed (non-fatal)"
