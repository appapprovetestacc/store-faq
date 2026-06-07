# AppApprove Payment Customization Function

Shopify Function targeting `cart.payment-options.transform.run`.

## Purpose

Hide, rename, or reorder payment methods at checkout based on cart signals — e.g. hide cash-on-delivery when cart total exceeds a threshold, rename methods for B2B customers.

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
const total = parseFloat(input.cart.cost.totalAmount.amount);
if (total <= 500) return { operations: [] };
const cod = input.cart.paymentOptions.find((o) =>
  o.handle.toLowerCase().includes("cod"),
);
if (!cod) return { operations: [] };
return { operations: [{ hide: { paymentOptionHandle: cod.handle } }] };
```

## Local dev

```bash
# From the host app root:
pnpm dlx shopify app dev
```

The CLI invokes the function with sample input on each cart event.

## Tests

```bash
cd appapprove-payment-customization-function
pnpm test
```

The test suite ships deterministic input fixtures that exercise the
common branches (empty cart, single line, multi-line). Add cases as
you extend the function.
