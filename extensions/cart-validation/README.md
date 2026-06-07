# AppApprove Cart Validation Function

Shopify Function targeting `cart.validations.generate.run`.

## Purpose

Block checkout with merchant-defined error messages when the cart fails business rules — e.g. max quantity per order, age-restricted items missing a customer attribute, or B2B-only SKUs in a non-B2B cart.

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
const errors = input.cart.lines
  .filter((line) => line.quantity > 10)
  .map((line) => ({
    message: "Maximum 10 of any one item per order.",
    target: `cart.lines.${line.id}`,
  }));
return { errors };
```

## Local dev

```bash
# From the host app root:
pnpm dlx shopify app dev
```

The CLI invokes the function with sample input on each cart event.

## Tests

```bash
cd appapprove-cart-validation-function
pnpm test
```

The test suite ships deterministic input fixtures that exercise the
common branches (empty cart, single line, multi-line). Add cases as
you extend the function.
