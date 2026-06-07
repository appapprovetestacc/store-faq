# AppApprove theme extension

This directory ships two surfaces:

- `blocks/app-embed.liquid` — passive app embed. Merchant toggles it on
  in the theme editor; it renders globally inside `<body>`.
- `blocks/section.liquid` — active section block. Merchant places it
  explicitly inside any compatible theme section.

## Built-for-Shopify rules these scaffolds already follow

- **Uninstall-safe**: no theme-bound state, no localStorage writes that
  aren't cleared when the embed is disabled, no inline scripts. When the
  extension is uninstalled, both files disappear cleanly and the theme
  renders without orphan content.
- **Performance budget**: one shared stylesheet (`assets/extension.css`),
  no `<script src="https://...">` to third-party origins, no inline
  styles. Any client-side JS you add later belongs in
  `assets/extension.js` and must be `defer`-loaded by Shopify via the
  `[script]` entry in `shopify.extension.toml`.
- **i18n-ready**: every visible string routes through `locales/` so the
  merchant can switch storefront language without rebuilding.

## Adding a new external script

If you genuinely need a third-party script (analytics, A/B tooling, etc.):

1. Add it to `shopify.extension.toml` under `[script]` so Shopify
   handles loading + cache-busting.
2. Document the third-party domain + purpose in this README so app
   reviewers can verify it.
3. Confirm the third-party respects `Do Not Track` + storefront
   privacy headers; Shopify's storefront privacy controls apply to
   embed code too.

## Uninstall checklist (merchant-facing)

When the merchant deactivates the embed (`block.settings.enabled = false`)
or uninstalls the app entirely:

- All DOM surface disappears (the only render path is gated by
  `{% if block.settings.enabled %}`).
- No persisted client state to clean up (this scaffold does not write
  to `localStorage` / `sessionStorage`).
- The merchant theme keeps working with zero edits.

If you add features that DO write client-side state, add an explicit
cleanup path — e.g. an `assets/extension.js` module that runs
`localStorage.removeItem("appapprove-...")` when the embed unmounts.
