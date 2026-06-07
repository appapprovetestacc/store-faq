# AppApprove Discount Function

Shopify Function targeting `cart.lines.discounts.generate.run`.

## Purpose

Apply percentage / fixed-amount discounts to cart lines based on quantity, product, customer tag, or other cart-derived signals.

## Hard runtime constraints (Shopify enforces — DO NOT violate)

- **No network calls.** `fetch`, XHR, WebSocket — all unavailable. The
  function gets its input from `src/run.graphql` and returns a
  serialisable object. If you need to call an external API, do it in
  the host app and pass the result through metafields or app config
  that the function reads from its input query.
- **No async I/O.** `setTimeout`, `setInterval`, `Promise.race` for
  timing — all unavailable. The runtime is fully synchronous.
- **Deterministic.** Identical input → identical output. `Date.now()`,
  `Math.random()`, file I/O — all forbidden. Shopify replays functions
  to verify deterministic behaviour during review.
- **No mutation of input.** Treat `input` as readonly.

## Example

```ts
// 10% off when total cart quantity is >= 3
const totalQty = input.cart.lines.reduce((sum, l) => sum + l.quantity, 0);
if (totalQty < 3) return { discounts: [], discountApplicationStrategy: "FIRST" };
return {
  discountApplicationStrategy: "FIRST",
  discounts: [{
    message: "Bulk 10% off",
    targets: input.cart.lines.map((l) => ({ cartLine: { id: l.id } })),
    value: { percentage: { value: 10 } },
  }],
};
```

## Local dev

```bash
# From the host app root:
pnpm dlx shopify app dev
```

The CLI invokes the function with sample input on each cart event.

## Tests

```bash
cd appapprove-discount-function
pnpm test
```

The test suite ships deterministic input fixtures that exercise the
common branches (empty cart, single line, multi-line). Add cases as
you extend the function.
