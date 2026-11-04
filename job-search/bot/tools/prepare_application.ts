import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { loadCvProfile } from "../lib/cv.js";
import { readQueue, writeQueue } from "../lib/queue.js";
import type { ApplicationPayload } from "../lib/types.js";

export default defineTool({
  description:
    "Prepare an application payload (cover letter draft, form fields, browser steps) for an approved job. Does not submit.",
  execution: "server",
  effect: "write",
  inputSchema: z.object({
    jobId: z.string(),
    coverLetterDraft: z
      .string()
      .optional()
      .describe("Optional custom cover letter; otherwise a short PT draft is generated."),
    extraFormFields: z.record(z.string(), z.string()).optional(),
  }),
  dryRunResult: ({ jobId }) => ({
    ok: false,
    dryRun: true,
    jobId,
  }),
  async execute({ jobId, coverLetterDraft, extraFormFields }, ctx) {
    const state = await readQueue(ctx.host.kv, ctx.session.id);
    const item = state.items[jobId];
    if (!item) {
      return { ok: false, error: "not_found", message: `Vaga ${jobId} não está na fila.` };
    }
    if (item.status !== "approved" && item.status !== "prepared") {
      return {
        ok: false,
        error: "not_approved",
        message:
          "A vaga precisa de status approved na fila (approval_queue action=approve) antes de preparar a candidatura.",
        status: item.status,
      };
    }

    const { profile, pdfExists } = await loadCvProfile();
    const letter =
      coverLetterDraft?.trim() ||
      [
        `Exmos. Senhores,`,
        ``,
        `Chamo-me ${profile.fullName} e candidato-me à vaga de ${item.job.title} na ${item.job.company}.`,
        `Tenho formação em Informática de Gestão (IADE) e experiência prática com Python, SQL, Power BI, Firebase e desenvolvimento web.`,
        `Estou disponível para integrar a equipa em ${item.job.location ?? profile.location}.`,
        ``,
        `Com os melhores cumprimentos,`,
        profile.fullName,
        profile.email,
        profile.phone,
      ].join("\n");

    const payload: ApplicationPayload = {
      jobId,
      jobUrl: item.job.url,
      candidateName: profile.fullName,
      candidateEmail: profile.email,
      candidatePhone: profile.phone,
      coverLetterDraft: letter,
      cvPdfRelativePath: profile.pdfRelativePath,
      formFields: {
        name: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        linkedin: profile.linkedin ?? "",
        github: profile.github ?? "",
        location: profile.location,
        ...(extraFormFields ?? {}),
      },
      browserSteps: [
        `Abrir ${item.job.url}`,
        "Preencher campos do formulário com formFields",
        `Anexar o PDF em ${profile.pdfRelativePath}`,
        "Colar a carta de apresentação",
        "PARAR e pedir confirmação humana antes de clicar Submeter / Apply",
        "Só depois chamar submit_application com confirmSubmit=true",
      ],
      preparedAt: new Date().toISOString(),
    };

    state.items[jobId] = {
      ...item,
      status: "prepared",
      preparedPayload: payload,
    };
    await writeQueue(ctx.host.kv, ctx.session.id, state);

    return {
      ok: true,
      pdfExists,
      payload,
      status: "prepared",
      warning:
        "Isto apenas prepara o payload. A submissão real exige approve prévio + submit_application com confirmSubmit=true.",
    };
  },
});
