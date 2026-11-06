export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unknown";
export type EmploymentType =
  | "internship"
  | "traineeship"
  | "graduate"
  | "junior"
  | "full_time"
  | "part_time"
  | "contract"
  | "unknown";

export type SeniorityLevel =
  | "internship"
  | "entry"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "unknown";

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
  applicantCount?: number | null;
  postedAt?: string | null;
  rawNotes?: string | null;
  salary?: string | null;
  deadline?: string | null;
  workArrangement?: WorkArrangement;
  employmentType?: EmploymentType;
  seniority?: SeniorityLevel;
  category?: string | null;
  companyOverview?: string | null;
  mandatoryRequirements?: string[];
  preferredQualifications?: string[];
  active?: boolean | null;
  urlVerified?: boolean | null;
};

export type MatchDimensionScore = {
  id: string;
  label: string;
  weight: number;
  score: number;
  weighted: number;
  notes: string[];
};

export type FitBreakdown = {
  /** Legacy 0–10 fields kept for older queue items / evals. */
  experienceMatch: number;
  ageFit: number | null;
  applicantCompetition: number | null;
  notes: string[];
  /** Explainable 0–100 system */
  score100: number;
  dimensions: MatchDimensionScore[];
  strengths: string[];
  weaknesses: string[];
  missingMandatory: string[];
  missingPreferred: string[];
  matchingSkills: string[];
  concerns: string[];
  recommendation: AiRecommendation;
  whyMatches: string;
};

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "prepared"
  | "submitted";

export type ApplicationPayload = {
  jobId: string;
  jobUrl: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  coverLetterDraft: string;
  adaptedCvNotes: string;
  applicationEmailDraft: string;
  questionAnswers: { question: string; answer: string }[];
  cvPdfRelativePath: string;
  formFields: { [key: string]: string };
  browserSteps: string[];
  preparedAt: string;
};

export type SubmitResult = {
  mode: string;
  submittedAt: string;
  jobUrl: string;
  notes: string | null;
  steps: string[];
  formFields: { [key: string]: string };
  cvPdfRelativePath: string;
  coverLetterDraft: string;
  safety: string;
};

export type ApprovalItem = {
  jobId: string;
  job: JobListing;
  score?: number;
  score100?: number;
  breakdown?: FitBreakdown;
  status: ApprovalStatus;
  leadStatus: LeadStatus;
  queuedAt: string;
  discoveredAt: string;
  decidedAt?: string;
  appliedAt?: string | null;
  notes?: string | null;
  preparedPayload?: ApplicationPayload;
  submitResult?: SubmitResult;
};

export type ApprovalQueueState = {
  items: { [jobId: string]: ApprovalItem };
  updatedAt: string;
};

export type EducationEntry = {
  school: string;
  degree: string;
  location?: string;
  period?: string;
  gpa?: string;
  areas?: string[];
};

export type ExperienceEntry = {
  title: string;
  company: string;
  location?: string;
  period?: string;
  highlights?: string[];
};

export type LanguageEntry = {
  name: string;
  level: string;
};

export type CareerPreferences = {
  interests: string[];
  preferredLocations: string[];
  openToPortugalElsewhere: boolean;
  workArrangements: WorkArrangement[];
  jobTypes: EmploymentType[];
  seniorityLevels: SeniorityLevel[];
  targetKeywords: string[];
  avoidKeywords: string[];
};

export type ScoringWeights = {
  overallProfile: number;
  technicalSkills: number;
  experienceSeniority: number;
  careerInterests: number;
  locationArrangement: number;
};

export type CvProfile = {
  fullName: string;
  location: string;
  phone: string;
  email: string;
  github?: string;
  linkedin?: string;
  ageYears: number | null;
  ageNote?: string;
  summary?: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  skills: {
    dataBi?: string[];
    programming?: string[];
    webTools?: string[];
    aiAutomation?: string[];
    languages?: LanguageEntry[];
  };
  projects?: string[];
  preferences: CareerPreferences;
  scoringWeights: ScoringWeights;
  pdfFile: string;
  pdfRelativePath: string;
};

export type ActivityLevel = "info" | "success" | "warning" | "error";

export type ActivityEvent = {
  id: string;
  at: string;
  level: ActivityLevel;
  category: string;
  message: string;
  details?: string | null;
  jobId?: string | null;
};

export type AgentRunStatus = "idle" | "running" | "paused" | "error";

export type AgentStatusState = {
  status: AgentRunStatus;
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

export type PlatformStore = {
  version: 1;
  updatedAt: string;
  queue: ApprovalQueueState;
  activity: ActivityEvent[];
  agent: AgentStatusState;
  searchConfig: SearchConfig;
};
