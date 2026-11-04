import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { loadCvProfile } from "../lib/cv.js";
import { readQueue, writeQueue } from "../lib/queue.js";
import { scoreJobFit } from "../lib/scoring.js";
import type { JobListing } from "../lib/types.js";

export default defineTool({
  description:
    "Score a job 0–10 against the CV using experience match, age (if present), and applicant count when available. Updates the approval queue item when the job id exists.",
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({
    job: z.object({
      id: z.string(),
      title: z.string(),
      company: z.string(),
      location: z.string().optional(),
      source: z.string(),
      url: z.string(),
      description: z.string().optional(),
      applicantCount: z.number().nullable().optional(),
      postedAt: z.string().nullable().optional(),
      rawNotes: z.string().nullable().optional(),
    }),
    enqueueIfMissing: z
      .boolean()
      .default(true)
      .describe("If true, create a pending approval item for this job."),
  }),
  dryRunResult: ({ job }) => ({
    jobId: job.id,
    score: 0,
    dryRun: true,
  }),
  async execute({ job, enqueueIfMissing }, ctx) {
    const { profile } = await loadCvProfile();
    const listing: JobListing = {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      source: job.source,
      url: job.url,
      description: job.description,
      applicantCount: job.applicantCount ?? null,
      postedAt: job.postedAt ?? null,
      rawNotes: job.rawNotes ?? null,
    };
    const { score, breakdown } = scoreJobFit(listing, profile);

    const state = await readQueue(ctx.host.kv, ctx.session.id);
    const existing = state.items[listing.id];
    if (existing) {
      state.items[listing.id] = {
        ...existing,
        job: listing,
        score,
        breakdown,
      };
      await writeQueue(ctx.host.kv, ctx.session.id, state);
    } else if (enqueueIfMissing) {
      state.items[listing.id] = {
        jobId: listing.id,
        job: listing,
        score,
        breakdown,
        status: "pending",
        queuedAt: new Date().toISOString(),
      };
      await writeQueue(ctx.host.kv, ctx.session.id, state);
    }

    return {
      jobId: listing.id,
      score,
      breakdown,
      profileName: profile.fullName,
      ageYears: profile.ageYears,
      queueStatus: state.items[listing.id]?.status ?? null,
    };
  },
});
