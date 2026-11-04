---
name: apply-with-approval
description: >-
  Fluxo seguro de candidatura: pontuar, fila de aprovação humana,
  preparar payload e só então orientar o submit.
---

# Candidatura com aprovação humana

Segue esta ordem. Não saltes passos.

1. `load_cv` — confirma PDF e perfil (`ageYears` pode ser null).
2. `search_jobs` — obtém URLs dos portais; quando tiveres vagas concretas, volta a chamar com `listings`.
3. `score_job` para cada vaga séria (0–10).
4. `approval_queue` com `action=list` e apresenta a fila no playground.
5. Espera o humano dizer quais aprovar. Só então `approval_queue` `action=approve` com o `jobId`.
6. `prepare_application` — carta, campos do formulário, passos de browser.
7. Mostra o payload e pede confirmação explícita para submeter.
8. `submit_application` com `confirmSubmit=true` **apenas** depois desse OK.
   - Se o tool recusar por falta de aprovação, para e volta à fila.
   - O resultado dá orientação de browser; não inventes credenciais nem envies sozinho.

Se o humano rejeitar, `approval_queue` `action=reject` e não prepares candidatura.
