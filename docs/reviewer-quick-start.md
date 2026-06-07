# Reviewer quick start for Store FAQ

Use this file as the Partner Dashboard review note source.

## Smoke test

- Install on a clean development store and complete OAuth.
- Confirm the app loads on its selected surface: embedded-admin.
- Exercise the primary merchant workflow described in the listing.
- Confirm GDPR webhooks, support, privacy, data-retention, status, health, and version endpoints.
- Plus-only checkout instructions are not required for this app surface.

## Scope justification

| Scope | Justification |
|---|---|
| `read_products` | This app uses `read_products` to read product catalog data used by the selected app features. |

## Webhooks

- Mandatory GDPR webhooks are still required and must verify HMAC signatures.
