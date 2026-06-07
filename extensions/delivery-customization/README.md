# AppApprove Delivery Customization Function

Shopify Function targeting `cart.delivery-options.transform.run`.

## Purpose

Rename, reorder, or hide delivery options shown at checkout based on cart contents — e.g. hide express shipping for oversize items, rename options based on a customer tag.

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
// Rename "Standard" → "Standard (3-5 days)"
const operations = input.cart.deliveryGroups.flatMap((g) =>
  g.deliveryOptions
    .filter((o) => o.title.toLowerCase() === "standard")
    .map((o) => ({
      rename: { deliveryOptionHandle: o.handle, title: "Standard (3-5 days)" },
    })),
);
return { operations };
```

## Local dev

```bash
# From the host app root:
pnpm dlx shopify app dev
```

The CLI invokes the function with sample input on each cart event.

## Tests

```bash
cd appapprove-delivery-customization-function
pnpm test
```

The test suite ships deterministic input fixtures that exercise the
common branches (empty cart, single line, multi-line). Add cases as
you extend the function.
