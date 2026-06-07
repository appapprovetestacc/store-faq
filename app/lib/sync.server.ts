type SyncResource = "products" | "variants" | "orders" | "customers" | "collections" | "inventory_items";

export interface SyncCursor {
  resource: SyncResource;
  cursor: string | null;
  syncedAt: string | null;
}

export interface SyncEvent {
  shop: string;
  resource: SyncResource;
  remoteId: string;
  payloadHash: string;
  receivedAt: string;
}

export interface DeadLetterSyncEvent extends SyncEvent {
  error: string;
  retryCount: number;
  nextRetryAt: string | null;
}

export function syncKey(shop: string, resource: SyncResource): string {
  return shop + ":" + resource;
}

export function shouldReplayEvent(event: SyncEvent, knownPayloadHash: string | null): boolean {
  return knownPayloadHash !== event.payloadHash;
}

export function scheduleRetry(event: DeadLetterSyncEvent): DeadLetterSyncEvent {
  const minutes = Math.min(60, Math.pow(2, event.retryCount));
  return {
    ...event,
    retryCount: event.retryCount + 1,
    nextRetryAt: new Date(Date.now() + minutes * 60_000).toISOString(),
  };
}

export function redactSyncPayload<T extends Record<string, unknown>>(payload: T): T {
  const copy = { ...payload };
  for (const key of Object.keys(copy)) {
    if (/email|phone|address|name/i.test(key)) copy[key as keyof T] = "[redacted]" as T[keyof T];
  }
  return copy;
}

export function nextBackfillQuery(resource: SyncResource, cursor: string | null): string {
  const after = cursor ? ', after: "' + cursor + '"' : "";
  if (resource === "products") return "{ products(first: 50" + after + ") { pageInfo { hasNextPage endCursor } nodes { id title updatedAt } } }";
  if (resource === "orders") return "{ orders(first: 50" + after + ") { pageInfo { hasNextPage endCursor } nodes { id name updatedAt } } }";
  if (resource === "customers") return "{ customers(first: 50" + after + ") { pageInfo { hasNextPage endCursor } nodes { id email updatedAt } } }";
  return "{ " + resource + "(first: 50" + after + ") { pageInfo { hasNextPage endCursor } nodes { id updatedAt } } }";
}
