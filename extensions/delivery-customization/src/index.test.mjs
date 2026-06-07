import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./index.ts";

const baseInput = {
  cart: {
    deliveryGroups: [
      {
        id: "gid://shopify/CartDeliveryGroup/1",
        deliveryOptions: [
          { handle: "standard", title: "Standard", cost: { amount: "5.00", currencyCode: "USD" } },
          { handle: "express", title: "Express", cost: { amount: "15.00", currencyCode: "USD" } },
        ],
      },
    ],
  },
};

test("placeholder rule produces no operations", () => {
  assert.deepEqual(run(baseInput), { operations: [] });
});

test("output is deterministic across repeated calls", () => {
  assert.deepEqual(run(baseInput), run(baseInput));
});

test("empty delivery groups don't crash", () => {
  assert.deepEqual(run({ cart: { deliveryGroups: [] } }), { operations: [] });
});
