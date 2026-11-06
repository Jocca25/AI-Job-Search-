# AI Job Search

Plataforma AI de procura de emprego (Portugal): dashboard SaaS + agente Agent SDK que pesquisa portais, pontua fit 0–100 e prepara candidaturas com aprovação humana.

## Quick start

```bash
cd job-search
npm install
npm install --prefix web
npm run dev:dashboard
```

Dashboard: `http://127.0.0.1:5173`

Agente (debug / ingestão de leads):

```bash
npx --yes "@grok/agent-sdk@0.6.0" login
npx --yes "@grok/agent-sdk@0.6.0" dev .
```

Docs: [`job-search/README.md`](./job-search/README.md)

CV: `job-search/data/Joao_Mendes_de_Almeida_CV.pdf`

## Checks

```bash
npx --yes "@grok/agent-sdk@0.6.0" validate --dir ./job-search
npm run check --prefix ./job-search
npm run test:scoring --prefix ./job-search
```
