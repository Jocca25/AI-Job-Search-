import { formatDate, scoreOf, type LeadItem, type LeadStatus } from "../lib/api";
import { RecBadge, ScorePill } from "./ScorePill";

const ACTIONS: { status: LeadStatus; label: string }[] = [
  { status: "saved", label: "Guardar" },
  { status: "dismissed", label: "Ignorar" },
  { status: "to_apply", label: "Para candidatar" },
  { status: "applied", label: "Marcar como candidatado" },
];

type Props = {
  item: LeadItem;
  busy?: boolean;
  onClose: () => void;
  onStatus: (status: LeadStatus) => void;
  onPrepare: () => void;
};

export function JobDrawer({ item, busy, onClose, onStatus, onPrepare }: Props) {
  const b = item.breakdown;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Detalhe da vaga">
        <div className="page-header" style={{ marginBottom: "0.6rem" }}>
          <div>
            <h2>{item.job.title}</h2>
            <p className="muted">
              {item.job.company}
              {item.job.location ? ` · ${item.job.location}` : ""}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="chip-row">
          <ScorePill item={item} />
          <RecBadge value={b?.recommendation} />
          <span className="badge">{item.leadStatus.replace("_", " ")}</span>
          <span className="badge">{item.job.source}</span>
          <span className="badge">{item.job.workArrangement || "regime n/d"}</span>
          <span className="badge">{item.job.employmentType || "tipo n/d"}</span>
        </div>

        <div className="drawer-actions">
          {ACTIONS.map((a) => (
            <button
              key={a.status}
              className="btn"
              disabled={busy}
              onClick={() => onStatus(a.status)}
            >
              {a.label}
            </button>
          ))}
          <button className="btn btn-primary" disabled={busy} onClick={onPrepare}>
            Preparar candidatura
          </button>
          <a className="btn" href={item.job.url} target="_blank" rel="noreferrer">
            Abrir link de candidatura
          </a>
        </div>

        <section className="drawer-section">
          <h3>Porque faz match</h3>
          <p>{b?.whyMatches || "Análise indisponível até ao scoring."}</p>
          {b?.dimensions?.length ? (
            <div className="dim-bars" style={{ marginTop: "0.8rem" }}>
              {b.dimensions.map((d) => (
                <div key={d.id} className="dim-row">
                  <span>{d.label}</span>
                  <span className="dim">
                    {d.score}/100 · {(d.weight * 100).toFixed(0)}%
                  </span>
                  <div className="bar">
                    <span style={{ width: `${d.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <p className="dim" style={{ marginTop: "0.7rem" }}>
            Score total: {scoreOf(item)}/100
          </p>
        </section>

        <section className="drawer-section">
          <h3>Competências que já tens</h3>
          {b?.matchingSkills?.length ? (
            <div className="chip-row">
              {b.matchingSkills.map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">Indisponível / sem sobreposição explícita.</p>
          )}
        </section>

        <section className="drawer-section">
          <h3>Lacunas e pontos fracos</h3>
          <ul className="list-plain">
            {(b?.weaknesses?.length ? b.weaknesses : ["Nenhuma lacuna significativa identificada."]).map(
              (w) => (
                <li key={w}>{w}</li>
              ),
            )}
          </ul>
          {b?.missingMandatory?.length ? (
            <p className="dim">Obrigatórios em falta: {b.missingMandatory.join(", ")}</p>
          ) : null}
          {b?.missingPreferred?.length ? (
            <p className="dim">Preferenciais em falta: {b.missingPreferred.join(", ")}</p>
          ) : null}
        </section>

        <section className="drawer-section">
          <h3>Possíveis preocupações</h3>
          <ul className="list-plain">
            {(b?.concerns?.length ? b.concerns : ["Nenhuma preocupação adicional registada."]).map(
              (c) => (
                <li key={c}>{c}</li>
              ),
            )}
          </ul>
        </section>

        <section className="drawer-section">
          <h3>Empresa</h3>
          <p>{item.job.companyOverview || "Visão geral da empresa indisponível."}</p>
        </section>

        <section className="drawer-section">
          <h3>Descrição</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {item.job.description || "Descrição completa indisponível."}
          </p>
          <p className="dim">
            Descoberto: {formatDate(item.discoveredAt)} · Deadline:{" "}
            {item.job.deadline || "Indisponível"} · Salário:{" "}
            {item.job.salary || "Indisponível"}
          </p>
        </section>

        {item.preparedPayload ? (
          <section className="drawer-section">
            <h3>Materiais preparados (rever antes de enviar)</h3>
            <p className="dim">Gerado em {formatDate(item.preparedPayload.preparedAt)}</p>
            <h4 style={{ marginBottom: 0 }}>Carta</h4>
            <pre className="dev-box">{item.preparedPayload.coverLetterDraft}</pre>
            <h4 style={{ marginBottom: 0 }}>Notas para adaptar o CV</h4>
            <pre className="dev-box">{item.preparedPayload.adaptedCvNotes}</pre>
            <h4 style={{ marginBottom: 0 }}>Email</h4>
            <pre className="dev-box">{item.preparedPayload.applicationEmailDraft}</pre>
          </section>
        ) : null}
      </aside>
    </>
  );
}
