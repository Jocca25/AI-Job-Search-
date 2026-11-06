# AI Job Search (`job-search`)

Plataforma autónoma de procura de emprego em Portugal: o agente pesquisa e pontua em segundo plano; o **dashboard** apresenta leads, tracker e preparação de candidaturas. **Nunca submete automaticamente.**

## Arquitectura

| Peça | Pasta | Função |
| --- | --- | --- |
| Agent SDK worker | `bot/` | Pesquisa, scoring 0–100, preparação, gates de submit |
| Store durável | `data/platform-store.json` (+ `host.kv` quando o agente corre) | Leads, actividade, config |
| Perfil | `data/cv-profile.json` + PDF | Preferências e matching |
| Dashboard SaaS | `web/` | UI principal (sem chat) |

O playground/chat do Agent SDK fica só para debugging (`Dev console` no dashboard).

## O que faz

- Pesquisa portais PT: Indeed, SAPO Emprego, Net-Empregos, LinkedIn Jobs, Randstad, Portal Emprego, OkEmpregos
- Scoring explicável 0–100 (perfil 30%, skills 25%, senioridade 20%, interesses 15%, localização 10%)
- Distingue requisitos obrigatórios vs nice-to-have
- Deduplica leads e regista actividade do agente
- Kanban de candidaturas + preparação (carta, CV notes, email) com aprovação humana
- `submit_application` só com `confirmSubmit=true`

## CV

```text
job-search/data/
```

| Ficheiro | Papel |
| --- | --- |
| `Joao_Mendes_de_Almeida_CV.pdf` | PDF canónico |
| `cv-profile.json` | Perfil + preferências + pesos |
| `platform-store.json` | Leads / actividade / estado do agente |

## Correr localmente

Node 22.13+ (nunca Bun) e credencial Cursor para turns do modelo.

```bash
cd job-search
npm install
npm install --prefix web

# API + dashboard
npm run dev:dashboard
# UI http://127.0.0.1:5173  · API http://127.0.0.1:8787

# Agente (outro terminal) — playground só para debug
npx --yes "@grok/agent-sdk@0.6.0" login
npx --yes "@grok/agent-sdk@0.6.0" validate --dir .
npx --yes "@grok/agent-sdk@0.6.0" dev .
# Playground: http://127.0.0.1:3000/playground
```

One-shot de pesquisa (ingere leads reais quando o modelo encontra vagas):

```bash
npx --yes "@grok/agent-sdk@0.6.0" run --dir . --message "Carrega o CV, inicia o agente, pesquisa estágios AI/dados em Lisboa, ingere listings relevantes e pontua. Não submetas."
```

Checks:

```bash
npm run check
npm run test:scoring
```

## Segurança

Nunca activar auto-submit sem pedido humano explícito. O dashboard prepara materiais; o envio real continua gated.
