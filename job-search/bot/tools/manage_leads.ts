import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  appendActivity,
  listLeadItems,
  readPlatformStore,
  writePlatformStore,
} from "../lib/store.js";
import type { LeadStatus } from "../lib/types.js";

const leadStatusSchema = z.enum([
  "new",
  "saved",
  "to_apply",
  "applied",
  "interview",
  "rejected",
  "offer",
  "dismissed",
]);

export default defineTool({
  description:
    "List or update job leads in the durable platform store (tracker stages, notes, dismiss/save/applied).",
  execution: "server",
  effect: (input) => (input.action === "list" || input.action === "get" ? "read" : "write"),
  inputSchema: z.object({
    action: z.enum(["list", "get", "set_status", "add_note"]),
    jobId: z.string().optional(),
    leadStatus: leadStatusSchema.optional(),
    note: z.string().optional(),
    statusFilter: leadStatusSchema.optional(),
  }),
  dryRunResult: ({ action, jobId }) => ({
    action,
    jobId: jobId ?? null,
    dryRun: true,
  }),
  async execute({ action, jobId, leadStatus, note, statusFilter }, ctx) {
    let store = await readPlatformStore(ctx.host.kv);

    if (action === "list") {
      const items = listLeadItems(store.queue, statusFilter);
      return {
        action,
        count: items.length,
        items,
      };
    }

    if (!jobId) {
      return {
        ok: false,
        error: "jobId_required",
        message: "Indique jobId.",
      };
    }

    const item = store.queue.items[jobId];
    if (!item) {
      return {
        ok: false,
        error: "not_found",
        message: `Vaga ${jobId} não encontrada.`,
      };
    }

    if (action === "get") {
      return { ok: true, item };
    }

    if (action === "set_status") {
      if (!leadStatus) {
        return {
          ok: false,
          error: "leadStatus_required",
          message: "Indique leadStatus.",
        };
      }
      const nextStatus = leadStatus as LeadStatus;
      store.queue.items[jobId] = {
        ...item,
        leadStatus: nextStatus,
        appliedAt:
          nextStatus === "applied" || nextStatus === "interview" || nextStatus === "offer"
            ? item.appliedAt ?? new Date().toISOString()
            : item.appliedAt ?? null,
        status:
          nextStatus === "dismissed" || nextStatus === "rejected"
            ? "rejected"
            : nextStatus === "applied" ||
                nextStatus === "interview" ||
                nextStatus === "offer"
              ? item.status === "submitted"
                ? "submitted"
                : "approved"
              : item.status,
        decidedAt: new Date().toISOString(),
      };
      store = appendActivity(store, {
        level: "info",
        category: "tracker",
        message: `Estado actualizado: ${item.job.title} → ${nextStatus}`,
        jobId,
      });
      store = await writePlatformStore(store, ctx.host.kv);
      return { ok: true, item: store.queue.items[jobId] };
    }

    if (action === "add_note") {
      store.queue.items[jobId] = {
        ...item,
        notes: note ?? item.notes ?? null,
      };
      store = await writePlatformStore(store, ctx.host.kv);
      return { ok: true, item: store.queue.items[jobId] };
    }

    return { ok: false, error: "unknown_action" };
  },
});
