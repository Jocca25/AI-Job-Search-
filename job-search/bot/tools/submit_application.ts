import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { readQueue, writeQueue } from "../lib/queue.js";

export default defineTool({
  description:
    "Gate for real application submit. Refuses unless the job is approved (or prepared after approve) in ctx.host.kv and confirmSubmit=true. Returns browser/automation guidance; does not scrape credentials.",
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

    const state = await readQueue(ctx.host.kv, ctx.session.id);
    const item = state.items[jobId];
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
          "Bloqueado: a vaga não está approved/prepared em ctx.host.kv. Use approval_queue para aprovar primeiro.",
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
        "O agente não envia automaticamente para portais. Use estes passos no browser só com o OK humano já registado na fila.",
    };

    state.items[jobId] = {
      ...item,
      status: "submitted",
      decidedAt: item.decidedAt ?? new Date().toISOString(),
      submitResult,
    };
    await writeQueue(ctx.host.kv, ctx.session.id, state);

    return {
      ok: true,
      submitted: true,
      status: "submitted",
      submitResult,
    };
  },
});
