import type {
  AiRecommendation,
  CvProfile,
  FitBreakdown,
  JobListing,
  MatchDimensionScore,
  ScoringWeights,
  SeniorityLevel,
  WorkArrangement,
} from "./types.js";

const DEFAULT_WEIGHTS: ScoringWeights = {
  overallProfile: 0.3,
  technicalSkills: 0.25,
  experienceSeniority: 0.2,
  careerInterests: 0.15,
  locationArrangement: 0.1,
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const sum =
    weights.overallProfile +
    weights.technicalSkills +
    weights.experienceSeniority +
    weights.careerInterests +
    weights.locationArrangement;
  if (sum <= 0) return DEFAULT_WEIGHTS;
  return {
    overallProfile: weights.overallProfile / sum,
    technicalSkills: weights.technicalSkills / sum,
    experienceSeniority: weights.experienceSeniority / sum,
    careerInterests: weights.careerInterests / sum,
    locationArrangement: weights.locationArrangement / sum,
  };
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9+#.\s-]/g, " ");
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function includesAny(haystack: string, needles: string[]): string[] {
  const h = normalizeText(haystack);
  const hits: string[] = [];
  for (const needle of needles) {
    const n = normalizeText(needle).trim();
    if (n.length < 2) continue;
    if (h.includes(n)) hits.push(needle);
  }
  return hits;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = normalizeText(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function skillCatalog(profile: CvProfile): string[] {
  return unique([
    ...(profile.skills.dataBi ?? []),
    ...(profile.skills.programming ?? []),
    ...(profile.skills.webTools ?? []),
    ...(profile.skills.aiAutomation ?? []),
    "SQL",
    "Python",
    "Power BI",
    "Metabase",
    "Data Analysis",
    "Business Intelligence",
    "AI Agents",
    "Prompt Engineering",
    "Workflow Automation",
    "Information Systems",
  ]);
}

function inferSeniority(jobText: string, explicit?: SeniorityLevel): SeniorityLevel {
  if (explicit && explicit !== "unknown") return explicit;
  const t = normalizeText(jobText);
  if (
    /estagio|internship|trainee|traineeship|recem formado|graduate programme|graduate program|programa de graduados/.test(
      t,
    )
  ) {
    return "internship";
  }
  if (/junior|júnior|entry.?level|associado|associate/.test(t)) return "junior";
  if (/mid.?level|pleno|intermedio/.test(t)) return "mid";
  if (/senior|sénior|lead|principal|staff|diretor|director|head of/.test(t)) {
    return "senior";
  }
  return "unknown";
}

function inferArrangement(
  jobText: string,
  explicit?: WorkArrangement,
): WorkArrangement {
  if (explicit && explicit !== "unknown") return explicit;
  const t = normalizeText(jobText);
  if (/hibrid|hybrid/.test(t)) return "hybrid";
  if (/remote|remoto|teletrabalho|fully remote|100% remoto/.test(t)) {
    return "remote";
  }
  if (/presencial|on.?site|onsite|escritorio/.test(t)) return "onsite";
  return "unknown";
}

function extractRequirementBuckets(description: string): {
  mandatory: string[];
  preferred: string[];
} {
  const text = description || "";
  const lower = normalizeText(text);
  const preferredSection =
    /(?:nice to have|preferencial|preferred|desejavel|desejável|plus|bonus|advantageous)([\s\S]{0,800})/i.exec(
      text,
    );
  const mandatorySection =
    /(?:requirements|requisitos|obrigat|must have|mandatory|essential|necessário|necessario)([\s\S]{0,800})/i.exec(
      text,
    );

  const skillLike =
    /python|sql|power\s*bi|metabase|javascript|typescript|java|excel|tableau|looker|spark|airflow|aws|azure|gcp|react|node|firebase|git|docker|kubernetes|tableau|r\b|power query|etl|dbt|prompt|agent|automation|workflow|business intelligence|data analysis|analise de dados|análise de dados|machine learning|llm|consulting|product management|business analysis/gi;

  const preferredHits = preferredSection
    ? Array.from(preferredSection[1].matchAll(skillLike)).map((m) => m[0])
    : [];
  const mandatoryHits = mandatorySection
    ? Array.from(mandatorySection[1].matchAll(skillLike)).map((m) => m[0])
    : [];

  const allHits = Array.from(text.matchAll(skillLike)).map((m) => m[0]);
  const preferredSet = new Set(preferredHits.map((h) => normalizeText(h)));

  let mandatory = unique(
    mandatoryHits.length > 0
      ? mandatoryHits
      : allHits.filter((h) => !preferredSet.has(normalizeText(h))),
  );
  let preferred = unique(preferredHits);

  // Soften: if no explicit mandatory section, treat uncommon advanced skills as preferred.
  if (!mandatorySection && /senior|5\+ years|anos de experiencia|anos de experiência/.test(lower)) {
    preferred = unique([...preferred, ...mandatory]);
  }

  return { mandatory, preferred };
}

function scoreRatio(hits: number, total: number, emptyScore = 55): number {
  if (total <= 0) return emptyScore;
  return clamp(Math.round((hits / total) * 100));
}

function dimension(
  id: string,
  label: string,
  weight: number,
  score: number,
  notes: string[],
): MatchDimensionScore {
  const s = clamp(score);
  return {
    id,
    label,
    weight,
    score: s,
    weighted: Math.round(s * weight * 10) / 10,
    notes,
  };
}

export function scoreJobFit(
  job: JobListing,
  profile: CvProfile,
): { score: number; score100: number; breakdown: FitBreakdown } {
  const weights = normalizeWeights(profile.scoringWeights ?? DEFAULT_WEIGHTS);
  const skills = skillCatalog(profile);
  const interests = profile.preferences?.interests ?? [];
  const jobText = [
    job.title,
    job.company,
    job.description ?? "",
    job.rawNotes ?? "",
    ...(job.mandatoryRequirements ?? []),
    ...(job.preferredQualifications ?? []),
  ].join("\n");

  const buckets =
    job.mandatoryRequirements?.length || job.preferredQualifications?.length
      ? {
          mandatory: job.mandatoryRequirements ?? [],
          preferred: job.preferredQualifications ?? [],
        }
      : extractRequirementBuckets(job.description ?? job.rawNotes ?? "");

  const matchingSkills = includesAny(jobText, skills);
  const skillCovers = (req: string): boolean => {
    const n = normalizeText(req);
    return matchingSkills.some(
      (s) => n.includes(normalizeText(s)) || normalizeText(s).includes(n),
    );
  };
  const missingMand = buckets.mandatory.filter((req) => !skillCovers(req));
  const missingPref = buckets.preferred.filter((req) => !skillCovers(req));

  // --- Technical skills (25%) ---
  // Mandatory gaps hurt; preferred gaps are soft only.
  let techScore = scoreRatio(
    matchingSkills.length,
    Math.max(6, Math.min(skills.length, 12)),
    45,
  );
  if (buckets.mandatory.length > 0) {
    const covered = buckets.mandatory.length - missingMand.length;
    const mandRatio = covered / buckets.mandatory.length;
    techScore = clamp(
      Math.round(mandRatio * 70 + (matchingSkills.length > 0 ? 20 : 0)),
    );
  }
  techScore = clamp(techScore - missingPref.length * 2);
  const techNotes = [
    matchingSkills.length
      ? `Competências alinhadas: ${matchingSkills.slice(0, 8).join(", ")}`
      : "Poucas competências técnicas explícitas em comum.",
    missingMand.length
      ? `Lacunas em requisitos obrigatórios: ${missingMand.slice(0, 5).join(", ")}`
      : "Sem lacunas graves em requisitos obrigatórios identificados.",
    missingPref.length
      ? `Nice-to-have em falta (penalização ligeira): ${missingPref.slice(0, 5).join(", ")}`
      : "Nice-to-have cobertos ou não listados.",
  ];
  // --- Experience & seniority (20%) ---
  const seniority = inferSeniority(jobText, job.seniority);
  const preferredSeniority = profile.preferences?.seniorityLevels ?? [
    "internship",
    "entry",
    "junior",
  ];
  let seniorityScore = 55;
  const seniorityNotes: string[] = [];
  if (seniority === "internship" || seniority === "entry" || seniority === "junior") {
    seniorityScore = preferredSeniority.includes(seniority) ? 92 : 80;
    seniorityNotes.push(`Nível ${seniority} adequado a estágio/junior/entry-level.`);
  } else if (seniority === "mid") {
    seniorityScore = 48;
    seniorityNotes.push(
      "Vaga de nível intermédio — possível stretch, mas exige mais experiência.",
    );
  } else if (seniority === "senior" || seniority === "lead") {
    seniorityScore = 18;
    seniorityNotes.push(
      "Vaga sénior/lead — desalinhada com perfil de estágio/junior; forte desincentivo.",
    );
  } else {
    seniorityScore = 60;
    seniorityNotes.push("Senioridade não explícita; pontuação neutra.");
  }
  const expHighlights = profile.experience.flatMap((e) => [
    e.title,
    e.company,
    ...(e.highlights ?? []),
  ]);
  const expHits = includesAny(jobText, expHighlights);
  if (expHits.length > 0) {
    seniorityScore = clamp(seniorityScore + Math.min(12, expHits.length * 3));
    seniorityNotes.push(`Experiência relevante referida: ${expHits.slice(0, 4).join("; ")}`);
  }

  // --- Career interests (15%) ---
  const interestHits = includesAny(jobText, [
    ...interests,
    ...(profile.preferences?.targetKeywords ?? []),
  ]);
  const avoidHits = includesAny(jobText, profile.preferences?.avoidKeywords ?? []);
  let interestScore = interests.length
    ? clamp(40 + interestHits.length * 15)
    : 55;
  if (avoidHits.length) interestScore = clamp(interestScore - avoidHits.length * 20);
  const interestNotes = [
    interestHits.length
      ? `Interesses de carreira presentes: ${interestHits.join(", ")}`
      : "Pouca sobreposição explícita com interesses de carreira.",
    avoidHits.length
      ? `Palavras a evitar encontradas: ${avoidHits.join(", ")}`
      : "Sem sinais de exclusão nas preferências.",
  ];

  // --- Location & arrangement (10%) ---
  const locationText = `${job.location ?? ""} ${jobText}`;
  const preferredLocs = profile.preferences?.preferredLocations ?? ["Lisboa", "Lisbon"];
  const locHits = includesAny(locationText, [
    ...preferredLocs,
    "Portugal",
    "Lisboa",
    "Lisbon",
    "Oeiras",
    "Cascais",
    "Amadora",
    "Sintra",
  ]);
  const arrangement = inferArrangement(jobText, job.workArrangement);
  const preferredArr = profile.preferences?.workArrangements ?? [
    "hybrid",
    "onsite",
    "remote",
  ];
  let locationScore = 50;
  const locationNotes: string[] = [];
  if (locHits.length > 0) {
    locationScore = 88;
    locationNotes.push(`Localização compatível (${locHits.slice(0, 3).join(", ")}).`);
  } else if (/portugal|porto|braga|coimbra|faro|aveiro/.test(normalizeText(locationText))) {
    locationScore = profile.preferences?.openToPortugalElsewhere ? 72 : 45;
    locationNotes.push(
      profile.preferences?.openToPortugalElsewhere
        ? "Em Portugal fora da área de Lisboa — aceite pelas preferências."
        : "Em Portugal, mas fora das localizações preferidas.",
    );
  } else if (!job.location) {
    locationScore = 55;
    locationNotes.push("Localização indisponível — não inventada; pontuação neutra.");
  } else {
    locationScore = 30;
    locationNotes.push(`Localização pouco alinhada: ${job.location}`);
  }
  if (arrangement !== "unknown") {
    if (preferredArr.includes(arrangement)) {
      locationScore = clamp(locationScore + 8);
      locationNotes.push(`Regime ${arrangement} dentro das preferências.`);
    } else {
      locationScore = clamp(locationScore - 12);
      locationNotes.push(`Regime ${arrangement} fora das preferências.`);
    }
  } else {
    locationNotes.push("Regime de trabalho não indicado.");
  }

  // --- Overall profile compatibility (30%) ---
  const educationBits = profile.education.flatMap((e) => [
    e.degree,
    ...(e.areas ?? []),
    e.school,
  ]);
  const eduHits = includesAny(jobText, educationBits);
  const summaryBits = tokenize(
    [
      profile.summary ?? "",
      ...profile.projects ?? [],
      ...expHighlights,
      ...educationBits,
    ].join(" "),
  );
  const jobTokens = new Set(tokenize(jobText));
  let overlap = 0;
  for (const token of summaryBits.slice(0, 80)) {
    if (jobTokens.has(token)) overlap += 1;
  }
  let overallScore = clamp(35 + overlap * 2 + eduHits.length * 6 + interestHits.length * 4);
  if (seniority === "senior" || seniority === "lead") {
    overallScore = clamp(overallScore - 25);
  }
  if (missingMand.length >= 3) overallScore = clamp(overallScore - 15);
  const overallNotes = [
    eduHits.length
      ? `Formação alinhada: ${eduHits.slice(0, 4).join(", ")}`
      : "Formação sem menção directa no anúncio.",
    `Sobreposição semântica aproximada: ${overlap} tokens relevantes.`,
    missingMand.length >= 3
      ? "Vários requisitos obrigatórios em falta reduzem a compatibilidade global."
      : "Compatibilidade global sustentada pelo perfil de Informática de Gestão + AI/dados.",
  ];

  const dimensions: MatchDimensionScore[] = [
    dimension(
      "overallProfile",
      "Compatibilidade global do perfil",
      weights.overallProfile,
      overallScore,
      overallNotes,
    ),
    dimension(
      "technicalSkills",
      "Competências técnicas",
      weights.technicalSkills,
      techScore,
      techNotes,
    ),
    dimension(
      "experienceSeniority",
      "Experiência e senioridade",
      weights.experienceSeniority,
      seniorityScore,
      seniorityNotes,
    ),
    dimension(
      "careerInterests",
      "Interesses de carreira",
      weights.careerInterests,
      interestScore,
      interestNotes,
    ),
    dimension(
      "locationArrangement",
      "Localização e regime",
      weights.locationArrangement,
      locationScore,
      locationNotes,
    ),
  ];

  const score100 = clamp(
    Math.round(dimensions.reduce((acc, d) => acc + d.score * d.weight, 0)),
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const concerns: string[] = [];

  if (matchingSkills.length) {
    strengths.push(`Já dominas: ${matchingSkills.slice(0, 6).join(", ")}.`);
  }
  if (eduHits.length) {
    strengths.push("A formação em Informática de Gestão é relevante para o papel.");
  }
  if (seniority === "internship" || seniority === "junior" || seniority === "entry") {
    strengths.push("Nível de senioridade alinhado com estágios/junior/entry-level.");
  }
  if (interestHits.length) {
    strengths.push(`Alinha com interesses: ${interestHits.join(", ")}.`);
  }

  if (missingMand.length) {
    weaknesses.push(
      `Requisitos obrigatórios potencialmente em falta: ${missingMand.slice(0, 5).join(", ")}.`,
    );
  }
  if (missingPref.length) {
    weaknesses.push(
      `Qualificações preferenciais em falta (não bloqueantes): ${missingPref.slice(0, 5).join(", ")}.`,
    );
  }
  if (seniority === "mid") {
    concerns.push("Pode esperar mais anos de experiência do que o perfil actual.");
  }
  if (seniority === "senior" || seniority === "lead") {
    concerns.push("Perfil junior/estágio face a uma vaga sénior — candidatura pouco recomendada.");
  }
  if (!job.description) {
    concerns.push(
      "Descrição completa indisponível — a análise usa apenas título/metadados; não inventámos requisitos.",
    );
  }
  if (job.active === false) {
    concerns.push("A vaga pode já não estar activa.");
  }

  let recommendation: AiRecommendation = "consider";
  if (score100 >= 72 && seniority !== "senior" && seniority !== "lead" && missingMand.length <= 1) {
    recommendation = "apply";
  } else if (score100 < 45 || seniority === "senior" || seniority === "lead" || missingMand.length >= 3) {
    recommendation = "skip";
  }

  const whyMatches =
    recommendation === "apply"
      ? "O anúncio alinha-se bem com o teu percurso em AI/dados/BI e com o nível de experiência actual."
      : recommendation === "skip"
        ? "Há desalinhamentos relevantes de senioridade, requisitos ou interesses que tornam esta vaga pouco adequada."
        : "Há pontos de contacto com o teu perfil, mas também lacunas ou incertezas — vale a pena avaliar com cuidado.";

  const notes = [
    `Score total: ${score100}/100 (recomendação: ${recommendation})`,
    ...dimensions.map((d) => `${d.label}: ${d.score}/100 (peso ${(d.weight * 100).toFixed(0)}%)`),
    ...strengths.map((s) => `+ ${s}`),
    ...weaknesses.map((w) => `- ${w}`),
  ];

  // Legacy 0–10 average for older consumers
  const score10 = clamp(Math.round(score100 / 10), 0, 10);

  return {
    score: score10,
    score100,
    breakdown: {
      experienceMatch: clamp(Math.round(techScore / 10), 0, 10),
      ageFit: null,
      applicantCompetition:
        job.applicantCount == null
          ? null
          : clamp(
              Math.round(
                (job.applicantCount <= 20
                  ? 90
                  : job.applicantCount <= 50
                    ? 70
                    : job.applicantCount <= 100
                      ? 50
                      : 30) / 10,
              ),
              0,
              10,
            ),
      notes,
      score100,
      dimensions,
      strengths,
      weaknesses,
      missingMandatory: missingMand,
      missingPreferred: missingPref,
      matchingSkills,
      concerns,
      recommendation,
      whyMatches,
    },
  };
}
