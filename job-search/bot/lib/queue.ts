import type { ApprovalItem, ApprovalQueueState, ApprovalStatus } from "./types.js";

type KvLike = {
  get(key: string): Promise<unknown>;
  put(key: string, value: never): Promise<void>;
};

export function queueKey(sessionId: string): string {
  return `${sessionId}:approval-queue`;
}

export async function readQueue(
  kv: Pick<KvLike, "get">,
  sessionId: string,
): Promise<ApprovalQueueState> {
  const existing = await kv.get(queueKey(sessionId));
  if (
    existing &&
    typeof existing === "object" &&
    !Array.isArray(existing) &&
    "items" in existing
  ) {
    return existing as ApprovalQueueState;
  }
  return { items: {}, updatedAt: new Date(0).toISOString() };
}

export async function writeQueue(
  kv: Pick<KvLike, "put">,
  sessionId: string,
  state: ApprovalQueueState,
): Promise<ApprovalQueueState> {
  const next: ApprovalQueueState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await kv.put(queueKey(sessionId), next as never);
  return next;
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

