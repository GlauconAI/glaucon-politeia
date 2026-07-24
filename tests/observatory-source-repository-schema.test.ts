import { describe, expect, it } from "vitest";

import {
  ObservatorySourceRepositoryInventorySchema,
  ObservatorySourceRepositorySchema,
} from "@/lib/observatory/source-repository-schema";

const collectedAt = "2026-07-23T00:00:00.000Z";

const repository = {
  id: "repository:0123456789abcdef",
  name: "glaucon-politeia",
  scope: "workspace",
  local_ref: "workspace/plato/glaucon-politeia",
  maintainer_agent_id: "plato",
  knowledge_area: null,
  github: {
    owner: "GlauconAI",
    repo: "glaucon-politeia",
    url: "https://github.com/GlauconAI/glaucon-politeia",
  },
  current_branch: "main",
  detached: false,
  head: "a".repeat(40),
  default_branch: "main",
  last_commit_at: collectedAt,
  working_tree: "clean",
  activity: "active",
  archive_state: "unknown",
  registry_project_keys: ["plato/dashboard"],
  authority: "observed",
  source: "local-git/workspace",
  collected_at: collectedAt,
  health: "healthy",
} as const;

describe("ObservatorySourceRepositorySchema", () => {
  it("accepts strict safe repository metadata and rejects unknown fields", () => {
    expect(ObservatorySourceRepositorySchema.parse(repository)).toEqual(
      repository,
    );
    expect(() =>
      ObservatorySourceRepositorySchema.parse({
        ...repository,
        absolute_path: "/Users/private/repository",
      }),
    ).toThrow();
  });

  it("rejects credentials and non-canonical GitHub URLs", () => {
    expect(() =>
      ObservatorySourceRepositorySchema.parse({
        ...repository,
        github: {
          ...repository.github,
          url: "https://user:token@github.com/GlauconAI/glaucon-politeia",
        },
      }),
    ).toThrow();
    expect(() =>
      ObservatorySourceRepositorySchema.parse({
        ...repository,
        local_ref: "/Users/private/repository",
      }),
    ).toThrow();
  });

  it("validates repository counts and rejects duplicate repository IDs", () => {
    const inventory = {
      repositories: [repository],
      source_health: {
        status: "fresh",
        health: "healthy",
        collected_at: collectedAt,
        last_success_at: collectedAt,
        repository_count: 1,
        omitted_count: 0,
      },
    } as const;

    expect(
      ObservatorySourceRepositoryInventorySchema.parse(inventory).repositories,
    ).toHaveLength(1);
    expect(() =>
      ObservatorySourceRepositoryInventorySchema.parse({
        ...inventory,
        repositories: [repository, repository],
        source_health: {
          ...inventory.source_health,
          repository_count: 2,
        },
      }),
    ).toThrow(/Duplicate/u);
    expect(() =>
      ObservatorySourceRepositoryInventorySchema.parse({
        ...inventory,
        repositories: [
          repository,
          { ...repository, id: "repository:fedcba9876543210" },
        ],
        source_health: {
          ...inventory.source_health,
          repository_count: 2,
        },
      }),
    ).toThrow(/logical reference/u);
    expect(() =>
      ObservatorySourceRepositoryInventorySchema.parse({
        ...inventory,
        source_health: {
          ...inventory.source_health,
          repository_count: 2,
        },
      }),
    ).toThrow(/Expected 1/u);
  });
});
