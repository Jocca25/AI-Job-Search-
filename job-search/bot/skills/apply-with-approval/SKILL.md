---
name: apply-with-approval
description: >-
  Fluxo seguro de candidatura: pontuar, fila de aprovação humana,
  preparar payload e só então orientar o submit.
---

# Candidatura com aprovação humana

Segue esta ordem. Não saltes passos.

1. `load_cv` / `manage_profile` — confirma PDF e perfil.
2. `search_jobs` — URLs dos portais; quando tiveres vagas concretas, volta a chamar com `listings`.
3. `score_job` para cada vaga séria (0–100 com breakdown).
4. Actualiza o dashboard via store (`manage_leads` / `approval_queue` list).
5. Espera o humano aprovar no dashboard ou via `approval_queue` approve.
6. `prepare_application` — carta, notas de CV, email, Q&A, passos de browser.
7. Mostra o payload e pede confirmação explícita para submeter.
8. `submit_application` com `confirmSubmit=true` **apenas** depois desse OK.
   - Se o tool recusar por falta de aprovação, para e volta à fila.
   - O resultado dá orientação de browser; não inventes credenciais nem envies sozinho.

Se o humano rejeitar/dismiss, não prepares candidatura.
