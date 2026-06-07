// Discount function — runs in Shopify's Wasm sandbox. Sync only,
// no network, no async, must be deterministic. Replace the placeholder
// rule below with your real discount logic.

interface ProductVariant {
  id: string;
  product: { id: string };
}

interface CartLine {
  id: string;
  quantity: number;
  cost: { amountPerQuantity: { amount: string; currencyCode: string } };
  merchandise: ProductVariant | Record<string, never>;
}

interface RunInput {
  cart: { lines: CartLine[] };
  discount: { discountClasses: string[] };
}

interface DiscountTarget {
  cartLine: { id: string; quantity?: number };
}

interface Discount {
  message?: string;
  targets: DiscountTarget[];
  value:
    | { percentage: { value: number } }
    | { fixedAmount: { amount: number; appliesToEachItem?: boolean } };
}

interface RunOutput {
  discountApplicationStrategy: "FIRST" | "MAXIMUM" | "ALL";
  discounts: Discount[];
}

export function run(input: RunInput): RunOutput {
  // Placeholder rule: no discounts applied. Replace with real logic.
  // Example: 10% off when cart has at least 3 of any line.
  //
  //   const totalQty = input.cart.lines.reduce(
  //     (sum, line) => sum + line.quantity, 0
  //   );
  //   if (totalQty < 3) return { discounts: [], discountApplicationStrategy: "FIRST" };
  //   return {
  //     discountApplicationStrategy: "FIRST",
  //     discounts: [{
  //       message: "Bulk 10% off",
  //       targets: input.cart.lines.map((l) => ({ cartLine: { id: l.id } })),
  //       value: { percentage: { value: 10 } },
  //     }],
  //   };
  void input; // remove once you start reading from input
  return {
    discountApplicationStrategy: "FIRST",
    discounts: [],
  };
}
