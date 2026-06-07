# AppApprove Checkout UI extension

Renders inside the Shopify checkout via the Checkout UI Extensions API.

## Target → required plan tier

Some targets are Shopify Plus only. Don't gate plan tier client-side
only — Shopify reviewers also check that your declared targets work on
the plan tiers your listing claims to support.

| Target | Required plan |
|---|---|
| `purchase.checkout.block.render` | All plans |
| `purchase.checkout.delivery-address.render-before` | All plans |
| `purchase.checkout.payment-method-list.render-after` | Shopify Plus |
| `purchase.checkout.shipping-option-list.render-after` | Shopify Plus |
| `purchase.checkout.contact.render-after` | All plans |
| `purchase.thank-you.block.render` | All plans |
| `customer-account.order-status.block.render` | All plans |

If your extension exercises a Plus-only API (e.g. checkout-validation,
shipping discounts), gate at runtime via `shop.plan?.displayName`.

## Local development

```bash
# From the host app root:
pnpm dlx shopify app dev
```

The CLI launches the extension against your linked dev store.

## Testing checklist before submitting

- Test on a clean Shopify development store with checkout extensibility
  ENABLED (Settings → Checkout → Use extensions).
- Test on both Plus and non-Plus dev stores if the extension claims to
  support both. Shopify reviewers will install on whichever plan tier
  your listing declares.
- Verify the extension renders without console errors at narrow viewport
  widths (mobile checkout); reviewers test mobile by default.
- Confirm `network_access` / `api_access` capabilities in
  `shopify.extension.toml` match what the runtime actually does.
  Declaring more than you use is rejected.
