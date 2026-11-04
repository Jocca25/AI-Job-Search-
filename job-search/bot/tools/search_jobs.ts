import { createHash } from "node:crypto";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { JOB_SOURCES, getSource } from "../lib/sources.js";
import type { JobListing } from "../lib/types.js";
import { readQueue, writeQueue } from "../lib/queue.js";

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
    "Build Portugal job-portal search URLs and optionally ingest discovered listings into the session queue as pending candidates (not submitted).",
  execution: "server",
  effect: (input) =>
    input.listings && input.listings.length > 0 ? "write" : "read",
  inputSchema: z.object({
    query: z.string().describe("Keywords, e.g. 'estágio IT Lisboa' or 'Python Power BI'"),
    location: z.string().default("Lisboa"),
    sources: z
      .array(z.string())
      .optional()
      .describe("Optional source ids; default is all configured PT portals."),
    listings: z
      .array(listingSchema)
      .optional()
      .describe(
        "Optional jobs already found (from browsing portals). When provided, they are stored as pending approval candidates.",
      ),
  }),
  dryRunResult: ({ query, location, sources, listings }) => ({
    query,
    location,
    portals: [],
    ingested: listings?.length ?? 0,
    dryRun: true,
    sourcesFilter: sources ?? null,
  }),
  async execute({ query, location, sources, listings }, ctx) {
    const selected = sources?.length
      ? JOB_SOURCES.filter((s) => sources.includes(s.id))
      : JOB_SOURCES;

    const portals = selected.map((source) => ({
      id: source.id,
      name: source.name,
      homeUrl: source.homeUrl,
      searchUrl: source.buildSearchUrl(query, location),
    }));

    const unknownSources = (sources ?? []).filter((id) => !getSource(id));
    const ingested: JobListing[] = [];

    if (listings && listings.length > 0) {
      const state = await readQueue(ctx.host.kv, ctx.session.id);
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
        };
        ingested.push(job);
        const existing = state.items[job.id];
        if (!existing) {
          state.items[job.id] = {
            jobId: job.id,
            job,
            status: "pending",
            queuedAt: new Date().toISOString(),
          };
        } else {
          state.items[job.id] = {
            ...existing,
            job,
          };
        }
      }
      await writeQueue(ctx.host.kv, ctx.session.id, state);
    }

    return {
      query,
      location,
      portals,
      unknownSources,
      ingestedCount: ingested.length,
      ingested,
      guidance:
        "Abra os searchUrl, recolha vagas relevantes e volte a chamar search_jobs com listings[], ou use score_job / approval_queue. Nunca submeta candidaturas automaticamente.",
    };
  },
});
