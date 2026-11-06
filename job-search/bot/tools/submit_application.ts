import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  appendActivity,
  readPlatformStore,
  writePlatformStore,
} from "../lib/store.js";

export default defineTool({
  description:
    "Gate for real application submit. Refuses unless the job is approved/prepared and confirmSubmit=true. Returns browser guidance only — never auto-sends.",
  execution: "server",
  effect: "write",
  needsApproval: true,
  inputSchema: z.object({
    jobId: z.string(),
    confirmSubmit: z
      .boolean()
      .describe("Must be true. Explicit human confirmation that submit may proceed."),
    submitNotes: z.string().optional(),
  }),
  dryRunResult: ({ jobId }) => ({
    ok: false,
    dryRun: true,
    jobId,
    submitted: false,
  }),
  async execute({ jobId, confirmSubmit, submitNotes }, ctx) {
    if (!confirmSubmit) {
      return {
        ok: false,
        error: "confirm_required",
        submitted: false,
        message:
          "confirmSubmit=false. Nenhuma candidatura foi enviada. Peça aprovação explícita ao utilizador.",
      };
    }

    let store = await readPlatformStore(ctx.host.kv);
    const item = store.queue.items[jobId];
    if (!item) {
      return {
        ok: false,
        error: "not_found",
        submitted: false,
        message: `Vaga ${jobId} não está na fila de aprovação.`,
      };
    }

    if (item.status !== "approved" && item.status !== "prepared") {
      return {
        ok: false,
        error: "approval_required",
        submitted: false,
        status: item.status,
        message:
          "Bloqueado: a vaga não está approved/prepared. Use approval_queue ou o dashboard para aprovar primeiro.",
      };
    }

    if (!item.preparedPayload) {
      return {
        ok: false,
        error: "not_prepared",
        submitted: false,
        message:
          "Chame prepare_application antes de submit_application para gerar o payload e os passos de browser.",
      };
    }

    const submitResult = {
      mode: "manual_browser_guidance",
      submittedAt: new Date().toISOString(),
      jobUrl: item.job.url,
      notes: submitNotes ?? null,
      steps: item.preparedPayload.browserSteps,
      formFields: item.preparedPayload.formFields,
      cvPdfRelativePath: item.preparedPayload.cvPdfRelativePath,
      coverLetterDraft: item.preparedPayload.coverLetterDraft,
      safety:
        "O agente não envia automaticamente para portais. Use estes passos no browser só com o OK humano já registado.",
    };

    store.queue.items[jobId] = {
      ...item,
      status: "submitted",
      leadStatus: "applied",
      appliedAt: new Date().toISOString(),
      decidedAt: item.decidedAt ?? new Date().toISOString(),
      submitResult,
    };

    store = appendActivity(store, {
      level: "success",
      category: "submit",
      message: `Candidatura marcada como submetida (orientação manual): ${item.job.title}`,
      jobId,
    });
    store = await writePlatformStore(store, ctx.host.kv);

    return {
      ok: true,
      submitted: true,
      status: "submitted",
      submitResult,
    };
  },
});
