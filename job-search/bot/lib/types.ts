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
};

export type FitBreakdown = {
  experienceMatch: number;
  ageFit: number | null;
  applicantCompetition: number | null;
  notes: string[];
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
  breakdown?: FitBreakdown;
  status: ApprovalStatus;
  queuedAt: string;
  decidedAt?: string;
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

export type CvProfile = {
  fullName: string;
  location: string;
  phone: string;
  email: string;
  github?: string;
  linkedin?: string;
  ageYears: number | null;
  ageNote?: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  skills: {
    dataBi?: string[];
    programming?: string[];
    webTools?: string[];
    languages?: LanguageEntry[];
  };
  projects?: string[];
  pdfFile: string;
  pdfRelativePath: string;
};
