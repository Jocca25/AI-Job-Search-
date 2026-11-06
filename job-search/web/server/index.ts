import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";
import { loadCvProfile } from "../../bot/lib/cv.js";
import { scoreJobFit } from "../../bot/lib/scoring.js";
import { JOB_SOURCES } from "../../bot/lib/sources.js";
import {
  appendActivity,
  defaultPlatformStore,
  listLeadItems,
  readStoreFromDisk,
  writeStoreToDisk,
} from "../../bot/lib/store.js";
import { cvProfilePath } from "../../bot/lib/paths.js";
import type {
  ApprovalItem,
  CvProfile,
  LeadStatus,
  PlatformStore,
  SearchConfig,
} from "../../bot/lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const distDir = path.join(webRoot, "dist");
const PORT = Number(process.env.PORT || 8787);
const isProd = process.env.NODE_ENV === "production";

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function parseJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
}

function send(res: ServerResponse, status: number, body: Json): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function notFound(res: ServerResponse): void {
  send(res, 404, { error: "not_found" });
}

function dashboardStats(store: PlatformStore) {
  const items = Object.values(store.queue.items);
  const scores = items
    .map((i) => i.score100 ?? i.breakdown?.score100 ?? (i.score != null ? i.score * 10 : null))
    .filter((n): n is number => n != null);
  const avg =
    scores.length === 0
      ? null
      : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return {
    totalJobs: items.length,
    newOpportunities: items.filter((i) => i.leadStatus === "new").length,
    highMatch: items.filter((i) => (i.score100 ?? 0) >= 72).length,
    inProgress: items.filter((i) =>
      ["saved", "to_apply", "applied", "interview"].includes(i.leadStatus),
    ).length,
    averageMatchScore: avg,
    recentActivity: store.activity.slice(0, 8),
    topOpportunities: listLeadItems(store.queue)
      .filter((i) => i.leadStatus !== "dismissed")
      .slice(0, 5),
    newThisWeek: items.filter((i) => new Date(i.discoveredAt).getTime() >= weekAgo).length,
  };
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const method = req.method || "GET";
  const p = url.pathname.replace(/\/+$/, "") || "/";

  if (method === "GET" && p === "/api/health") {
    send(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && p === "/api/dashboard") {
    const store = await readStoreFromDisk();
    send(res, 200, { stats: dashboardStats(store), agent: store.agent });
    return;
  }

  if (method === "GET" && p === "/api/leads") {
    const store = await readStoreFromDisk();
    let items = listLeadItems(store.queue);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const status = url.searchParams.get("status");
    const location = url.searchParams.get("location");
    const employmentType = url.searchParams.get("employmentType");
    const seniority = url.searchParams.get("seniority");
    const minScore = Number(url.searchParams.get("minScore") || "0");
    const sort = url.searchParams.get("sort") || "relevance";

    if (status) items = items.filter((i) => i.leadStatus === status);
    if (location) {
      const loc = location.toLowerCase();
      items = items.filter((i) => (i.job.location || "").toLowerCase().includes(loc));
    }
    if (employmentType) {
      items = items.filter((i) => i.job.employmentType === employmentType);
    }
    if (seniority) {
      items = items.filter((i) => i.job.seniority === seniority);
    }
    if (minScore > 0) {
      items = items.filter((i) => (i.score100 ?? 0) >= minScore);
    }
    if (q) {
      items = items.filter((i) => {
        const blob = `${i.job.title} ${i.job.company} ${i.job.location ?? ""} ${i.job.source}`.toLowerCase();
        return blob.includes(q);
      });
    }

    if (sort === "date") {
      items = [...items].sort((a, b) => (a.discoveredAt < b.discoveredAt ? 1 : -1));
    } else if (sort === "score") {
      items = [...items].sort((a, b) => (b.score100 ?? 0) - (a.score100 ?? 0));
    }

    send(res, 200, { count: items.length, items });
    return;
  }

  if (method === "GET" && p.startsWith("/api/leads/")) {
    const jobId = decodeURIComponent(p.slice("/api/leads/".length));
    const store = await readStoreFromDisk();
    const item = store.queue.items[jobId];
    if (!item) {
      notFound(res);
      return;
    }
    send(res, 200, { item });
    return;
  }

  if (method === "PATCH" && p.startsWith("/api/leads/")) {
    const jobId = decodeURIComponent(p.slice("/api/leads/".length));
    const body = await parseJson<{
      leadStatus?: LeadStatus;
      notes?: string;
      approve?: boolean;
    }>(req);
    let store = await readStoreFromDisk();
    const item = store.queue.items[jobId];
    if (!item) {
      notFound(res);
      return;
    }

    const next: ApprovalItem = { ...item };
    if (body.leadStatus) {
      next.leadStatus = body.leadStatus;
      if (["applied", "interview", "offer"].includes(body.leadStatus)) {
        next.appliedAt = next.appliedAt ?? new Date().toISOString();
        if (next.status === "pending") next.status = "approved";
      }
      if (body.leadStatus === "dismissed" || body.leadStatus === "rejected") {
        next.status = "rejected";
      }
      if (body.leadStatus === "to_apply" && next.status === "pending") {
        next.status = "approved";
      }
      next.decidedAt = new Date().toISOString();
    }
    if (typeof body.notes === "string") next.notes = body.notes;
    if (body.approve) {
      next.status = "approved";
      if (next.leadStatus === "new") next.leadStatus = "to_apply";
    }

    store.queue.items[jobId] = next;
    store = appendActivity(store, {
      level: "info",
      category: "tracker",
      message: `Dashboard: ${next.job.title} → ${next.leadStatus}`,
      jobId,
    });
    await writeStoreToDisk(store);
    send(res, 200, { item: next });
    return;
  }

  if (method === "POST" && p.startsWith("/api/leads/") && p.endsWith("/prepare")) {
    const jobId = decodeURIComponent(p.slice("/api/leads/".length, -"/prepare".length));
    let store = await readStoreFromDisk();
    const item = store.queue.items[jobId];
    if (!item) {
      notFound(res);
      return;
    }
    const { profile, pdfExists } = await loadCvProfile();
    if (item.status === "pending") {
      item.status = "approved";
      item.leadStatus = item.leadStatus === "new" ? "to_apply" : item.leadStatus;
    }
    const strengths =
      item.breakdown?.matchingSkills?.slice(0, 6).join(", ") ||
      [...(profile.skills.dataBi ?? []).slice(0, 3)].join(", ");
    const letter = [
      `Exmos. Senhores,`,
      ``,
      `Chamo-me ${profile.fullName} e candidato-me à vaga de ${item.job.title} na ${item.job.company}.`,
      `Sou licenciado em Informática de Gestão (IADE) com experiência na Sonant AI em agentes de IA, prompts, workflows, Metabase e SQL.`,
      strengths ? `Competências relevantes: ${strengths}.` : "",
      `Estou disponível em ${item.job.location ?? profile.location}.`,
      ``,
      `Com os melhores cumprimentos,`,
      profile.fullName,
      profile.email,
      profile.phone,
    ]
      .filter(Boolean)
      .join("\n");

    const payload = {
      jobId,
      jobUrl: item.job.url,
      candidateName: profile.fullName,
      candidateEmail: profile.email,
      candidatePhone: profile.phone,
      coverLetterDraft: letter,
      adaptedCvNotes: [
        `Destacar: Sonant AI (AI agents, Metabase/SQL), Informática de Gestão, BI/Power BI.`,
        item.breakdown?.matchingSkills?.length
          ? `Competências a evidenciar: ${item.breakdown.matchingSkills.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      applicationEmailDraft: `Assunto: Candidatura — ${item.job.title} — ${profile.fullName}\n\n${letter}\n\nCV em anexo.`,
      questionAnswers: [] as { question: string; answer: string }[],
      cvPdfRelativePath: profile.pdfRelativePath,
      formFields: {
        name: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        linkedin: profile.linkedin ?? "",
        github: profile.github ?? "",
        location: profile.location,
      },
      browserSteps: [
        `Abrir ${item.job.url}`,
        "Rever se a vaga continua activa",
        "Preencher formulário",
        `Anexar ${profile.pdfRelativePath}`,
        "Colar carta / email",
        "PARAR — confirmação humana obrigatória antes de submeter",
      ],
      preparedAt: new Date().toISOString(),
    };

    store.queue.items[jobId] = {
      ...item,
      status: "prepared",
      leadStatus: "to_apply",
      preparedPayload: payload,
    };
    store = appendActivity(store, {
      level: "success",
      category: "prepare",
      message: `Materiais de candidatura gerados: ${item.job.title}`,
      jobId,
    });
    await writeStoreToDisk(store);
    send(res, 200, { ok: true, pdfExists, item: store.queue.items[jobId] });
    return;
  }

  if (method === "GET" && p === "/api/tracker") {
    const store = await readStoreFromDisk();
    const columns: LeadStatus[] = [
      "saved",
      "to_apply",
      "applied",
      "interview",
      "rejected",
      "offer",
    ];
    const board: Record<string, ApprovalItem[]> = {};
    for (const col of columns) {
      board[col] = listLeadItems(store.queue, col);
    }
    send(res, 200, { board });
    return;
  }

  if (method === "GET" && p === "/api/activity") {
    const store = await readStoreFromDisk();
    send(res, 200, {
      agent: store.agent,
      searchConfig: store.searchConfig,
      activity: store.activity,
      sources: JOB_SOURCES,
    });
    return;
  }

  if (method === "POST" && p === "/api/agent/control") {
    const body = await parseJson<{
      action: "start" | "pause" | "resume" | "set_config";
      config?: Partial<SearchConfig>;
      message?: string;
    }>(req);
    let store = await readStoreFromDisk();
    if (body.action === "start") {
      store.agent = {
        ...store.agent,
        status: "running",
        lastStartedAt: new Date().toISOString(),
        currentAction: "A aguardar execução do agente (Agent SDK)",
        lastError: null,
      };
      store = appendActivity(store, {
        level: "info",
        category: "agent",
        message:
          body.message ||
          "Pesquisa marcada como activa. Execute o agente (agent-sdk run/dev) para recolher vagas reais.",
      });
    } else if (body.action === "pause") {
      store.agent = { ...store.agent, status: "paused", currentAction: null };
      store = appendActivity(store, {
        level: "warning",
        category: "agent",
        message: "Agente em pausa",
      });
    } else if (body.action === "resume") {
      store.agent = {
        ...store.agent,
        status: "running",
        currentAction: "Pesquisa retomada",
      };
      store = appendActivity(store, {
        level: "info",
        category: "agent",
        message: "Agente retomado",
      });
    } else if (body.action === "set_config" && body.config) {
      store.searchConfig = { ...store.searchConfig, ...body.config };
      if (body.config.enabledSources) {
        store.agent = {
          ...store.agent,
          enabledSources: body.config.enabledSources,
        };
      }
      store = appendActivity(store, {
        level: "success",
        category: "config",
        message: "Configuração de pesquisa actualizada no dashboard",
      });
    }
    await writeStoreToDisk(store);
    send(res, 200, {
      agent: store.agent,
      searchConfig: store.searchConfig,
    });
    return;
  }

  if (method === "GET" && p === "/api/profile") {
    const { profile, pdfExists, pdfAbsolutePath } = await loadCvProfile();
    send(res, 200, { profile, pdfExists, pdfAbsolutePath });
    return;
  }

  if (method === "PUT" && p === "/api/profile") {
    const body = await parseJson<{ profile: CvProfile }>(req);
    if (!body.profile?.fullName) {
      send(res, 400, { error: "invalid_profile" });
      return;
    }
    await writeFile(cvProfilePath(), `${JSON.stringify(body.profile, null, 2)}\n`, "utf8");
    let store = await readStoreFromDisk();
    store = appendActivity(store, {
      level: "success",
      category: "profile",
      message: "Perfil actualizado no dashboard",
    });
    await writeStoreToDisk(store);
    send(res, 200, { ok: true, profile: body.profile });
    return;
  }

  if (method === "POST" && p === "/api/leads/rescore") {
    const { profile } = await loadCvProfile();
    let store = await readStoreFromDisk();
    let count = 0;
    for (const [id, item] of Object.entries(store.queue.items)) {
      const { score, score100, breakdown } = scoreJobFit(item.job, profile);
      store.queue.items[id] = { ...item, score, score100, breakdown };
      count += 1;
    }
    store = appendActivity(store, {
      level: "info",
      category: "score",
      message: `Recalculados ${count} scores com o perfil actual`,
    });
    await writeStoreToDisk(store);
    send(res, 200, { ok: true, rescored: count });
    return;
  }

  if (method === "GET" && p === "/api/store/meta") {
    const store = await readStoreFromDisk();
    send(res, 200, {
      updatedAt: store.updatedAt,
      leadCount: Object.keys(store.queue.items).length,
      empty: Object.keys(store.queue.items).length === 0,
      hint:
        Object.keys(store.queue.items).length === 0
          ? "Ainda não há leads. Inicie uma pesquisa e execute o agente Agent SDK para ingerir vagas reais."
          : null,
    });
    return;
  }

  // Ensure store file exists for first boot
  if (method === "POST" && p === "/api/store/init") {
    const existing = await readStoreFromDisk();
    if (!existing.updatedAt || existing.updatedAt.startsWith("1970")) {
      await writeStoreToDisk(defaultPlatformStore());
    }
    send(res, 200, { ok: true });
    return;
  }

  notFound(res);
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL): void {
  if (!isProd || !existsSync(distDir)) {
    send(res, 404, {
      error: "ui_not_built",
      message: "Em desenvolvimento use Vite em :5173 (proxy /api → :8787).",
    });
    return;
  }
  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(distDir, rel);
  if (!filePath.startsWith(distDir)) {
    send(res, 403, { error: "forbidden" });
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    createReadStream(filePath).pipe(res);
    return;
  }
  const fallback = path.join(distDir, "index.html");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  createReadStream(fallback).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    send(res, 500, { error: "server_error", message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Job Search API on http://127.0.0.1:${PORT}`);
});
