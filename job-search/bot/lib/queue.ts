import {
  listLeadItems,
  readPlatformStore,
  writePlatformStore,
} from "./store.js";
import type {
  ApprovalItem,
  ApprovalQueueState,
  ApprovalStatus,
  LeadStatus,
} from "./types.js";

type KvLike = {
  get(key: string): Promise<unknown>;
  put(key: string, value: never): Promise<void>;
};

/** @deprecated session-scoped keys — kept for type compatibility */
export function queueKey(sessionId: string): string {
  return `${sessionId}:approval-queue`;
}

export async function readQueue(
  kv: Pick<KvLike, "get">,
  _sessionId?: string,
): Promise<ApprovalQueueState> {
  const store = await readPlatformStore(kv);
  return store.queue;
}

export async function writeQueue(
  kv: Pick<KvLike, "put" | "get">,
  _sessionId: string | undefined,
  state: ApprovalQueueState,
): Promise<ApprovalQueueState> {
  const store = await readPlatformStore(kv);
  const next = await writePlatformStore(
    {
      ...store,
      queue: state,
    },
    kv,
  );
  return next.queue;
}

export function listItems(
  state: ApprovalQueueState,
  status?: ApprovalStatus,
): ApprovalItem[] {
  const items = Object.values(state.items);
  const filtered = status
    ? items.filter((item) => item.status === status)
    : items;
  return filtered.sort((a, b) => (a.queuedAt < b.queuedAt ? 1 : -1));
}

export function listByLeadStatus(
  state: ApprovalQueueState,
  leadStatus?: LeadStatus,
): ApprovalItem[] {
  return listLeadItems(state, leadStatus);
}
