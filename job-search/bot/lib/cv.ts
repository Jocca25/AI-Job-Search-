import { readFile } from "node:fs/promises";
import { cvPdfPath, cvProfilePath } from "./paths.js";
import type { CvProfile, ScoringWeights } from "./types.js";

const DEFAULT_WEIGHTS: ScoringWeights = {
  overallProfile: 0.3,
  technicalSkills: 0.25,
  experienceSeniority: 0.2,
  careerInterests: 0.15,
  locationArrangement: 0.1,
};

function withDefaults(profile: CvProfile): CvProfile {
  return {
    ...profile,
    preferences: profile.preferences ?? {
      interests: [],
      preferredLocations: ["Lisboa"],
      openToPortugalElsewhere: true,
      workArrangements: ["hybrid", "onsite", "remote"],
      jobTypes: ["internship", "traineeship", "graduate", "junior"],
      seniorityLevels: ["internship", "entry", "junior"],
      targetKeywords: [],
      avoidKeywords: [],
    },
    scoringWeights: profile.scoringWeights ?? DEFAULT_WEIGHTS,
    skills: {
      dataBi: profile.skills?.dataBi ?? [],
      programming: profile.skills?.programming ?? [],
      webTools: profile.skills?.webTools ?? [],
      aiAutomation: profile.skills?.aiAutomation ?? [],
      languages: profile.skills?.languages ?? [],
    },
  };
}

export async function loadCvProfile(): Promise<{
  profile: CvProfile;
  pdfAbsolutePath: string;
  pdfExists: boolean;
}> {
  const raw = await readFile(cvProfilePath(), "utf8");
  const profile = withDefaults(JSON.parse(raw) as CvProfile);
  const pdfAbsolutePath = cvPdfPath(profile.pdfFile);
  let pdfExists = false;
  try {
    await readFile(pdfAbsolutePath);
    pdfExists = true;
  } catch {
    pdfExists = false;
  }
  return { profile, pdfAbsolutePath, pdfExists };
}
