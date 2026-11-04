# AI Job Search

Agent SDK project that searches Portuguese job portals, scores CV fit, and prepares applications with human approval before any submit.

## Quick start

```bash
cd job-search
npx --yes "@grok/agent-sdk@0.6.0" login
npx --yes "@grok/agent-sdk@0.6.0" dev .
```

Full docs, CV folder, and safety notes: [`job-search/README.md`](./job-search/README.md).

Canonical CV PDF: `job-search/data/Joao_Mendes_de_Almeida_CV.pdf`

## Checks

```bash
npx --yes "@grok/agent-sdk@0.6.0" validate --dir ./job-search
npx --prefix ./job-search tsc --noEmit -p ./job-search
```

Model turns need a Cursor API key (`npx --yes "@grok/agent-sdk@0.6.0" login` or `CURSOR_API_KEY`).
