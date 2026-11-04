import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { listItems, readQueue, writeQueue } from "../lib/queue.js";

export default defineTool({
  description:
    "Manage the human approval queue: list, enqueue metadata refresh, approve, or reject. Submits are blocked until status is approved.",
  execution: "server",
  effect: (input) => (input.action === "list" ? "read" : "write"),
  inputSchema: z.object({
    action: z.enum(["list", "approve", "reject"]),
    jobId: z.string().optional(),
    statusFilter: z
      .enum(["pending", "approved", "rejected", "prepared", "submitted"])
      .optional(),
  }),
  dryRunResult: ({ action, jobId }) => ({
    action,
    jobId: jobId ?? null,
    dryRun: true,
  }),
  async execute({ action, jobId, statusFilter }, ctx) {
    const state = await readQueue(ctx.host.kv, ctx.session.id);

    if (action === "list") {
      const items = listItems(state, statusFilter);
      return {
        action,
        count: items.length,
        items,
        reminder:
          "Mostre a fila no playground. Só depois de approve é permitido prepare_application / submit_application.",
      };
    }

    if (!jobId) {
      return {
        ok: false,
        error: "jobId_required",
        message: "Indique jobId para approve ou reject.",
      };
    }

    const item = state.items[jobId];
    if (!item) {
      return {
        ok: false,
        error: "not_found",
        message: `Vaga ${jobId} não está na fila.`,
      };
    }

    if (item.status === "submitted") {
      return {
        ok: false,
        error: "already_submitted",
        message: "Esta candidatura já foi marcada como submetida.",
        item,
      };
    }

    const nextStatus = action === "approve" ? "approved" : "rejected";
    state.items[jobId] = {
      ...item,
      status: nextStatus,
      decidedAt: new Date().toISOString(),
    };
    await writeQueue(ctx.host.kv, ctx.session.id, state);

    return {
      ok: true,
      action,
      item: state.items[jobId],
      nextStep:
        nextStatus === "approved"
          ? "Chame prepare_application e só depois submit_application."
          : "Vaga rejeitada; não preparar nem submeter.",
    };
  },
});
