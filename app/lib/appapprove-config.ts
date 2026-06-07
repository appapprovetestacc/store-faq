// Type definitions for appapprove.config.ts. AppApprove's build pipeline
// reads the default export to wire webhooks, env mapping, and pricing.

export interface AppApproveConfig {
  /** Lowercase, hyphenated handle. Must match wrangler.toml `name`. */
  slug: string;
  /** Currently the only supported framework. */
  framework: "remix-cloudflare-workers";
  /** Map of Shopify webhook topic → module path of the handler. */
  webhooks: Record<string, string>;
  /**
   * Map of cron schedule (in CF wrangler.toml syntax — e.g. "0 * * * *"
   * for hourly) → module path of the handler. Each entry must also be
   * mirrored in wrangler.toml's `[triggers] crons = [...]` array; the
   * AppApprove deploy pipeline will diff the two on every deploy and
   * surface drift in the dashboard.
   */
  crons?: Record<string, string>;
  /**
   * CF Queues this Worker produces or consumes. Each queue is mirrored
   * in wrangler.toml's `[[queues.producers]]` / `[[queues.consumers]]`
   * sections; AppApprove provisions the queue on first deploy.
   */
  queues?: Record<
    string,
    {
      producer?: boolean;
      consumer?: string;
    }
  >;
  /** Build hooks invoked by AppApprove during deploy. */
  hooks?: Partial<{
    preBuild: string;
    postBuild: string;
    preDeploy: string;
    postDeploy: string;
  }>;
  /** Env-var partitioning. */
  env?: {
    /** Names exposed to the browser via Vite `define`. */
    public?: string[];
    /** Names available only on the server, never bundled into client code. */
    secrets?: string[];
  };
  /** Path (relative to repo root) to the pricing.yaml file. */
  pricing?: string;
}

export interface WebhookHandler {
  (input: {
    topic: string;
    shop: string;
    payload: unknown;
    headers: Headers;
    context: import("@remix-run/cloudflare").AppLoadContext;
  }): Promise<Response> | Response;
}

export interface CronHandler {
  (input: {
    /** The cron expression that fired this event (matches the key in config.crons). */
    schedule: string;
    /** Wall-clock time the CF runtime fired the event, in ms since epoch. */
    scheduledAt: number;
    context: import("@remix-run/cloudflare").AppLoadContext;
  }): Promise<void> | void;
}
