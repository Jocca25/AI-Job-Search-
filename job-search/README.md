# AI Job Search (`job-search`)

Agent SDK assistant that searches Portuguese job portals, scores fit 0–10 against a CV PDF, and prepares applications. **A human must approve every real submit.**

## What it does

- Searches: Indeed Portugal, SAPO Emprego, Net-Empregos, LinkedIn Jobs, Randstad Portugal, Portal Emprego, OkEmpregos
- Scores jobs 0–10 (experience match, age from CV when set, applicant count when available)
- Keeps an approval queue in durable `ctx.host.kv`
- Prepares cover letter + form fields + browser steps
- Blocks auto-submit until `approval_queue` approve + `submit_application` with `confirmSubmit=true`

## CV location

Put CV PDFs in:

```text
job-search/data/
```

This repo ships:

| File | Role |
| --- | --- |
| `job-search/data/Joao_Mendes_de_Almeida_CV.pdf` | Canonical PDF |
| `job-search/data/cv-profile.json` | Structured profile used by tools |
| `job-search/data/README.md` | How to swap candidates |

Project store copy (same PDF): `/cursor/stores/self/media/Joao_Mendes_de_Almeida_CV.pdf`

Set `ageYears` in `cv-profile.json` when age should affect scoring.

## Run locally

Needs Node 22.13+ (never Bun) and a Cursor API credential.

```bash
cd job-search
npx --yes "@grok/agent-sdk@0.6.0" login   # or export CURSOR_API_KEY
npx --yes "@grok/agent-sdk@0.6.0" validate --dir .
npx tsc --noEmit -p .
npx --yes "@grok/agent-sdk@0.6.0" dev .
# Playground: http://127.0.0.1:3000/playground
```

One-shot turn:

```bash
npx --yes "@grok/agent-sdk@0.6.0" run --dir . --message "Carrega o CV e pesquisa estágios IT em Lisboa. Não submetas."
```

Smoke eval (needs API key):

```bash
npx --yes "@grok/agent-sdk@0.6.0" eval --dir . --tag smoke
```

## Channels

Playground + HTTP only (no Slack in this scaffold).

## Safety

Never deploy or enable auto-submit without an explicit human request. Form-fill tools prepare payloads; `submit_application` is gated on approval state in `ctx.host.kv`.
