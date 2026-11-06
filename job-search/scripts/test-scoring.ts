import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreJobFit } from "../bot/lib/scoring.js";
import type { CvProfile, JobListing } from "../bot/lib/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = JSON.parse(
  await readFile(path.join(root, "data/cv-profile.json"), "utf8"),
) as CvProfile;

const juniorAi: JobListing = {
  id: "test_junior_ai",
  title: "Estágio AI / Data Analyst",
  company: "Example Labs",
  location: "Lisboa",
  source: "indeed_pt",
  url: "https://example.com/jobs/ai-intern",
  description: `
Requisitos: Python, SQL, interesse em AI agents e business intelligence.
Preferencial: Power BI, Metabase, prompt engineering.
Regime híbrido em Lisboa. Estágio curricular ou profissional.
`,
  workArrangement: "hybrid",
  employmentType: "internship",
  seniority: "internship",
  mandatoryRequirements: ["Python", "SQL"],
  preferredQualifications: ["Power BI", "Metabase"],
};

const seniorEng: JobListing = {
  id: "test_senior",
  title: "Senior Software Engineer",
  company: "BigCo",
  location: "Porto",
  source: "linkedin_jobs",
  url: "https://example.com/jobs/senior",
  description: "5+ years experience. Lead team. Java, Kubernetes, director track.",
  seniority: "senior",
  employmentType: "full_time",
  mandatoryRequirements: ["Java", "Kubernetes", "5+ years"],
};

const a = scoreJobFit(juniorAi, profile);
const b = scoreJobFit(seniorEng, profile);

console.log(
  JSON.stringify(
    {
      juniorAi: {
        score100: a.score100,
        recommendation: a.breakdown.recommendation,
        strengths: a.breakdown.strengths,
      },
      seniorEng: {
        score100: b.score100,
        recommendation: b.breakdown.recommendation,
      },
    },
    null,
    2,
  ),
);

if (a.score100 < 60) {
  throw new Error(`Expected junior AI role to score reasonably high, got ${a.score100}`);
}
if (a.breakdown.recommendation === "skip") {
  throw new Error("Junior AI internship should not be skip");
}
if (b.score100 >= a.score100) {
  throw new Error("Senior role should score below junior AI fit");
}
if (b.breakdown.recommendation !== "skip") {
  throw new Error("Senior role should recommend skip");
}

console.log("scoring ok");
