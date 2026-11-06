import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { loadCvProfile } from "../lib/cv.js";
import {
  appendActivity,
  readPlatformStore,
  writePlatformStore,
} from "../lib/store.js";
import type { ApplicationPayload } from "../lib/types.js";

export default defineTool({
  description:
    "Prepare application materials for an approved/to_apply job: cover letter, adapted CV notes, email draft, form fields, optional Q&A. Does NOT submit.",
  execution: "server",
  effect: "write",
  inputSchema: z.object({
    jobId: z.string(),
    coverLetterDraft: z
      .string()
      .optional()
      .describe("Optional custom cover letter; otherwise a short PT draft is generated."),
    adaptedCvNotes: z
      .string()
      .optional()
      .describe("Optional notes on how to tailor the CV to this job."),
    applicationEmailDraft: z.string().optional(),
    questionAnswers: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        }),
      )
      .optional(),
    extraFormFields: z.record(z.string(), z.string()).optional(),
  }),
  dryRunResult: ({ jobId }) => ({
    ok: false,
    dryRun: true,
    jobId,
  }),
  async execute(
    {
      jobId,
      coverLetterDraft,
      adaptedCvNotes,
      applicationEmailDraft,
      questionAnswers,
      extraFormFields,
    },
    ctx,
  ) {
    let store = await readPlatformStore(ctx.host.kv);
    const item = store.queue.items[jobId];
    if (!item) {
      return { ok: false, error: "not_found", message: `Vaga ${jobId} não está na fila.` };
    }

    const allowedApproval =
      item.status === "approved" ||
      item.status === "prepared" ||
      item.leadStatus === "to_apply" ||
      item.leadStatus === "saved";
    if (!allowedApproval) {
      return {
        ok: false,
        error: "not_approved",
        message:
          "A vaga precisa de estar approved / to_apply / saved antes de preparar a candidatura.",
        status: item.status,
        leadStatus: item.leadStatus,
      };
    }

    const { profile, pdfExists } = await loadCvProfile();
    const strengths =
      item.breakdown?.matchingSkills?.slice(0, 6).join(", ") ||
      [
        ...(profile.skills.dataBi ?? []).slice(0, 3),
        ...(profile.skills.aiAutomation ?? []).slice(0, 2),
      ].join(", ");

    const letter =
      coverLetterDraft?.trim() ||
      [
        `Exmos. Senhores,`,
        ``,
        `Chamo-me ${profile.fullName} e candidato-me à vaga de ${item.job.title} na ${item.job.company}.`,
        `Sou estudante/licenciado em Informática de Gestão (IADE) e tenho experiência prática na Sonant AI com agentes de IA, prompts, workflows, Metabase e SQL.`,
        strengths
          ? `Competências especialmente relevantes para esta oportunidade: ${strengths}.`
          : "",
        `Procuro oportunidades de estágio, trainee, graduate ou junior onde possa juntar tecnologia e negócio.`,
        `Estou disponível para integrar a equipa em ${item.job.location ?? profile.location}.`,
        ``,
        `Com os melhores cumprimentos,`,
        profile.fullName,
        profile.email,
        profile.phone,
      ]
        .filter(Boolean)
        .join("\n");

    const cvNotes =
      adaptedCvNotes?.trim() ||
      [
        `Destacar no CV para “${item.job.title}” @ ${item.job.company}:`,
        `- Experiência Sonant AI (AI agents, prompts, workflows, Metabase/SQL)`,
        `- Formação em Informática de Gestão (IADE) e projectos de BI/Power BI`,
        item.breakdown?.matchingSkills?.length
          ? `- Competências a evidenciar: ${item.breakdown.matchingSkills.join(", ")}`
          : `- Competências a evidenciar: SQL, Python, Power BI, AI Agents, análise de dados`,
        item.breakdown?.missingPreferred?.length
          ? `- Lacunas nice-to-have a endereçar honestamente: ${item.breakdown.missingPreferred.join(", ")}`
          : `- Não inventar competências em falta`,
      ].join("\n");

    const email =
      applicationEmailDraft?.trim() ||
      [
        `Assunto: Candidatura — ${item.job.title} — ${profile.fullName}`,
        ``,
        letter,
        ``,
        `CV em anexo (${profile.pdfRelativePath}).`,
      ].join("\n");

    const payload: ApplicationPayload = {
      jobId,
      jobUrl: item.job.url,
      candidateName: profile.fullName,
      candidateEmail: profile.email,
      candidatePhone: profile.phone,
      coverLetterDraft: letter,
      adaptedCvNotes: cvNotes,
      applicationEmailDraft: email,
      questionAnswers: questionAnswers ?? [],
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
        "Rever a descrição e confirmar que a vaga continua activa",
        "Preencher campos do formulário com formFields",
        `Anexar o PDF em ${profile.pdfRelativePath}`,
        "Colar a carta de apresentação / email",
        "PARAR e pedir confirmação humana antes de clicar Submeter / Apply",
        "Só depois chamar submit_application com confirmSubmit=true",
      ],
      preparedAt: new Date().toISOString(),
    };

    store.queue.items[jobId] = {
      ...item,
      status: "prepared",
      leadStatus:
        item.leadStatus === "new" || item.leadStatus === "saved"
          ? "to_apply"
          : item.leadStatus,
      preparedPayload: payload,
    };

    store = appendActivity(store, {
      level: "success",
      category: "prepare",
      message: `Candidatura preparada para ${item.job.title} (aguarda revisão humana)`,
      jobId,
    });
    store = await writePlatformStore(store, ctx.host.kv);

    return {
      ok: true,
      pdfExists,
      payload,
      status: "prepared",
      warning:
        "Isto apenas prepara materiais. A submissão real exige confirmação humana explícita (submit_application com confirmSubmit=true).",
    };
  },
});
