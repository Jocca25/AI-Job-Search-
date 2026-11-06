import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { JOB_SOURCES } from "../lib/sources.js";
import {
  appendActivity,
  readPlatformStore,
  writePlatformStore,
} from "../lib/store.js";

export default defineTool({
  description:
    "Read or update agent run status and search configuration (start/pause metadata, sources, thresholds). Does not auto-submit applications.",
  execution: "server",
  effect: (input) => (input.action === "status" ? "read" : "write"),
  inputSchema: z.object({
    action: z.enum([
      "status",
      "start",
      "pause",
      "resume",
      "set_config",
      "log",
    ]),
    currentAction: z.string().optional(),
    message: z.string().optional(),
    level: z.enum(["info", "success", "warning", "error"]).optional(),
    config: z
      .object({
        defaultQuery: z.string().optional(),
        defaultLocation: z.string().optional(),
        enabledSources: z.array(z.string()).optional(),
        minScoreToKeep: z.number().optional(),
        maxResultsPerRun: z.number().optional(),
        autoDismissSenior: z.boolean().optional(),
      })
      .optional(),
  }),
  dryRunResult: ({ action }) => ({ action, dryRun: true }),
  async execute({ action, currentAction, message, level, config }, ctx) {
    let store = await readPlatformStore(ctx.host.kv);

    if (action === "status") {
      return {
        agent: store.agent,
        searchConfig: store.searchConfig,
        availableSources: JOB_SOURCES.map((s) => ({
          id: s.id,
          name: s.name,
          homeUrl: s.homeUrl,
        })),
        activityCount: store.activity.length,
        leadCount: Object.keys(store.queue.items).length,
      };
    }

    if (action === "start") {
      store.agent = {
        ...store.agent,
        status: "running",
        lastStartedAt: new Date().toISOString(),
        currentAction: currentAction ?? "Pesquisa iniciada",
        lastError: null,
      };
      store = appendActivity(store, {
        level: "info",
        category: "agent",
        message: message ?? "Agente iniciado — pesquisa em segundo plano",
      });
    } else if (action === "pause") {
      store.agent = {
        ...store.agent,
        status: "paused",
        currentAction: null,
      };
      store = appendActivity(store, {
        level: "warning",
        category: "agent",
        message: message ?? "Agente em pausa",
      });
    } else if (action === "resume") {
      store.agent = {
        ...store.agent,
        status: "running",
        currentAction: currentAction ?? "Pesquisa retomada",
      };
      store = appendActivity(store, {
        level: "info",
        category: "agent",
        message: message ?? "Agente retomado",
      });
    } else if (action === "set_config") {
      store.searchConfig = {
        ...store.searchConfig,
        ...(config ?? {}),
      };
      if (config?.enabledSources) {
        store.agent = {
          ...store.agent,
          enabledSources: config.enabledSources,
        };
      }
      store = appendActivity(store, {
        level: "success",
        category: "config",
        message: "Configuração de pesquisa actualizada",
      });
    } else if (action === "log") {
      store = appendActivity(store, {
        level: level ?? "info",
        category: "agent",
        message: message ?? currentAction ?? "Evento do agente",
      });
      if (currentAction) {
        store.agent = { ...store.agent, currentAction };
      }
    }

    store = await writePlatformStore(store, ctx.host.kv);
    return {
      ok: true,
      agent: store.agent,
      searchConfig: store.searchConfig,
    };
  },
});
