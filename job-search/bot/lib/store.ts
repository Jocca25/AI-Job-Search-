import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./paths.js";
import { JOB_SOURCES } from "./sources.js";
import type {
  ActivityEvent,
  AgentStatusState,
  ApprovalItem,
  ApprovalQueueState,
  LeadStatus,
  PlatformStore,
  SearchConfig,
} from "./types.js";

export const PLATFORM_KV_KEY = "job-search:platform-store:v1";

type KvLike = {
  get(key: string): Promise<unknown>;
  put(key: string, value: never): Promise<void>;
};

const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  defaultQuery:
    "estágio OR junior OR trainee AI OR \"business intelligence\" OR \"data analyst\" OR \"AI agent\"",
  defaultLocation: "Lisboa",
  enabledSources: JOB_SOURCES.map((s) => s.id),
  minScoreToKeep: 45,
  maxResultsPerRun: 40,
  autoDismissSenior: true,
};

const DEFAULT_AGENT: AgentStatusState = {
  status: "idle",
  lastExecutionAt: null,
  lastStartedAt: null,
  jobsProcessed: 0,
  lastError: null,
  currentAction: null,
  searchQuery: null,
  searchLocation: null,
  enabledSources: DEFAULT_SEARCH_CONFIG.enabledSources,
};

function emptyQueue(): ApprovalQueueState {
  return { items: {}, updatedAt: new Date(0).toISOString() };
}

export function defaultPlatformStore(): PlatformStore {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    queue: emptyQueue(),
    activity: [],
    agent: { ...DEFAULT_AGENT },
    searchConfig: { ...DEFAULT_SEARCH_CONFIG },
  };
}

function storePath(): string {
  return path.join(dataDir(), "platform-store.json");
}

function isPlatformStore(value: unknown): value is PlatformStore {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "version" in value &&
    "queue" in value
  );
}

function migrateItem(raw: ApprovalItem): ApprovalItem {
  const leadStatus: LeadStatus =
    raw.leadStatus ??
    (raw.status === "submitted"
      ? "applied"
      : raw.status === "rejected"
        ? "dismissed"
        : raw.status === "approved" || raw.status === "prepared"
          ? "to_apply"
          : "new");
  return {
    ...raw,
    leadStatus,
    discoveredAt: raw.discoveredAt ?? raw.queuedAt,
    score100: raw.score100 ?? raw.breakdown?.score100 ?? (raw.score != null ? raw.score * 10 : undefined),
  };
}

function normalizeStore(raw: PlatformStore): PlatformStore {
  const items: { [jobId: string]: ApprovalItem } = {};
  for (const [id, item] of Object.entries(raw.queue?.items ?? {})) {
    items[id] = migrateItem(item);
  }
  return {
    version: 1,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    queue: {
      items,
      updatedAt: raw.queue?.updatedAt ?? raw.updatedAt ?? new Date().toISOString(),
    },
    activity: Array.isArray(raw.activity) ? raw.activity : [],
    agent: { ...DEFAULT_AGENT, ...(raw.agent ?? {}) },
    searchConfig: { ...DEFAULT_SEARCH_CONFIG, ...(raw.searchConfig ?? {}) },
  };
}

export async function readStoreFromDisk(): Promise<PlatformStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isPlatformStore(parsed)) return normalizeStore(parsed);
  } catch {
    // missing or invalid — start empty
  }
  return defaultPlatformStore();
}

export async function writeStoreToDisk(store: PlatformStore): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  const next: PlatformStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(storePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

/** Load platform store: prefer durable host.kv when available, else disk. */
export async function readPlatformStore(
  kv?: Pick<KvLike, "get"> | null,
): Promise<PlatformStore> {
  if (kv) {
    const fromKv = await kv.get(PLATFORM_KV_KEY);
    if (isPlatformStore(fromKv)) {
      const normalized = normalizeStore(fromKv);
      // Mirror to disk for the local dashboard when possible.
      try {
        await writeStoreToDisk(normalized);
      } catch {
        // Hosted runtimes may not persist local files.
      }
      return normalized;
    }
  }
  const fromDisk = await readStoreFromDisk();
  return fromDisk;
}

export async function writePlatformStore(
  store: PlatformStore,
  kv?: Pick<KvLike, "put"> | null,
): Promise<PlatformStore> {
  const next: PlatformStore = {
    ...normalizeStore(store),
    updatedAt: new Date().toISOString(),
    queue: {
      ...store.queue,
      updatedAt: new Date().toISOString(),
    },
  };
  if (kv) {
    await kv.put(PLATFORM_KV_KEY, next as never);
  }
  try {
    await writeStoreToDisk(next);
  } catch {
    // ignore non-persistent filesystem
  }
  return next;
}

export function listLeadItems(
  state: ApprovalQueueState,
  leadStatus?: LeadStatus,
): ApprovalItem[] {
  const items = Object.values(state.items).map(migrateItem);
  const filtered = leadStatus
    ? items.filter((item) => item.leadStatus === leadStatus)
    : items;
  return filtered.sort((a, b) => {
    const as = a.score100 ?? a.score ?? 0;
    const bs = b.score100 ?? b.score ?? 0;
    if (as !== bs) return bs - as;
    return a.discoveredAt < b.discoveredAt ? 1 : -1;
  });
}

export function appendActivity(
  store: PlatformStore,
  event: Omit<ActivityEvent, "id" | "at"> & { id?: string; at?: string },
): PlatformStore {
  const entry: ActivityEvent = {
    id: event.id ?? `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: event.at ?? new Date().toISOString(),
    level: event.level,
    category: event.category,
    message: event.message,
    details: event.details ?? null,
    jobId: event.jobId ?? null,
  };
  return {
    ...store,
    activity: [entry, ...store.activity].slice(0, 300),
  };
}

export function duplicateKey(listing: {
  title: string;
  company: string;
  url: string;
}): string {
  return `${listing.company}|${listing.title}|${listing.url}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function findDuplicate(
  store: PlatformStore,
  listing: { title: string; company: string; url: string; id?: string },
): ApprovalItem | null {
  if (listing.id && store.queue.items[listing.id]) {
    return store.queue.items[listing.id];
  }
  const key = duplicateKey(listing);
  for (const item of Object.values(store.queue.items)) {
    if (duplicateKey(item.job) === key) return item;
    if (item.job.url === listing.url) return item;
  }
  return null;
}
