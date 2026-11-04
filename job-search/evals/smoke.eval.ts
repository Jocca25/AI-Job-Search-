import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description:
    "Loads the CV and builds Portugal job-portal search URLs without submitting.",
  async test(t) {
    await t.send(
      "Carrega o meu CV e pesquisa vagas de estágio IT / junior developer em Lisboa. Mostra os links dos portais. Não submetas nenhuma candidatura.",
    );
    t.succeeded();
    t.calledTool("load_cv");
    t.calledTool("search_jobs");
    t.notCalledTool("submit_application");
  },
});
