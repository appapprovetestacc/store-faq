interface CartLine {
  id: string;
  quantity: number;
  merchandise:
    | { id: string; product: { id: string } }
    | Record<string, never>;
}

interface RunInput {
  cart: {
    lines: CartLine[];
    buyerIdentity: { customer: { id: string } | null };
  };
}

interface ValidationError {
  message: string;
  target: string;
}

interface RunOutput {
  errors: ValidationError[];
}

export function run(input: RunInput): RunOutput {
  // Placeholder rule: no validation errors. Replace with real logic.
  // Example: cap line quantity at 10
  //
  //   const errors = input.cart.lines
  //     .filter((line) => line.quantity > 10)
  //     .map((line) => ({
  //       message: "Maximum 10 of any one item per order.",
  //       target: `cart.lines.${line.id}`,
  //     }));
  //   return { errors };
  void input;
  return { errors: [] };
}
