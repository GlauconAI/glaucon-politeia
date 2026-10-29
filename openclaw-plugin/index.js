import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { Type } from "typebox";
import { getPreparedPluginSecretInput } from "openclaw/plugin-sdk/secret-input-runtime";

import { createConcertoRequest, resolveContextToken } from "./src/client.js";
import {
  CONCERTO_TOOL_DEFINITIONS,
  CONCERTO_TOOL_NAMES,
  createConcertoTools,
} from "./src/tools.js";

const configSchema = Type.Object(
  {
    baseUrl: Type.Optional(Type.String({ pattern: "^https://" })),
    tokenEnv: Type.Optional(Type.String({ pattern: "^[A-Z][A-Z0-9_]*$" })),
    agentTokens: Type.Optional(Type.Record(Type.String({pattern:"^[a-z0-9]+(?:-[a-z0-9]+)*$"}),Type.Object({
      source:Type.Union([Type.Literal("env"),Type.Literal("file"),Type.Literal("exec"),Type.Literal("store")]),
      provider:Type.String({minLength:1}),id:Type.String({minLength:1}),
    },{additionalProperties:false}),{additionalProperties:false})),
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
          const token = resolveContextToken({agentId:toolContext.agentId,config,readPrepared:getPreparedPluginSecretInput,env:process.env});
          const tools = createConcertoTools({
            baseUrl,
            request: createConcertoRequest({
              baseUrl,
              timeoutMs: config.timeoutMs ?? 10_000,
            }),
            tokenForAgent: (agentId) => agentId===toolContext.agentId ? token : null,
          }).forContext(toolContext);
          return tools.find((candidate) => candidate.name === name) ?? null;
        },
      });
    }),
});
