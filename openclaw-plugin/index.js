import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { Type } from "typebox";

import { createConcertoRequest, parseAgentTokens } from "./src/client.js";
import {
  CONCERTO_TOOL_DEFINITIONS,
  CONCERTO_TOOL_NAMES,
  createConcertoTools,
} from "./src/tools.js";

const configSchema = Type.Object(
  {
    baseUrl: Type.Optional(Type.String({ pattern: "^https://" })),
    tokenEnv: Type.Optional(Type.String({ pattern: "^[A-Z][A-Z0-9_]*$" })),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 30_000 })),
  },
  { additionalProperties: false },
);

export default defineToolPlugin({
  id: "openclaw-concerto",
  name: "Concerto — Agent Work Item Tools",
  description:
    "Typed browser-free Concerto Work Item operations for registered OpenClaw Agents.",
  activation: { onStartup: true },
  configSchema,
  tools: (tool) =>
    CONCERTO_TOOL_NAMES.map((name) => {
      const definition = CONCERTO_TOOL_DEFINITIONS[name];
      return tool({
        name,
        label: definition.label,
        description: definition.description,
        parameters: Type.Unsafe(definition.parameters),
        factory: ({ config, toolContext }) => {
          const baseUrl = config.baseUrl ?? "https://402v.com";
          const tokenEnv = config.tokenEnv ?? "CONCERTO_AGENT_API_TOKENS";
          const tokens = parseAgentTokens(process.env[tokenEnv]);
          const tools = createConcertoTools({
            baseUrl,
            request: createConcertoRequest({
              baseUrl,
              timeoutMs: config.timeoutMs ?? 10_000,
            }),
            tokenForAgent: (agentId) => tokens[agentId] ?? null,
          }).forContext(toolContext);
          return tools.find((candidate) => candidate.name === name) ?? null;
        },
      });
    }),
});
