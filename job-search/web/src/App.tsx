import { useCallback, useEffect, useMemo, useState } from "react";
import { JobDrawer } from "./components/JobDrawer";
import { RecBadge, ScorePill } from "./components/ScorePill";
import {
  api,
  formatDate,
  scoreOf,
  type ActivityEvent,
  type AgentStatus,
  type CvProfile,
  type LeadItem,
  type LeadStatus,
  type SearchConfig,
} from "./lib/api";

type Section =
  | "dashboard"
  | "leads"
  | "tracker"
  | "activity"
  | "profile"
  | "dev";

const NAV: { id: Section; label: string }[] = [
  { id: "dashboard", label: "Pesquisar" },
  { id: "leads", label: "Resultados" },
  { id: "tracker", label: "Candidaturas" },
  { id: "profile", label: "O meu perfil" },
];

const TRACKER_COLS: { id: LeadStatus; label: string }[] = [
  { id: "saved", label: "Guardadas" },
  { id: "to_apply", label: "Para candidatar" },
  { id: "applied", label: "Candidatado" },
  { id: "interview", label: "Entrevista" },
  { id: "rejected", label: "Rejeitado" },
  { id: "offer", label: "Oferta" },
];

export default function App() {
  const [section, setSection] = useState<Section>("dashboard");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.dashboard>>["stats"] | null>(null);
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [selected, setSelected] = useState<LeadItem | null>(null);
  const [board, setBoard] = useState<Record<string, LeadItem[]>>({});
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [searchConfig, setSearchConfig] = useState<SearchConfig | null>(null);
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [profile, setProfile] = useState<CvProfile | null>(null);
  const [pdfExists, setPdfExists] = useState(false);

  const [filters, setFilters] = useState({
    q: "",
    status: "",
    location: "",
    employmentType: "",
    seniority: "",
    minScore: "",
    sort: "relevance",
  });
  const [searchQuery, setSearchQuery] = useState("estágio junior data AI");
  const [searchLocation, setSearchLocation] = useState("Lisboa");
  const [searchHint, setSearchHint] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const loadDashboard = useCallback(async () => {
    const data = await api.dashboard();
    setStats(data.stats);
    setAgent(data.agent);
  }, []);

  const loadLeads = useCallback(async () => {
    const data = await api.leads({
      q: filters.q || undefined,
      status: filters.status || undefined,
      location: filters.location || undefined,
      employmentType: filters.employmentType || undefined,
      seniority: filters.seniority || undefined,
      minScore: filters.minScore || undefined,
      sort: filters.sort,
    });
    setLeads(data.items);
  }, [filters]);

  const loadTracker = useCallback(async () => {
    const data = await api.tracker();
    setBoard(data.board);
  }, []);

  const loadActivity = useCallback(async () => {
    const data = await api.activity();
    setAgent(data.agent);
    setSearchConfig(data.searchConfig);
    setActivity(data.activity);
    setSources(data.sources);
  }, []);

  const loadProfile = useCallback(async () => {
    const data = await api.profile();
    setProfile(data.profile);
    setPdfExists(data.pdfExists);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadDashboard();
      if (section === "leads") await loadLeads();
      if (section === "tracker") await loadTracker();
      if (section === "activity" || section === "dev") await loadActivity();
      if (section === "profile") await loadProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [section, loadDashboard, loadLeads, loadTracker, loadActivity, loadProfile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openLead = (item: LeadItem) => setSelected(item);

  const updateStatus = async (jobId: string, leadStatus: LeadStatus) => {
    setBusy(true);
    setError(null);
    try {
      const { item } = await api.patchLead(jobId, { leadStatus });
      setSelected(item);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao actualizar estado");
    } finally {
      setBusy(false);
    }
  };

  const prepare = async (jobId: string) => {
    setBusy(true);
    setError(null);
    try {
      const { item } = await api.prepare(jobId);
      setSelected(item);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao preparar candidatura");
    } finally {
      setBusy(false);
    }
  };

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setError("Escreve o que queres procurar (ex.: estágio data Lisboa).");
      return;
    }
    setSearching(true);
    setBusy(true);
    setError(null);
    setSearchHint(null);
    try {
      const data = await api.search({ query: q, location: searchLocation.trim() || "Portugal" });
      setAgent(data.agent);
      setLeads(data.items);
      setSearchHint(
        data.ingested > 0
          ? `Encontrámos ${data.ingested} vagas. Fontes: ${data.providers.join(", ") || "—"}.`
          : "Não encontramos vagas com estes termos. Experimenta outras palavras (ex.: junior, estágio, analyst).",
      );
      setSection("leads");
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "A pesquisa falhou. Tenta outra vez.");
    } finally {
      setSearching(false);
      setBusy(false);
    }
  };

  const agentAction = async (action: "start" | "pause" | "resume") => {
    setBusy(true);
    try {
      const data = await api.agentControl({ action });
      setAgent(data.agent);
      setSearchConfig(data.searchConfig);
      if (action === "start") {
        setSection("leads");
        await loadLeads();
        await loadDashboard();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na pesquisa");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      await api.saveProfile(profile);
      await api.rescore();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao guardar perfil");
    } finally {
      setBusy(false);
    }
  };

  const title = useMemo(() => {
    switch (section) {
      case "dashboard":
        return ["Encontra o teu próximo emprego", "Escreve o que procuras — nós pesquisamos por ti e mostramos vagas reais."];
      case "leads":
        return ["Resultados", "Vagas encontradas, com score de compatibilidade com o teu perfil."];
      case "tracker":
        return ["Candidaturas", "Organiza as vagas que queres seguir."];
      case "activity":
        return ["Histórico", "Registo das pesquisas feitas neste site."];
      case "profile":
        return ["O meu perfil", "Dados usados para calcular o match com cada vaga. Qualquer pessoa pode editar o seu perfil."];
      case "dev":
        return ["Avançado", "Ferramentas técnicas (opcional)."];
    }
  }, [section]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AI Job Search</div>
          <div className="brand-sub">Pesquisa de emprego com IA</div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "active" : ""}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>
            <span className={`status-dot ${agent?.status || "idle"}`} />
            {searching || agent?.status === "running"
              ? "A pesquisar vagas…"
              : `${stats?.totalJobs ?? agent?.jobsProcessed ?? 0} vagas no site`}
          </div>
          <div className="dim" style={{ marginTop: "0.35rem" }}>
            Para toda a gente — não só um CV
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="page-header">
          <div>
            <h1>{title[0]}</h1>
            <p>{title[1]}</p>
          </div>
          <div className="header-actions">
            <button className="btn" onClick={() => void refresh()} disabled={loading}>
              Actualizar
            </button>
          </div>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
        {loading ? <div className="loading">A carregar…</div> : null}

        {!loading && section === "dashboard" ? (
          <>
            <section className="panel search-hero">
              <h2>O que estás a procurar?</h2>
              <p className="dim">
                Clica em pesquisar — o site vai buscar vagas reais e calcula o match com o perfil.
              </p>
              <div className="search-row">
                <input
                  className="search-input"
                  placeholder="Ex.: estágio data analyst, junior AI, business intelligence"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runSearch();
                  }}
                />
                <input
                  className="search-location"
                  placeholder="Localização"
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runSearch();
                  }}
                />
                <button
                  className="btn btn-primary"
                  disabled={busy || searching}
                  onClick={() => void runSearch()}
                >
                  {searching ? "A pesquisar…" : "Pesquisar vagas"}
                </button>
              </div>
              {searchHint ? <p className="search-hint">{searchHint}</p> : null}
            </section>

            {stats ? (
              <div className="grid-stats" style={{ marginTop: "1.25rem" }}>
                <div className="stat">
                  <div className="stat-label">Vagas no site</div>
                  <div className="stat-value">{stats.totalJobs}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Novas</div>
                  <div className="stat-value">{stats.newOpportunities}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Bom match (≥72)</div>
                  <div className="stat-value">{stats.highMatch}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Em curso</div>
                  <div className="stat-value">{stats.inProgress}</div>
                </div>
              </div>
            ) : null}

            {stats && stats.topOpportunities.length > 0 ? (
              <section className="panel" style={{ marginTop: "1.25rem" }}>
                <h2>Melhores matches</h2>
                {stats.topOpportunities.map((item) => (
                  <div
                    key={item.jobId}
                    className="top-job"
                    onClick={() => {
                      setSection("leads");
                      openLead(item);
                    }}
                  >
                    <div>
                      <h3>{item.job.title}</h3>
                      <div className="dim">
                        {item.job.company}
                        {item.job.location ? ` · ${item.job.location}` : ""} · {item.job.source}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <ScorePill item={item} />
                      <div style={{ marginTop: "0.35rem" }}>
                        <RecBadge value={item.breakdown?.recommendation} />
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            ) : (
              <div className="empty" style={{ marginTop: "1.25rem" }}>
                Ainda não há resultados. Usa a caixa acima — a pesquisa corre aqui no site.
              </div>
            )}
          </>
        ) : null}

        {!loading && section === "leads" ? (
          <>
            <div className="toolbar">
              <input
                placeholder="Pesquisar título, empresa, fonte…"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              />
              <select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="">Todos os estados</option>
                <option value="new">Novas</option>
                <option value="saved">Guardadas</option>
                <option value="to_apply">Para candidatar</option>
                <option value="applied">Candidatado</option>
                <option value="dismissed">Ignoradas</option>
              </select>
              <input
                placeholder="Localização"
                value={filters.location}
                onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
              />
              <select
                value={filters.employmentType}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, employmentType: e.target.value }))
                }
              >
                <option value="">Tipo de contrato</option>
                <option value="internship">Estágio</option>
                <option value="traineeship">Trainee</option>
                <option value="graduate">Graduate</option>
                <option value="junior">Junior</option>
                <option value="full_time">Full-time</option>
              </select>
              <select
                value={filters.seniority}
                onChange={(e) => setFilters((f) => ({ ...f, seniority: e.target.value }))}
              >
                <option value="">Senioridade</option>
                <option value="internship">Internship</option>
                <option value="entry">Entry</option>
                <option value="junior">Junior</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
              </select>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="Score mín."
                value={filters.minScore}
                onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value }))}
                style={{ width: "7rem" }}
              />
              <select
                value={filters.sort}
                onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
              >
                <option value="relevance">Relevância</option>
                <option value="score">Match score</option>
                <option value="date">Data descoberta</option>
              </select>
              <button className="btn btn-primary" onClick={() => void loadLeads()}>
                Filtrar
              </button>
            </div>

            {leads.length === 0 ? (
              <div className="empty">
                Ainda sem vagas. Vai a <strong>Pesquisar</strong> e clica em “Pesquisar vagas”.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="leads">
                  <thead>
                    <tr>
                      <th>Vaga</th>
                      <th>Local / regime</th>
                      <th>Tipo</th>
                      <th>Salário</th>
                      <th>Fonte</th>
                      <th>Descoberta</th>
                      <th>Deadline</th>
                      <th>Score</th>
                      <th>Estado</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((item) => (
                      <tr key={item.jobId} onClick={() => openLead(item)}>
                        <td>
                          <strong>{item.job.title}</strong>
                          <div className="dim">{item.job.company}</div>
                        </td>
                        <td>
                          {item.job.location || "Indisponível"}
                          <div className="dim">{item.job.workArrangement || "n/d"}</div>
                        </td>
                        <td>{item.job.employmentType || "n/d"}</td>
                        <td>{item.job.salary || "Indisponível"}</td>
                        <td>{item.job.source}</td>
                        <td>{formatDate(item.discoveredAt)}</td>
                        <td>{item.job.deadline || "Indisponível"}</td>
                        <td>
                          <ScorePill item={item} />
                        </td>
                        <td>
                          <span className="badge">{item.leadStatus.replace("_", " ")}</span>
                        </td>
                        <td>
                          <a
                            href={item.job.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Abrir
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {!loading && section === "tracker" ? (
          <div className="kanban">
            {TRACKER_COLS.map((col) => (
              <div
                key={col.id}
                className="kanban-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const jobId = e.dataTransfer.getData("text/jobId");
                  if (jobId) void updateStatus(jobId, col.id);
                }}
              >
                <h3>
                  <span>{col.label}</span>
                  <span>{board[col.id]?.length ?? 0}</span>
                </h3>
                {(board[col.id] || []).map((item) => (
                  <div
                    key={item.jobId}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/jobId", item.jobId)}
                    onClick={() => openLead(item)}
                  >
                    <h4>{item.job.title}</h4>
                    <div className="dim">{item.job.company}</div>
                    <div style={{ marginTop: "0.45rem" }}>
                      <ScorePill item={item} />
                    </div>
                    {item.notes ? <p className="dim">{item.notes}</p> : null}
                    {item.appliedAt ? (
                      <p className="dim">Desde {formatDate(item.appliedAt)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {!loading && section === "activity" ? (
          <div className="panel-grid">
            <section className="panel">
              <h2>Estado do agente</h2>
              <p>
                <span className={`status-dot ${agent?.status || "idle"}`} />
                {agent?.status || "idle"}
                {agent?.currentAction ? ` — ${agent.currentAction}` : ""}
              </p>
              <p className="dim">
                Última execução: {formatDate(agent?.lastExecutionAt)} · Processados:{" "}
                {agent?.jobsProcessed ?? 0}
              </p>
              {agent?.lastError ? (
                <p className="error-banner">Erro: {agent.lastError}</p>
              ) : null}
              <div className="header-actions" style={{ marginTop: "0.8rem" }}>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void agentAction("start")}
                >
                  Iniciar pesquisa
                </button>
                <button className="btn" disabled={busy} onClick={() => void agentAction("pause")}>
                  Pausar
                </button>
                <button className="btn" disabled={busy} onClick={() => void agentAction("resume")}>
                  Retomar
                </button>
              </div>
              <p className="dim" style={{ marginTop: "0.9rem" }}>
                O dashboard marca o estado e regista actividade. A descoberta real corre no Agent
                SDK (`npx agent-sdk run/dev` em `job-search/`), que grava leads no store partilhado.
              </p>
              {searchConfig ? (
                <div className="form-grid" style={{ marginTop: "1rem" }}>
                  <div className="field">
                    <label>Query por omissão</label>
                    <input
                      value={searchConfig.defaultQuery}
                      onChange={(e) =>
                        setSearchConfig({ ...searchConfig, defaultQuery: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Localização</label>
                    <input
                      value={searchConfig.defaultLocation}
                      onChange={(e) =>
                        setSearchConfig({
                          ...searchConfig,
                          defaultLocation: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Score mínimo para manter</label>
                    <input
                      type="number"
                      value={searchConfig.minScoreToKeep}
                      onChange={(e) =>
                        setSearchConfig({
                          ...searchConfig,
                          minScoreToKeep: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Fontes activas</label>
                    <div className="chip-row">
                      {sources.map((s) => {
                        const on = searchConfig.enabledSources.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className="chip"
                            style={{
                              cursor: "pointer",
                              borderColor: on ? "rgba(61,184,168,.5)" : undefined,
                              color: on ? "var(--text)" : undefined,
                            }}
                            onClick={() => {
                              const enabledSources = on
                                ? searchConfig.enabledSources.filter((id) => id !== s.id)
                                : [...searchConfig.enabledSources, s.id];
                              setSearchConfig({ ...searchConfig, enabledSources });
                            }}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
              <button
                className="btn"
                style={{ marginTop: "0.6rem" }}
                disabled={busy || !searchConfig}
                onClick={() => {
                  if (!searchConfig) return;
                  void (async () => {
                    setBusy(true);
                    try {
                      const data = await api.agentControl({
                        action: "set_config",
                        config: searchConfig,
                      });
                      setSearchConfig(data.searchConfig);
                      await loadActivity();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Falha ao guardar config");
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                Guardar configuração
              </button>
            </section>
            <section className="panel">
              <h2>Feed de actividade</h2>
              {activity.length === 0 ? (
                <div className="empty">Sem eventos ainda.</div>
              ) : (
                <ul className="activity-list">
                  {activity.map((ev) => (
                    <li key={ev.id}>
                      <span className="dim">{formatDate(ev.at)}</span>
                      <div>
                        <div>
                          <span className="badge">{ev.category}</span> {ev.message}
                        </div>
                        {ev.details ? <div className="dim">{ev.details}</div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        {!loading && section === "profile" && profile ? (
          <section className="panel">
            <div className="header-actions" style={{ marginBottom: "1rem" }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => void saveProfile()}>
                Guardar perfil e recalcular scores
              </button>
              <span className="dim">
                PDF: {profile.pdfRelativePath} {pdfExists ? "(encontrado)" : "(em falta)"}
              </span>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Nome</label>
                <input
                  value={profile.fullName}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Localização</label>
                <input
                  value={profile.location}
                  onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Telefone</label>
                <input
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>Resumo</label>
              <textarea
                value={profile.summary || ""}
                onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Interesses de carreira (vírgulas)</label>
              <input
                value={profile.preferences.interests.join(", ")}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    preferences: {
                      ...profile.preferences,
                      interests: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </div>
            <div className="field">
              <label>Localizações preferidas (vírgulas)</label>
              <input
                value={profile.preferences.preferredLocations.join(", ")}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    preferences: {
                      ...profile.preferences,
                      preferredLocations: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Skills dados/BI</label>
                <input
                  value={(profile.skills.dataBi || []).join(", ")}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      skills: {
                        ...profile.skills,
                        dataBi: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Skills AI / automação</label>
                <input
                  value={(profile.skills.aiAutomation || []).join(", ")}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      skills: {
                        ...profile.skills,
                        aiAutomation: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Programação</label>
                <input
                  value={(profile.skills.programming || []).join(", ")}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      skills: {
                        ...profile.skills,
                        programming: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Pesos (perfil / skills / exp / interesses / local)</label>
                <input
                  value={[
                    profile.scoringWeights.overallProfile,
                    profile.scoringWeights.technicalSkills,
                    profile.scoringWeights.experienceSeniority,
                    profile.scoringWeights.careerInterests,
                    profile.scoringWeights.locationArrangement,
                  ].join(", ")}
                  onChange={(e) => {
                    const parts = e.target.value.split(",").map((x) => Number(x.trim()));
                    if (parts.length !== 5 || parts.some((n) => Number.isNaN(n))) return;
                    setProfile({
                      ...profile,
                      scoringWeights: {
                        overallProfile: parts[0],
                        technicalSkills: parts[1],
                        experienceSeniority: parts[2],
                        careerInterests: parts[3],
                        locationArrangement: parts[4],
                      },
                    });
                  }}
                />
              </div>
            </div>
            <h3 style={{ marginTop: "1rem" }}>Educação</h3>
            {profile.education.map((ed, idx) => (
              <div key={`${ed.school}-${idx}`} className="dim" style={{ marginBottom: "0.4rem" }}>
                {ed.degree} — {ed.school} ({ed.period || "n/d"})
              </div>
            ))}
            <h3>Experiência</h3>
            {profile.experience.map((ex, idx) => (
              <div key={`${ex.company}-${idx}`} style={{ marginBottom: "0.6rem" }}>
                <strong>
                  {ex.title} @ {ex.company}
                </strong>
                <div className="dim">{ex.period}</div>
                <ul className="list-plain">
                  {(ex.highlights || []).map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}

        {!loading && section === "dev" ? (
          <section className="panel">
            <h2>Debugging</h2>
            <p className="muted">
              A experiência principal é o dashboard. Para conversar com o agente use o playground
              do Agent SDK.
            </p>
            <pre className="dev-box">{`cd job-search
npx --yes "@grok/agent-sdk@0.6.0" dev .
# Playground: http://127.0.0.1:3000/playground

# Dashboard (outro terminal):
cd job-search/web && npm run dev
# UI: http://127.0.0.1:5173  API: http://127.0.0.1:8787`}</pre>
            <p className="dim">
              Leads no store: {leads.length || stats?.totalJobs || "—"} · Score exemplo top:{" "}
              {stats?.topOpportunities?.[0]
                ? scoreOf(stats.topOpportunities[0])
                : "sem dados"}
            </p>
          </section>
        ) : null}
      </main>

      {selected ? (
        <JobDrawer
          item={selected}
          busy={busy}
          onClose={() => setSelected(null)}
          onStatus={(status) => void updateStatus(selected.jobId, status)}
          onPrepare={() => void prepare(selected.jobId)}
        />
      ) : null}
    </div>
  );
}
