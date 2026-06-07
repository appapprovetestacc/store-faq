import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./index.ts";

const baseInput = {
  cart: {
    cost: { totalAmount: { amount: "100.00", currencyCode: "USD" } },
    paymentOptions: [
      { handle: "shopify-payments", type: "credit_card" },
      { handle: "cash-on-delivery", type: "manual" },
    ],
  },
};

test("placeholder rule produces no operations", () => {
  assert.deepEqual(run(baseInput), { operations: [] });
});

test("output is deterministic across repeated calls", () => {
  assert.deepEqual(run(baseInput), run(baseInput));
});

test("zero-cost cart does not crash", () => {
  const result = run({
    cart: {
      cost: { totalAmount: { amount: "0.00", currencyCode: "USD" } },
      paymentOptions: [],
    },
  });
  assert.deepEqual(result, { operations: [] });
});
