import type { CvProfile, FitBreakdown, JobListing } from "./types.js";

function clamp(n: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, n));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ]+/i)
    .filter((t) => t.length > 1);
}

function overlapScore(jobText: string, profileTokens: string[]): number {
  const jobTokens = new Set(tokenize(jobText));
  if (jobTokens.size === 0 || profileTokens.length === 0) return 3;
  let hits = 0;
  for (const token of profileTokens) {
    if (jobTokens.has(token)) hits += 1;
  }
  const ratio = hits / Math.max(8, Math.min(profileTokens.length, 40));
  return clamp(Math.round(ratio * 12));
}

function applicantScore(count: number | null | undefined): number | null {
  if (count == null || Number.isNaN(count)) return null;
  if (count <= 5) return 10;
  if (count <= 20) return 8;
  if (count <= 50) return 6;
  if (count <= 100) return 4;
  if (count <= 250) return 2;
  return 1;
}

function ageScore(
  ageYears: number | null | undefined,
  jobText: string,
): number | null {
  if (ageYears == null) return null;
  const lower = jobText.toLowerCase();
  const junior =
    /júnior|junior|estágio|estagio|entry.?level|recém.?formado|recem.?formado|trainee/.test(
      lower,
    );
  const senior = /sénior|senior|lead|principal|diretor|director/.test(lower);
  if (junior) {
    if (ageYears <= 28) return 9;
    if (ageYears <= 35) return 7;
    return 5;
  }
  if (senior) {
    if (ageYears >= 32) return 9;
    if (ageYears >= 26) return 6;
    return 4;
  }
  return 7;
}

export function scoreJobFit(
  job: JobListing,
  profile: CvProfile,
): { score: number; breakdown: FitBreakdown } {
  const skillBag = [
    ...(profile.skills.dataBi ?? []),
    ...(profile.skills.programming ?? []),
    ...(profile.skills.webTools ?? []),
    ...profile.experience.flatMap((e) => [
      e.title,
      e.company,
      ...(e.highlights ?? []),
    ]),
    ...(profile.projects ?? []),
  ];
  const profileTokens = tokenize(skillBag.join(" "));
  const jobText = [job.title, job.company, job.description ?? "", job.rawNotes ?? ""].join(
    " ",
  );

  const experienceMatch = overlapScore(jobText, profileTokens);
  const ageFit = ageScore(profile.ageYears, jobText);
  const applicantCompetition = applicantScore(job.applicantCount ?? null);

  const parts: number[] = [experienceMatch];
  const notes: string[] = [
    `Experiência / competências: ${experienceMatch}/10`,
  ];
  if (ageFit != null) {
    parts.push(ageFit);
    notes.push(`Idade (CV): ${ageFit}/10 (idade=${profile.ageYears})`);
  } else {
    notes.push("Idade: não usada (ageYears ausente no perfil).");
  }
  if (applicantCompetition != null) {
    parts.push(applicantCompetition);
    notes.push(
      `Concorrência (candidatos=${job.applicantCount}): ${applicantCompetition}/10`,
    );
  } else {
    notes.push("Número de candidatos: não disponível.");
  }

  const score = clamp(
    Math.round(parts.reduce((a, b) => a + b, 0) / parts.length),
  );

  return {
    score,
    breakdown: {
      experienceMatch,
      ageFit,
      applicantCompetition,
      notes,
    },
  };
}
