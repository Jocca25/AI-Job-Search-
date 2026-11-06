import { createHash } from "node:crypto";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { JOB_SOURCES, getSource } from "../lib/sources.js";
import {
  appendActivity,
  findDuplicate,
  readPlatformStore,
  writePlatformStore,
} from "../lib/store.js";
import { loadCvProfile } from "../lib/cv.js";
import { scoreJobFit } from "../lib/scoring.js";
import type { JobListing, LeadStatus } from "../lib/types.js";

const listingSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  source: z.string(),
  url: z.string(),
  description: z.string().optional(),
  applicantCount: z.number().nullable().optional(),
  postedAt: z.string().nullable().optional(),
  rawNotes: z.string().nullable().optional(),
  salary: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  workArrangement: z
    .enum(["remote", "hybrid", "onsite", "unknown"])
    .optional(),
  employmentType: z
    .enum([
      "internship",
      "traineeship",
      "graduate",
      "junior",
      "full_time",
      "part_time",
      "contract",
      "unknown",
    ])
    .optional(),
  seniority: z
    .enum([
      "internship",
      "entry",
      "junior",
      "mid",
      "senior",
      "lead",
      "unknown",
    ])
    .optional(),
  category: z.string().nullable().optional(),
  companyOverview: z.string().nullable().optional(),
  mandatoryRequirements: z.array(z.string()).optional(),
  preferredQualifications: z.array(z.string()).optional(),
  active: z.boolean().nullable().optional(),
  urlVerified: z.boolean().nullable().optional(),
});

function stableId(listing: {
  title: string;
  company: string;
  url: string;
  source: string;
}): string {
  const digest = createHash("sha256")
    .update(`${listing.source}|${listing.company}|${listing.title}|${listing.url}`)
    .digest("hex")
    .slice(0, 12);
  return `job_${digest}`;
}

export default defineTool({
  description:
    "Build Portugal job-portal search URLs and ingest discovered listings into the durable platform store (deduped, scored). Never auto-submits.",
  execution: "server",
  effect: (input) =>
    input.listings && input.listings.length > 0 ? "write" : "read",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Keywords, e.g. 'estágio AI Lisboa' or 'junior data analyst'"),
    location: z.string().default("Lisboa"),
    sources: z
      .array(z.string())
      .optional()
      .describe("Optional source ids; default is configured PT portals."),
    listings: z
      .array(listingSchema)
      .optional()
      .describe(
        "Jobs already found from portals. Stored as durable leads with match scores.",
      ),
    activityNote: z
      .string()
      .optional()
      .describe("Optional activity-feed message describing this search step."),
  }),
  dryRunResult: ({ query, location, sources, listings }) => ({
    query,
    location,
    portals: [],
    ingested: listings?.length ?? 0,
    dryRun: true,
    sourcesFilter: sources ?? null,
  }),
  async execute({ query, location, sources, listings, activityNote }, ctx) {
    let store = await readPlatformStore(ctx.host.kv);
    const enabled =
      sources?.length
        ? sources
        : store.searchConfig.enabledSources.length
          ? store.searchConfig.enabledSources
          : JOB_SOURCES.map((s) => s.id);

    const selected = JOB_SOURCES.filter((s) => enabled.includes(s.id));
    const portals = selected.map((source) => ({
      id: source.id,
      name: source.name,
      homeUrl: source.homeUrl,
      searchUrl: source.buildSearchUrl(query, location),
    }));

    const unknownSources = enabled.filter((id) => !getSource(id));
    const ingested: JobListing[] = [];
    const skippedDuplicates: string[] = [];
    const dismissedLowQuality: string[] = [];

    store = appendActivity(store, {
      level: "info",
      category: "search",
      message:
        activityNote?.trim() ||
        `A pesquisar vagas: “${query}” em ${location}`,
      details: `Fontes: ${selected.map((s) => s.name).join(", ")}`,
    });

    store = {
      ...store,
      agent: {
        ...store.agent,
        status: "running",
        currentAction: `Pesquisar: ${query}`,
        searchQuery: query,
        searchLocation: location,
        lastStartedAt: store.agent.lastStartedAt ?? new Date().toISOString(),
        enabledSources: selected.map((s) => s.id),
      },
    };

    if (listings && listings.length > 0) {
      const { profile } = await loadCvProfile();
      for (const raw of listings) {
        const job: JobListing = {
          id: raw.id && raw.id.trim() ? raw.id : stableId(raw),
          title: raw.title,
          company: raw.company,
          location: raw.location,
          source: raw.source,
          url: raw.url,
          description: raw.description,
          applicantCount: raw.applicantCount ?? null,
          postedAt: raw.postedAt ?? null,
          rawNotes: raw.rawNotes ?? null,
          salary: raw.salary ?? null,
          deadline: raw.deadline ?? null,
          workArrangement: raw.workArrangement ?? "unknown",
          employmentType: raw.employmentType ?? "unknown",
          seniority: raw.seniority ?? "unknown",
          category: raw.category ?? null,
          companyOverview: raw.companyOverview ?? null,
          mandatoryRequirements: raw.mandatoryRequirements,
          preferredQualifications: raw.preferredQualifications,
          active: raw.active ?? null,
          urlVerified: raw.urlVerified ?? null,
        };

        const dup = findDuplicate(store, job);
        if (dup && dup.jobId !== job.id) {
          skippedDuplicates.push(job.url);
          continue;
        }

        const { score, score100, breakdown } = scoreJobFit(job, profile);
        let leadStatus: LeadStatus = dup?.leadStatus ?? "new";

        if (
          store.searchConfig.autoDismissSenior &&
          (breakdown.recommendation === "skip" ||
            job.seniority === "senior" ||
            job.seniority === "lead") &&
          score100 < store.searchConfig.minScoreToKeep
        ) {
          leadStatus = "dismissed";
          dismissedLowQuality.push(job.id);
        }

        ingested.push(job);
        const existing = store.queue.items[job.id] ?? dup;
        const now = new Date().toISOString();
        store.queue.items[job.id] = {
          jobId: job.id,
          job: existing ? { ...existing.job, ...job, id: job.id } : job,
          score,
          score100,
          breakdown,
          status: existing?.status ?? "pending",
          leadStatus: existing && existing.leadStatus !== "new" ? existing.leadStatus : leadStatus,
          queuedAt: existing?.queuedAt ?? now,
          discoveredAt: existing?.discoveredAt ?? now,
          decidedAt: existing?.decidedAt,
          appliedAt: existing?.appliedAt ?? null,
          notes: existing?.notes ?? null,
          preparedPayload: existing?.preparedPayload,
          submitResult: existing?.submitResult,
        };

        store = appendActivity(store, {
          level: leadStatus === "dismissed" ? "warning" : "success",
          category: "score",
          message: `Analisada: ${job.title} @ ${job.company} (${score100}/100 · ${breakdown.recommendation})`,
          jobId: job.id,
        });
      }

      store.agent = {
        ...store.agent,
        jobsProcessed: store.agent.jobsProcessed + ingested.length,
        lastExecutionAt: new Date().toISOString(),
        currentAction: null,
        status: "idle",
      };
    }

    store = await writePlatformStore(store, ctx.host.kv);

    return {
      query,
      location,
      portals,
      unknownSources,
      ingestedCount: ingested.length,
      skippedDuplicates: skippedDuplicates.length,
      dismissedLowQuality: dismissedLowQuality.length,
      ingested,
      guidance:
        "Abra os searchUrl, recolha vagas relevantes e volte a chamar search_jobs com listings[]. Qualidade > quantidade. Nunca invente campos em falta. Nunca submeta candidaturas automaticamente.",
    };
  },
});
