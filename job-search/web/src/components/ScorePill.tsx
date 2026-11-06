import { scoreOf, type LeadItem } from "../lib/api";

export function ScorePill({ item }: { item: LeadItem }) {
  const score = scoreOf(item);
  const cls = score >= 72 ? "score-high" : score >= 50 ? "score-mid" : "score-low";
  return <span className={`score-pill ${cls}`}>{score || "—"}</span>;
}

export function RecBadge({ value }: { value?: string }) {
  if (!value) return <span className="badge">—</span>;
  return <span className={`badge badge-${value}`}>{value}</span>;
}
