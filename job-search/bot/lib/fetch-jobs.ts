import { createHash } from "node:crypto";
import type { JobListing, WorkArrangement } from "./types.js";

export type ExternalJobHit = JobListing & { provider: string };

function stableId(parts: string[]): string {
  return `job_${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 12)}`;
}

function matchesQuery(text: string, query: string): boolean {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ+#]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !["or", "and", "de", "em", "para"].includes(t));
  if (tokens.length === 0) return true;
  const hay = text.toLowerCase();
  return tokens.some((t) => hay.includes(t));
}

function matchesLocation(text: string, location: string): boolean {
  const loc = location.trim().toLowerCase();
  if (!loc || loc === "portugal" || loc === "remote" || loc === "remoto") return true;
  const hay = text.toLowerCase();
  if (loc.includes("lisboa") || loc.includes("lisbon")) {
    return (
      hay.includes("lisboa") ||
      hay.includes("lisbon") ||
      hay.includes("portugal") ||
      hay.includes("remote") ||
      hay.includes("worldwide") ||
      hay.includes("anywhere")
    );
  }
  return hay.includes(loc) || hay.includes("remote") || hay.includes("worldwide");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchRemotive(query: string, location: string): Promise<ExternalJobHit[]> {
  const url = new URL("https://remotive.com/api/remote-jobs");
  url.searchParams.set("search", query);
  url.searchParams.set("limit", "40");
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "AI-Job-Search/1.0" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    jobs?: {
      id: number;
      url: string;
      title: string;
      company_name: string;
      candidate_required_location?: string;
      job_type?: string;
      category?: string;
      description?: string;
      publication_date?: string;
      salary?: string;
    }[];
  };
  const out: ExternalJobHit[] = [];
  for (const job of data.jobs ?? []) {
    const blob = `${job.title} ${job.company_name} ${job.candidate_required_location ?? ""} ${job.category ?? ""}`;
    if (!matchesQuery(blob, query)) continue;
    if (!matchesLocation(`${blob} remote`, location)) continue;
    const id = stableId(["remotive", String(job.id), job.url]);
    out.push({
      id,
      provider: "remotive",
      title: job.title,
      company: job.company_name,
      location: job.candidate_required_location || "Remote",
      source: "Remotive",
      url: job.url,
      description: job.description ? stripHtml(job.description).slice(0, 4000) : undefined,
      salary: job.salary || null,
      postedAt: job.publication_date || null,
      workArrangement: "remote",
      employmentType: job.job_type?.toLowerCase().includes("part")
        ? "part_time"
        : "full_time",
      seniority: "unknown",
      category: job.category || null,
      active: true,
      urlVerified: true,
    });
  }
  return out;
}

async function fetchArbeitnow(query: string, location: string): Promise<ExternalJobHit[]> {
  const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
    headers: { Accept: "application/json", "User-Agent": "AI-Job-Search/1.0" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    data?: {
      slug: string;
      url: string;
      title: string;
      company_name: string;
      location?: string;
      remote?: boolean;
      description?: string;
      created_at?: number;
      tags?: string[];
      job_types?: string[];
    }[];
  };
  const out: ExternalJobHit[] = [];
  for (const job of data.data ?? []) {
    const blob = `${job.title} ${job.company_name} ${job.location ?? ""} ${(job.tags || []).join(" ")}`;
    if (!matchesQuery(blob, query)) continue;
    if (!matchesLocation(`${blob} ${job.remote ? "remote" : ""}`, location)) continue;
    const arrangement: WorkArrangement = job.remote ? "remote" : "onsite";
    const id = stableId(["arbeitnow", job.slug, job.url]);
    out.push({
      id,
      provider: "arbeitnow",
      title: job.title,
      company: job.company_name,
      location: job.location || (job.remote ? "Remote" : "Europe"),
      source: "Arbeitnow",
      url: job.url,
      description: job.description ? stripHtml(job.description).slice(0, 4000) : undefined,
      postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
      workArrangement: arrangement,
      employmentType: "full_time",
      seniority: "unknown",
      category: (job.tags || [])[0] || null,
      active: true,
      urlVerified: true,
    });
  }
  return out.slice(0, 40);
}

async function fetchJobicy(query: string, location: string): Promise<ExternalJobHit[]> {
  const url = new URL("https://jobicy.com/api/v2/remote-jobs");
  url.searchParams.set("count", "30");
  url.searchParams.set("tag", query.split(/\s+/)[0] || "developer");
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "AI-Job-Search/1.0" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    jobs?: {
      id: number;
      url: string;
      jobTitle: string;
      companyName: string;
      jobGeo?: string;
      jobType?: string;
      jobLevel?: string;
      jobDescription?: string;
      pubDate?: string;
      annualSalaryMin?: number;
      annualSalaryMax?: number;
      salaryCurrency?: string;
    }[];
  };
  const out: ExternalJobHit[] = [];
  for (const job of data.jobs ?? []) {
    const blob = `${job.jobTitle} ${job.companyName} ${job.jobGeo ?? ""} ${job.jobLevel ?? ""}`;
    if (!matchesQuery(blob, query)) continue;
    if (!matchesLocation(`${blob} remote`, location)) continue;
    const salary =
      job.annualSalaryMin || job.annualSalaryMax
        ? `${job.annualSalaryMin ?? "?"}–${job.annualSalaryMax ?? "?"} ${job.salaryCurrency || ""}`.trim()
        : null;
    const id = stableId(["jobicy", String(job.id), job.url]);
    out.push({
      id,
      provider: "jobicy",
      title: job.jobTitle,
      company: job.companyName,
      location: job.jobGeo || "Remote",
      source: "Jobicy",
      url: job.url,
      description: job.jobDescription
        ? stripHtml(job.jobDescription).slice(0, 4000)
        : undefined,
      salary,
      postedAt: job.pubDate || null,
      workArrangement: "remote",
      employmentType: "full_time",
      seniority: "unknown",
      category: null,
      active: true,
      urlVerified: true,
    });
  }
  return out;
}

/** Live job search from public feeds (no API key). Attribution via source + job URL. */
export async function fetchExternalJobs(
  query: string,
  location: string,
): Promise<{ jobs: ExternalJobHit[]; providers: string[]; errors: string[] }> {
  const errors: string[] = [];
  const providers: string[] = [];
  const settled = await Promise.allSettled([
    fetchRemotive(query, location),
    fetchArbeitnow(query, location),
    fetchJobicy(query, location),
  ]);
  const jobs: ExternalJobHit[] = [];
  const names = ["remotive", "arbeitnow", "jobicy"];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      providers.push(names[i]);
      jobs.push(...result.value);
    } else {
      errors.push(`${names[i]}: ${result.reason instanceof Error ? result.reason.message : "failed"}`);
    }
  });

  const seen = new Set<string>();
  const deduped: ExternalJobHit[] = [];
  for (const job of jobs) {
    const key = `${job.company}|${job.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }
  return { jobs: deduped.slice(0, 50), providers, errors };
}
