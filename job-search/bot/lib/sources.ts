export type JobSourceId =
  | "indeed_pt"
  | "sapo_emprego"
  | "net_empregos"
  | "linkedin_jobs"
  | "randstad_pt"
  | "portal_emprego"
  | "okempregos";

export type JobSource = {
  id: JobSourceId;
  name: string;
  homeUrl: string;
  buildSearchUrl: (query: string, location: string) => string;
};

function q(value: string): string {
  return encodeURIComponent(value.trim());
}

export const JOB_SOURCES: JobSource[] = [
  {
    id: "indeed_pt",
    name: "Indeed Portugal",
    homeUrl: "https://pt.indeed.com/",
    buildSearchUrl: (query, location) =>
      `https://pt.indeed.com/jobs?q=${q(query)}&l=${q(location || "Portugal")}`,
  },
  {
    id: "sapo_emprego",
    name: "SAPO Emprego",
    homeUrl: "https://emprego.sapo.pt/",
    buildSearchUrl: (query, location) =>
      `https://emprego.sapo.pt/ofertas?q=${q(query)}${location ? `&local=${q(location)}` : ""}`,
  },
  {
    id: "net_empregos",
    name: "Net-Empregos",
    homeUrl: "https://www.net-empregos.com/",
    buildSearchUrl: (query, location) =>
      `https://www.net-empregos.com/pesquisa-empregos.asp?chaves=${q(query)}&cidade=${q(location || "")}`,
  },
  {
    id: "linkedin_jobs",
    name: "LinkedIn Jobs",
    homeUrl: "https://www.linkedin.com/jobs/",
    buildSearchUrl: (query, location) =>
      `https://www.linkedin.com/jobs/search/?keywords=${q(query)}&location=${q(location || "Portugal")}`,
  },
  {
    id: "randstad_pt",
    name: "Randstad Portugal",
    homeUrl: "https://www.randstad.pt/",
    buildSearchUrl: (query, location) =>
      `https://www.randstad.pt/emprego/?q=${q(query)}${location ? `&l=${q(location)}` : ""}`,
  },
  {
    id: "portal_emprego",
    name: "Portal Emprego",
    homeUrl: "https://www.portalemprego.pt/",
    buildSearchUrl: (query, location) =>
      `https://www.portalemprego.pt/ofertas?keywords=${q(query)}${location ? `&location=${q(location)}` : ""}`,
  },
  {
    id: "okempregos",
    name: "OkEmpregos",
    homeUrl: "https://www.okempregos.com/",
    buildSearchUrl: (query, location) =>
      `https://www.okempregos.com/emprego?q=${q(query)}${location ? `&local=${q(location)}` : ""}`,
  },
];

export function getSource(id: string): JobSource | undefined {
  return JOB_SOURCES.find((source) => source.id === id);
}
