# Data folder

## CV

- PDF: `Joao_Mendes_de_Almeida_CV.pdf`
- Structured profile: `cv-profile.json` (skills, preferences, scoring weights)

To switch candidates:

1. Add the new PDF here.
2. Update `cv-profile.json`.
3. Recalculate scores from the dashboard (Profile → Guardar) or via the agent.

## Platform store

- `platform-store.json` — durable leads, application tracker stages, agent activity and search config.
- Written by agent tools and by the dashboard API (`web/server`).
- When the Agent SDK runs hosted, the same payload is also kept in `host.kv` under `job-search:platform-store:v1`.

Do not invent job listings here. Empty store = no leads yet; run the agent to ingest real openings.
