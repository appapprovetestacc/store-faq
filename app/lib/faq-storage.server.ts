import type { AppLoadContext } from "@remix-run/cloudflare";
import type { Env } from "../../load-context";

// Storage for Store FAQ entries + per-shop display settings.
//
// The app's only Shopify scope is read_products, so it can't persist
// anything back to the store (metafields/etc. need write scopes). FAQ
// data therefore lives in Cloudflare KV, keyed by shop domain.
//
// Binding resolution mirrors session-storage.server.ts: prefer a
// dedicated FAQ_STORE namespace, fall back to the SESSIONS namespace
// AppApprove already provisions (distinct `faq:` key prefix avoids any
// collision with `offline:` session keys), and finally fall back to an
// in-memory Map so local dev (and the preview Worker) still boot when
// no KV is bound. The in-memory map is per-isolate and non-durable —
// real persistence requires a bound namespace in production.

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  createdAt: number;
}

export interface FaqSettings {
  pageHeading: string;
}

export const DEFAULT_FAQ_SETTINGS: FaqSettings = {
  pageHeading: "Frequently asked questions",
};

const MAX_QUESTION_LEN = 250;
const MAX_ANSWER_LEN = 2000;
const MAX_HEADING_LEN = 120;
const MAX_ENTRIES_PER_SHOP = 200;

const memory = new Map<string, string>();

function kv(context: AppLoadContext): KVNamespace | null {
  const env = (context.cloudflare?.env ?? {}) as Env;
  return env.FAQ_STORE ?? env.SESSIONS ?? null;
}

export function isFaqStoragePersistent(context: AppLoadContext): boolean {
  return kv(context) !== null;
}

function entriesKey(shop: string): string {
  return `faq:entries:${shop}`;
}

function settingsKey(shop: string): string {
  return `faq:settings:${shop}`;
}

async function readJson<T>(
  context: AppLoadContext,
  key: string,
  fallback: T,
): Promise<T> {
  const ns = kv(context);
  const raw = ns ? await ns.get(key) : (memory.get(key) ?? null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(
  context: AppLoadContext,
  key: string,
  value: unknown,
): Promise<void> {
  const ns = kv(context);
  const raw = JSON.stringify(value);
  if (ns) {
    await ns.put(key, raw);
    return;
  }
  memory.set(key, raw);
}

// Newest first — the dashboard wants most-recent on top. Entries are only
// ever appended, so the stored array is in chronological order; reversing
// it is stable even when several entries share a millisecond timestamp
// (sorting on createdAt would not be).
export async function listFaqEntries(
  context: AppLoadContext,
  shop: string,
): Promise<FaqEntry[]> {
  const entries = await readJson<FaqEntry[]>(context, entriesKey(shop), []);
  return [...entries].reverse();
}

export async function getFaqSettings(
  context: AppLoadContext,
  shop: string,
): Promise<FaqSettings> {
  const stored = await readJson<Partial<FaqSettings>>(
    context,
    settingsKey(shop),
    {},
  );
  return {
    pageHeading:
      typeof stored.pageHeading === "string" && stored.pageHeading.trim()
        ? stored.pageHeading
        : DEFAULT_FAQ_SETTINGS.pageHeading,
  };
}

export type FormResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// Validate + persist a new FAQ entry from a submitted form. Returns a
// discriminated result so route actions can surface a Polaris error
// banner without duplicating validation rules.
export async function createFaqEntryFromForm(
  context: AppLoadContext,
  shop: string,
  formData: FormData,
): Promise<FormResult<{ entry: FaqEntry; total: number }>> {
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();

  if (!question) return { ok: false, error: "Question is required." };
  if (!answer) return { ok: false, error: "Answer is required." };
  if (question.length > MAX_QUESTION_LEN) {
    return {
      ok: false,
      error: `Question must be ${MAX_QUESTION_LEN} characters or fewer.`,
    };
  }
  if (answer.length > MAX_ANSWER_LEN) {
    return {
      ok: false,
      error: `Answer must be ${MAX_ANSWER_LEN} characters or fewer.`,
    };
  }

  const entries = await readJson<FaqEntry[]>(context, entriesKey(shop), []);
  if (entries.length >= MAX_ENTRIES_PER_SHOP) {
    return {
      ok: false,
      error: `You've reached the limit of ${MAX_ENTRIES_PER_SHOP} FAQ entries.`,
    };
  }

  const entry: FaqEntry = {
    id: crypto.randomUUID(),
    question,
    answer,
    createdAt: Date.now(),
  };
  entries.push(entry);
  await writeJson(context, entriesKey(shop), entries);
  return { ok: true, value: { entry, total: entries.length } };
}

// Validate + persist display settings from a submitted form.
export async function saveFaqSettingsFromForm(
  context: AppLoadContext,
  shop: string,
  formData: FormData,
): Promise<FormResult<FaqSettings>> {
  const pageHeading = String(formData.get("pageHeading") ?? "").trim();
  if (!pageHeading) return { ok: false, error: "Heading is required." };
  if (pageHeading.length > MAX_HEADING_LEN) {
    return {
      ok: false,
      error: `Heading must be ${MAX_HEADING_LEN} characters or fewer.`,
    };
  }
  const settings: FaqSettings = { pageHeading };
  await writeJson(context, settingsKey(shop), settings);
  return { ok: true, value: settings };
}

// Sample entries shown only in preview mode (no KV bound on the preview
// Worker), so the dashboard screenshot shows a populated list instead of
// an empty state.
export function previewFaqEntries(): FaqEntry[] {
  const base = Date.UTC(2026, 0, 1);
  return [
    {
      id: "preview-1",
      question: "How long does shipping take?",
      answer:
        "Most orders ship within 1–2 business days and arrive within 5–7 business days.",
      createdAt: base + 3000,
    },
    {
      id: "preview-2",
      question: "What is your return policy?",
      answer:
        "We accept returns within 30 days of delivery for a full refund, no questions asked.",
      createdAt: base + 2000,
    },
    {
      id: "preview-3",
      question: "Do you ship internationally?",
      answer: "Yes — we ship to over 60 countries. Duties are calculated at checkout.",
      createdAt: base + 1000,
    },
  ];
}
