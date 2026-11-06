export type LeadStatus =
  | "new"
  | "saved"
  | "to_apply"
  | "applied"
  | "interview"
  | "rejected"
  | "offer"
  | "dismissed";

export type AiRecommendation = "apply" | "consider" | "skip";

export type JobListing = {
  id: string;
  title: string;
  company: string;
  location?: string;
  source: string;
  url: string;
  description?: string;
  salary?: string | null;
  deadline?: string | null;
  workArrangement?: string;
  employmentType?: string;
  seniority?: string;
  category?: string | null;
  companyOverview?: string | null;
  mandatoryRequirements?: string[];
  preferredQualifications?: string[];
  active?: boolean | null;
  postedAt?: string | null;
};

export type FitBreakdown = {
  score100: number;
  dimensions: {
    id: string;
    label: string;
    weight: number;
    score: number;
    weighted: number;
    notes: string[];
  }[];
  strengths: string[];
  weaknesses: string[];
  missingMandatory: string[];
  missingPreferred: string[];
  matchingSkills: string[];
  concerns: string[];
  recommendation: AiRecommendation;
  whyMatches: string;
  notes: string[];
};

export type ApplicationPayload = {
  coverLetterDraft: string;
  adaptedCvNotes: string;
  applicationEmailDraft: string;
  questionAnswers: { question: string; answer: string }[];
  browserSteps: string[];
  formFields: Record<string, string>;
  preparedAt: string;
};

export type LeadItem = {
  jobId: string;
  job: JobListing;
  score?: number;
  score100?: number;
  breakdown?: FitBreakdown;
  status: string;
  leadStatus: LeadStatus;
  queuedAt: string;
  discoveredAt: string;
  appliedAt?: string | null;
  notes?: string | null;
  preparedPayload?: ApplicationPayload;
};

export type ActivityEvent = {
  id: string;
  at: string;
  level: string;
  category: string;
  message: string;
  details?: string | null;
  jobId?: string | null;
};

export type AgentStatus = {
  status: "idle" | "running" | "paused" | "error";
  lastExecutionAt: string | null;
  lastStartedAt: string | null;
  jobsProcessed: number;
  lastError: string | null;
  currentAction: string | null;
  searchQuery: string | null;
  searchLocation: string | null;
  enabledSources: string[];
};

export type SearchConfig = {
  defaultQuery: string;
  defaultLocation: string;
  enabledSources: string[];
  minScoreToKeep: number;
  maxResultsPerRun: number;
  autoDismissSenior: boolean;
};

export type CvProfile = {
  fullName: string;
  location: string;
  phone: string;
  email: string;
  github?: string;
  linkedin?: string;
  ageYears: number | null;
  summary?: string;
  education: {
    school: string;
    degree: string;
    location?: string;
    period?: string;
    gpa?: string;
    areas?: string[];
  }[];
  experience: {
    title: string;
    company: string;
    location?: string;
    period?: string;
    highlights?: string[];
  }[];
  skills: {
    dataBi?: string[];
    programming?: string[];
    webTools?: string[];
    aiAutomation?: string[];
    languages?: { name: string; level: string }[];
  };
  projects?: string[];
  preferences: {
    interests: string[];
    preferredLocations: string[];
    openToPortugalElsewhere: boolean;
    workArrangements: string[];
    jobTypes: string[];
    seniorityLevels: string[];
    targetKeywords: string[];
    avoidKeywords: string[];
  };
  scoringWeights: {
    overallProfile: number;
    technicalSkills: number;
    experienceSeniority: number;
    careerInterests: number;
    locationArrangement: number;
  };
  pdfFile: string;
  pdfRelativePath: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { message?: string; error?: string }).message || (err as { error?: string }).error || "request_failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: () =>
    request<{
      stats: {
        totalJobs: number;
        newOpportunities: number;
        highMatch: number;
        inProgress: number;
        averageMatchScore: number | null;
        recentActivity: ActivityEvent[];
        topOpportunities: LeadItem[];
        newThisWeek: number;
      };
      agent: AgentStatus;
    }>("/api/dashboard"),
  leads: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    return request<{ count: number; items: LeadItem[] }>(`/api/leads?${qs}`);
  },
  patchLead: (jobId: string, body: { leadStatus?: LeadStatus; notes?: string; approve?: boolean }) =>
    request<{ item: LeadItem }>(`/api/leads/${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  prepare: (jobId: string) =>
    request<{ ok: boolean; item: LeadItem }>(
      `/api/leads/${encodeURIComponent(jobId)}/prepare`,
      { method: "POST", body: "{}" },
    ),
  tracker: () =>
    request<{ board: Record<string, LeadItem[]> }>("/api/tracker"),
  activity: () =>
    request<{
      agent: AgentStatus;
      searchConfig: SearchConfig;
      activity: ActivityEvent[];
      sources: { id: string; name: string; homeUrl: string }[];
    }>("/api/activity"),
  agentControl: (body: {
    action: "start" | "pause" | "resume" | "set_config";
    config?: Partial<SearchConfig>;
    message?: string;
  }) =>
    request<{ agent: AgentStatus; searchConfig: SearchConfig }>(
      "/api/agent/control",
      { method: "POST", body: JSON.stringify(body) },
    ),
  profile: () =>
    request<{ profile: CvProfile; pdfExists: boolean }>("/api/profile"),
  saveProfile: (profile: CvProfile) =>
    request<{ ok: boolean }>("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ profile }),
    }),
  rescore: () =>
    request<{ ok: boolean; rescored: number }>("/api/leads/rescore", {
      method: "POST",
      body: "{}",
    }),
};

export function scoreOf(item: LeadItem): number {
  return item.score100 ?? item.breakdown?.score100 ?? (item.score != null ? item.score * 10 : 0);
}

export function formatDate(value?: string | null): string {
  if (!value) return "Indisponível";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Indisponível";
  return d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
