import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./index.ts";

const baseInput = {
  cart: {
    lines: [
      {
        id: "gid://shopify/CartLine/1",
        quantity: 2,
        cost: { amountPerQuantity: { amount: "10.00", currencyCode: "USD" } },
        merchandise: { id: "gid://shopify/ProductVariant/1", product: { id: "gid://shopify/Product/1" } },
      },
    ],
  },
  discount: { discountClasses: [] },
};

test("placeholder rule returns no discounts", () => {
  const result = run(baseInput);
  assert.equal(result.discounts.length, 0);
  assert.equal(result.discountApplicationStrategy, "FIRST");
});

test("output is deterministic across repeated calls", () => {
  const a = run(baseInput);
  const b = run(baseInput);
  assert.deepEqual(a, b);
});

test("empty cart is handled without throwing", () => {
  const result = run({ cart: { lines: [] }, discount: { discountClasses: [] } });
  assert.equal(result.discounts.length, 0);
});
