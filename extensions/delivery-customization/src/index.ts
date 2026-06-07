interface DeliveryOption {
  handle: string;
  title: string;
  cost: { amount: string; currencyCode: string };
}

interface DeliveryGroup {
  id: string;
  deliveryOptions: DeliveryOption[];
}

interface RunInput {
  cart: { deliveryGroups: DeliveryGroup[] };
}

type Operation =
  | { hide: { deliveryOptionHandle: string } }
  | { rename: { deliveryOptionHandle: string; title: string } }
  | { move: { deliveryOptionHandle: string; index: number } };

interface RunOutput {
  operations: Operation[];
}

export function run(input: RunInput): RunOutput {
  // Placeholder rule: no transforms. Replace with real logic.
  // Example: rename "Standard" → "Standard (3-5 days)"
  //
  //   const operations: Operation[] = input.cart.deliveryGroups.flatMap((g) =>
  //     g.deliveryOptions
  //       .filter((o) => o.title.toLowerCase() === "standard")
  //       .map((o) => ({
  //         rename: { deliveryOptionHandle: o.handle, title: "Standard (3-5 days)" },
  //       })),
  //   );
  //   return { operations };
  void input;
  return { operations: [] };
}
