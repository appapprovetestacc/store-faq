#!/usr/bin/env bash
# AppApprove screenshot ingest. For each .png in screenshots/, reads
# the sidecar .json metadata, signs the body with HMAC-SHA256(DEPLOY_SECRET),
# and POSTs as multipart/form-data to /api/screenshots/<slug>.
set -euo pipefail

if [ -z "${DEPLOY_URL:-}" ] || [ -z "${DEPLOY_SECRET:-}" ] || [ -z "${PROJECT_SLUG:-}" ]; then
  echo "[appapprove] DEPLOY_URL / DEPLOY_SECRET / PROJECT_SLUG unset — skipping screenshot ingest"
  exit 0
fi
if [ ! -d screenshots ]; then
  echo "[appapprove] screenshots/ missing — nothing to ingest"
  exit 0
fi

shopt -s nullglob
PNGS=(screenshots/*.png)
if [ ${#PNGS[@]} -eq 0 ]; then
  echo "[appapprove] no screenshots captured — skipping"
  exit 0
fi

UPLOAD_URL="${DEPLOY_URL%/}/api/screenshots/${PROJECT_SLUG}"
for PNG in "${PNGS[@]}"; do
  ID=$(basename "${PNG}" .png)
  META="screenshots/${ID}.json"
  if [ ! -f "${META}" ]; then
    echo "[appapprove] missing ${META} for ${ID} — skipping"
    continue
  fi
  KIND=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${META}','utf8')).kind || 'admin')")
  LABEL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${META}','utf8')).label || '${ID}')")
  WIDTH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${META}','utf8')).viewport?.width || '')")
  HEIGHT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${META}','utf8')).viewport?.height || '')")

  # Build multipart body manually so we can compute HMAC over the
  # exact octets curl will send. Boundary is 32 hex chars.
  BOUNDARY=$(openssl rand -hex 16)
  BODYFILE=$(mktemp)
  {
    printf -- "--%s\r\n" "${BOUNDARY}"
    printf 'Content-Disposition: form-data; name="kind"\r\n\r\n%s\r\n' "${KIND}"
    printf -- "--%s\r\n" "${BOUNDARY}"
    printf 'Content-Disposition: form-data; name="filename"\r\n\r\n%s.png\r\n' "${ID}"
    printf -- "--%s\r\n" "${BOUNDARY}"
    printf 'Content-Disposition: form-data; name="alt"\r\n\r\n%s\r\n' "${LABEL}"
    printf -- "--%s\r\n" "${BOUNDARY}"
    printf 'Content-Disposition: form-data; name="captured_via"\r\n\r\nplaywright\r\n'
    if [ -n "${WIDTH}" ]; then
      printf -- "--%s\r\n" "${BOUNDARY}"
      printf 'Content-Disposition: form-data; name="width"\r\n\r\n%s\r\n' "${WIDTH}"
    fi
    if [ -n "${HEIGHT}" ]; then
      printf -- "--%s\r\n" "${BOUNDARY}"
      printf 'Content-Disposition: form-data; name="height"\r\n\r\n%s\r\n' "${HEIGHT}"
    fi
    printf -- "--%s\r\n" "${BOUNDARY}"
    printf 'Content-Disposition: form-data; name="image"; filename="%s.png"\r\nContent-Type: image/png\r\n\r\n' "${ID}"
    cat "${PNG}"
    printf "\r\n"
    printf -- "--%s--\r\n" "${BOUNDARY}"
  } > "${BODYFILE}"

  SIG=$(openssl dgst -sha256 -hmac "${DEPLOY_SECRET}" "${BODYFILE}" | awk '{print $2}')

  curl -fsSL -X POST \
    -H "Content-Type: multipart/form-data; boundary=${BOUNDARY}" \
    -H "X-AppApprove-Signature: sha256=${SIG}" \
    --data-binary @"${BODYFILE}" \
    "${UPLOAD_URL}" \
    && echo "[appapprove] uploaded ${ID}" \
    || echo "[appapprove] upload failed for ${ID} (non-fatal)"
  rm -f "${BODYFILE}"
done
