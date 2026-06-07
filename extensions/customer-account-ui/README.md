# AppApprove Customer Account UI extension

Renders inside the customer's order status and account pages.

## Available on all plans

Customer Account UI extensions don't require Shopify Plus. Common
targets:

| Target | Use case |
|---|---|
| `customer-account.order-status.block.render` | Post-purchase upsells, tracking widgets, loyalty progress |
| `customer-account.order-status.thank-you.block.render` | Thank-you-page-specific messaging |
| `customer-account.profile.block.render` | Profile-tab additions (preferences, subscriptions) |

## Local development

```bash
# From the host app root:
pnpm dlx shopify app dev
```

Open a test order's status page — the CLI hot-reloads the extension on
each save.

## Testing checklist before submitting

- Test on a development store with at least one completed test order.
- Verify the extension does not block render when the customer account
  API has no data yet (e.g. brand-new customer).
- Check the localization works — switch the dev store's customer
  language and confirm strings come from `locales/`, not hard-coded.
- If you read customer data, verify your scopes match (read_customers
  if anything customer-personal is shown).
