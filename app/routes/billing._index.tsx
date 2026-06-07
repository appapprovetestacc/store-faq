import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  json,
  redirect,
} from "@remix-run/cloudflare";
import { Form, useLoaderData } from "@remix-run/react";
import {
  cancelSubscription,
  createChargeForPlan,
  listActiveSubscriptions,
} from "~/lib/billing.server";
import { getPricing } from "~/lib/pricing.server";
import { isValidShop, shopifyApi } from "~/lib/shopify.server";

// Embedded billing screen. Hit at /billing from inside the admin app.
// Renders the plan grid from pricing.yaml, shows the active subscription
// (if any), and POSTs upgrade/cancel through the Shopify Billing API.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop || !isValidShop(shop)) {
    throw new Response("Missing or invalid ?shop", { status: 400 });
  }
  const pricing = getPricing();
  const active = await listActiveSubscriptions(context, shop).catch(() => []);
  return json({ shop, pricing, active });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  const shop = form.get("shop");
  const intent = form.get("intent");
  if (typeof shop !== "string" || !isValidShop(shop)) {
    return new Response("Bad shop", { status: 400 });
  }
  const api = shopifyApi(context);
  const returnUrl = `${api.appUrl.replace(/\/$/, "")}/billing?shop=${encodeURIComponent(shop)}`;
  if (intent === "select-plan") {
    const planName = form.get("plan");
    if (typeof planName !== "string") return new Response("Bad plan", { status: 400 });
    const result = await createChargeForPlan({
      context,
      shop,
      planName,
      returnUrl,
      test: api.appUrl.includes("localhost"),
    });
    return redirect(result.confirmationUrl);
  }
  if (intent === "cancel") {
    const id = form.get("subscriptionId");
    if (typeof id !== "string") return new Response("Bad id", { status: 400 });
    await cancelSubscription(context, shop, id);
    return redirect(returnUrl);
  }
  return new Response("Unknown intent", { status: 400 });
}

export default function Billing() {
  const { shop, pricing, active } = useLoaderData<typeof loader>();
  const activeName = active[0]?.name ?? null;
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0, fontWeight: 500, letterSpacing: "-0.02em" }}>
        Billing
      </h1>
      {active.length > 0 ? (
        <section style={{ background: "#f6f6f4", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            Active plan: <strong>{active[0]!.name}</strong> ({active[0]!.status.toLowerCase()})
          </p>
          <Form method="post" style={{ marginTop: ".5rem" }}>
            <input type="hidden" name="shop" value={shop} />
            <input type="hidden" name="intent" value="cancel" />
            <input type="hidden" name="subscriptionId" value={active[0]!.id} />
            <button type="submit" style={{ fontSize: 12 }}>
              Cancel subscription
            </button>
          </Form>
        </section>
      ) : null}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        {pricing.plans.map((plan) => {
          const isActive = plan.name === activeName;
          return (
            <article
              key={plan.name}
              style={{
                border: isActive ? "2px solid #000" : "1px solid #ddd",
                borderRadius: 12,
                padding: "1rem 1.25rem",
              }}
            >
              <h2 style={{ marginTop: 0, fontSize: 18 }}>{plan.name}</h2>
              <p style={{ fontSize: 24, margin: "0 0 .5rem" }}>
                {"price" in plan && typeof plan.price === "number"
                  ? plan.price === 0
                    ? "Free"
                    : `${pricing.currency} ${plan.price}`
                  : "Usage-based"}
                {"interval" in plan && plan.interval ? (
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    {" "}/{plan.interval === "annual" ? "yr" : "mo"}
                  </span>
                ) : null}
              </p>
              {"trial_days" in plan && plan.trial_days ? (
                <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 .5rem" }}>
                  {plan.trial_days}-day free trial
                </p>
              ) : null}
              {plan.features?.map((f) => (
                <p key={f} style={{ margin: "4px 0", fontSize: 13 }}>
                  · {f}
                </p>
              ))}
              {!isActive ? (
                <Form method="post" style={{ marginTop: "1rem" }}>
                  <input type="hidden" name="shop" value={shop} />
                  <input type="hidden" name="intent" value="select-plan" />
                  <input type="hidden" name="plan" value={plan.name} />
                  <button type="submit" style={{ width: "100%", padding: ".5rem" }}>
                    {"price" in plan && plan.price === 0 ? "Use Free" : "Choose plan"}
                  </button>
                </Form>
              ) : (
                <p style={{ marginTop: "1rem", fontSize: 12, opacity: 0.7 }}>
                  Currently active
                </p>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
