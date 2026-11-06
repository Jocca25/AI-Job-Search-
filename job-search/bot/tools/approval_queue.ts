import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { listItems } from "../lib/queue.js";
import {
  appendActivity,
  readPlatformStore,
  writePlatformStore,
} from "../lib/store.js";

export default defineTool({
  description:
    "Manage the human approval queue: list, approve, or reject. Submits are blocked until status is approved. Prefer manage_leads for tracker stages in the dashboard.",
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
    let store = await readPlatformStore(ctx.host.kv);

    if (action === "list") {
      const items = listItems(store.queue, statusFilter);
      return {
        action,
        count: items.length,
        items,
        reminder:
          "Mostre a fila no dashboard (ou Dev console). Só depois de approve é permitido prepare_application / submit_application.",
      };
    }

    if (!jobId) {
      return {
        ok: false,
        error: "jobId_required",
        message: "Indique jobId para approve ou reject.",
      };
    }

    const item = store.queue.items[jobId];
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
    store.queue.items[jobId] = {
      ...item,
      status: nextStatus,
      leadStatus:
        nextStatus === "approved"
          ? item.leadStatus === "new" || item.leadStatus === "saved"
            ? "to_apply"
            : item.leadStatus
          : "dismissed",
      decidedAt: new Date().toISOString(),
    };

    store = appendActivity(store, {
      level: nextStatus === "approved" ? "success" : "warning",
      category: "approval",
      message:
        nextStatus === "approved"
          ? `Aprovado para preparação: ${item.job.title}`
          : `Rejeitado/dismissed: ${item.job.title}`,
      jobId,
    });
    store = await writePlatformStore(store, ctx.host.kv);

    return {
      ok: true,
      action,
      item: store.queue.items[jobId],
      nextStep:
        nextStatus === "approved"
          ? "Chame prepare_application e só depois submit_application."
          : "Vaga rejeitada; não preparar nem submeter.",
    };
  },
});
