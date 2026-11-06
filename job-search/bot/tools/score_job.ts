import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { loadCvProfile } from "../lib/cv.js";
import {
  appendActivity,
  readPlatformStore,
  writePlatformStore,
} from "../lib/store.js";
import { scoreJobFit } from "../lib/scoring.js";
import type { JobListing } from "../lib/types.js";

export default defineTool({
  description:
    "Score a job 0–100 against the CV with explainable weighted dimensions (profile, skills, seniority, interests, location). Distinguishes mandatory vs preferred gaps. Updates the durable lead store.",
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
    }),
    enqueueIfMissing: z
      .boolean()
      .default(true)
      .describe("If true, create a lead for this job when missing."),
  }),
  dryRunResult: ({ job }) => ({
    jobId: job.id,
    score: 0,
    score100: 0,
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
      salary: job.salary ?? null,
      deadline: job.deadline ?? null,
      workArrangement: job.workArrangement ?? "unknown",
      employmentType: job.employmentType ?? "unknown",
      seniority: job.seniority ?? "unknown",
      category: job.category ?? null,
      companyOverview: job.companyOverview ?? null,
      mandatoryRequirements: job.mandatoryRequirements,
      preferredQualifications: job.preferredQualifications,
      active: job.active ?? null,
      urlVerified: job.urlVerified ?? null,
    };
    const { score, score100, breakdown } = scoreJobFit(listing, profile);

    let store = await readPlatformStore(ctx.host.kv);
    const existing = store.queue.items[listing.id];
    const now = new Date().toISOString();

    if (existing) {
      store.queue.items[listing.id] = {
        ...existing,
        job: { ...existing.job, ...listing },
        score,
        score100,
        breakdown,
      };
    } else if (enqueueIfMissing) {
      store.queue.items[listing.id] = {
        jobId: listing.id,
        job: listing,
        score,
        score100,
        breakdown,
        status: "pending",
        leadStatus: "new",
        queuedAt: now,
        discoveredAt: now,
      };
    }

    store = appendActivity(store, {
      level: "info",
      category: "score",
      message: `Compatibilidade calculada para ${listing.title}: ${score100}/100 (${breakdown.recommendation})`,
      jobId: listing.id,
      details: breakdown.whyMatches,
    });

    store = await writePlatformStore(store, ctx.host.kv);

    return {
      jobId: listing.id,
      score,
      score100,
      breakdown,
      profileName: profile.fullName,
      ageYears: profile.ageYears,
      queueStatus: store.queue.items[listing.id]?.status ?? null,
      leadStatus: store.queue.items[listing.id]?.leadStatus ?? null,
    };
  },
});
