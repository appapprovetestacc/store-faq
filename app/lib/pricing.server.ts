import { parse } from "yaml";

// AppApprove inlines the pricing.yaml content at build time so the Worker
// runtime doesn't need filesystem access. The build hook (Sprint 27)
// rewrites the `PRICING_YAML_RAW` constant below from the actual file.
//
// During local dev, pricing.yaml is read from disk via the Vite plugin
// loader (Vite supports ?raw imports out of the box).

import pricingYamlRaw from "../../pricing.yaml?raw";

export type PlanInterval = "monthly" | "annual";

export interface RecurringPlan {
  name: string;
  price: number;
  interval: PlanInterval;
  trial_days?: number;
  features?: string[];
}

export interface UsagePlan {
  name: string;
  type: "usage";
  rate_per_event: number;
  capped_amount?: number;
  features?: string[];
}

export interface OneTimePlan {
  name: string;
  price: number;
  interval?: never;
  one_time: true;
  features?: string[];
}

export interface FreePlan {
  name: string;
  price: 0;
  features?: string[];
}

export type Plan = FreePlan | RecurringPlan | UsagePlan | OneTimePlan;

export interface PricingConfig {
  currency: string;
  plans: Plan[];
}

let cached: PricingConfig | null = null;

export function getPricing(): PricingConfig {
  if (cached) return cached;
  const parsed = parse(pricingYamlRaw) as PricingConfig | null;
  if (!parsed) throw new Error("pricing.yaml is empty or invalid.");
  if (!Array.isArray(parsed.plans))
    throw new Error("pricing.yaml: \"plans\" must be an array.");
  cached = parsed;
  return parsed;
}

export function findPlan(name: string): Plan | undefined {
  return getPricing().plans.find((p) => p.name === name);
}

export function isFreePlan(plan: Plan): plan is FreePlan {
  return "price" in plan && plan.price === 0 && !("type" in plan);
}

export function isRecurringPlan(plan: Plan): plan is RecurringPlan {
  return (
    "interval" in plan &&
    (plan.interval === "monthly" || plan.interval === "annual")
  );
}

export function isUsagePlan(plan: Plan): plan is UsagePlan {
  return "type" in plan && plan.type === "usage";
}

export function isOneTimePlan(plan: Plan): plan is OneTimePlan {
  return "one_time" in plan && plan.one_time === true;
}
