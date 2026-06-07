interface PaymentOption {
  handle: string;
  type: string;
}

interface RunInput {
  cart: {
    cost: { totalAmount: { amount: string; currencyCode: string } };
    paymentOptions: PaymentOption[];
  };
}

type Operation =
  | { hide: { paymentOptionHandle: string } }
  | { rename: { paymentOptionHandle: string; title: string } }
  | { move: { paymentOptionHandle: string; index: number } };

interface RunOutput {
  operations: Operation[];
}

export function run(input: RunInput): RunOutput {
  // Placeholder rule: no transforms. Replace with real logic.
  // Example: hide "Cash on delivery" when cart total > $500
  //
  //   const total = parseFloat(input.cart.cost.totalAmount.amount);
  //   if (total <= 500) return { operations: [] };
  //   const cod = input.cart.paymentOptions.find((o) =>
  //     o.handle.toLowerCase().includes("cod"),
  //   );
  //   if (!cod) return { operations: [] };
  //   return { operations: [{ hide: { paymentOptionHandle: cod.handle } }] };
  void input;
  return { operations: [] };
}
