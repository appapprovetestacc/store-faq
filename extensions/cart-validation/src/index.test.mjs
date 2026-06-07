import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./index.ts";

const baseInput = {
  cart: {
    lines: [
      {
        id: "gid://shopify/CartLine/1",
        quantity: 5,
        merchandise: {
          id: "gid://shopify/ProductVariant/1",
          product: { id: "gid://shopify/Product/1" },
        },
      },
    ],
    buyerIdentity: { customer: null },
  },
};

test("placeholder rule produces no errors", () => {
  assert.deepEqual(run(baseInput), { errors: [] });
});

test("output is deterministic across repeated calls", () => {
  assert.deepEqual(run(baseInput), run(baseInput));
});

test("logged-in buyer is reflected in input shape (smoke)", () => {
  const result = run({
    cart: {
      ...baseInput.cart,
      buyerIdentity: { customer: { id: "gid://shopify/Customer/1" } },
    },
  });
  assert.equal(result.errors.length, 0);
});
