import { writeFile } from "node:fs/promises";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { loadCvProfile } from "../lib/cv.js";
import { cvProfilePath } from "../lib/paths.js";
import {
  appendActivity,
  readPlatformStore,
  writePlatformStore,
} from "../lib/store.js";
import type { CvProfile } from "../lib/types.js";

export default defineTool({
  description:
    "Read or update the candidate profile (CV JSON): skills, preferences, locations, scoring weights. The matcher uses this profile for every score.",
  execution: "server",
  effect: (input) => (input.action === "get" ? "read" : "write"),
  inputSchema: z.object({
    action: z.enum(["get", "update"]),
    patch: z
      .object({
        summary: z.string().optional(),
        location: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        github: z.string().optional(),
        linkedin: z.string().optional(),
        ageYears: z.number().nullable().optional(),
        skills: z
          .object({
            dataBi: z.array(z.string()).optional(),
            programming: z.array(z.string()).optional(),
            webTools: z.array(z.string()).optional(),
            aiAutomation: z.array(z.string()).optional(),
          })
          .optional(),
        preferences: z
          .object({
            interests: z.array(z.string()).optional(),
            preferredLocations: z.array(z.string()).optional(),
            openToPortugalElsewhere: z.boolean().optional(),
            workArrangements: z
              .array(z.enum(["remote", "hybrid", "onsite", "unknown"]))
              .optional(),
            jobTypes: z
              .array(
                z.enum([
                  "internship",
                  "traineeship",
                  "graduate",
                  "junior",
                  "full_time",
                  "part_time",
                  "contract",
                  "unknown",
                ]),
              )
              .optional(),
            seniorityLevels: z
              .array(
                z.enum([
                  "internship",
                  "entry",
                  "junior",
                  "mid",
                  "senior",
                  "lead",
                  "unknown",
                ]),
              )
              .optional(),
            targetKeywords: z.array(z.string()).optional(),
            avoidKeywords: z.array(z.string()).optional(),
          })
          .optional(),
        scoringWeights: z
          .object({
            overallProfile: z.number().optional(),
            technicalSkills: z.number().optional(),
            experienceSeniority: z.number().optional(),
            careerInterests: z.number().optional(),
            locationArrangement: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
  }),
  dryRunResult: ({ action }) => ({ action, dryRun: true }),
  async execute({ action, patch }, ctx) {
    const loaded = await loadCvProfile();
    if (action === "get") {
      return {
        profile: loaded.profile,
        pdfExists: loaded.pdfExists,
        pdfAbsolutePath: loaded.pdfAbsolutePath,
      };
    }

    if (!patch) {
      return {
        ok: false,
        error: "patch_required",
        message: "Forneça patch para update.",
      };
    }

    const next: CvProfile = {
      ...loaded.profile,
      ...patch,
      skills: {
        ...loaded.profile.skills,
        ...(patch.skills ?? {}),
        languages: loaded.profile.skills.languages,
      },
      preferences: {
        ...loaded.profile.preferences,
        ...(patch.preferences ?? {}),
      },
      scoringWeights: {
        ...loaded.profile.scoringWeights,
        ...(patch.scoringWeights ?? {}),
      },
    };

    await writeFile(cvProfilePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");

    let store = await readPlatformStore(ctx.host.kv);
    store = appendActivity(store, {
      level: "success",
      category: "profile",
      message: "Perfil do candidato actualizado",
    });
    await writePlatformStore(store, ctx.host.kv);

    return { ok: true, profile: next };
  },
});
