import { describe, expect, it } from "vitest";

import {
  classifyProjectControlBinding,
  findProjectControlProject,
  listProjectControlDecisions,
  topologicallyOrderProjectStages,
} from "@/lib/observatory/project-control";
import { ProjectControlSnapshotSchema } from "@/lib/observatory/project-control-schema";
import { asgardProjectControlFixture } from "./fixtures/project-control/asgard-plan-v3";

const snapshot = () =>
  ProjectControlSnapshotSchema.parse(asgardProjectControlFixture());

describe("Project Control selectors", () => {
  it("finds a safe slug and preserves topological Stage order", () => {
    const project = findProjectControlProject(
      snapshot(),
      "asgard-archaea-gacha-game",
    );
    expect(project?.project.project_key).toBe("asgard/archaea-gacha-game");
    const ordered = topologicallyOrderProjectStages(project!);
    const positions = new Map(
      ordered.map((stage, index) => [stage.stage_id, index]),
    );
    for (const stage of ordered) {
      for (const dependency of stage.dependency_ids) {
        expect(positions.get(dependency)).toBeLessThan(
          positions.get(stage.stage_id)!,
        );
      }
    }
  });

  it("groups decisions with their Project and Gate", () => {
    const decisions = listProjectControlDecisions(snapshot());
    expect(decisions.map((entry) => entry.status)).toEqual([
      "evidence_blocked",
      "recorded",
    ]);
    expect(decisions[0]).toMatchObject({
      projectSlug: "asgard-archaea-gacha-game",
      gateTitle: "Prototype freeze",
    });
  });

  it("classifies matched, stale, unknown, and unavailable bindings", () => {
    const valid = {
      projectKey: "asgard/archaea-gacha-game",
      planRevision: 3,
      stageId: "stage-05b",
      workPackageId: "wp-05b-coordinate-slice",
    };
    expect(classifyProjectControlBinding(valid, snapshot()).status).toBe(
      "matched",
    );
    expect(
      classifyProjectControlBinding({ ...valid, planRevision: 2 }, snapshot())
        .status,
    ).toBe("stale_revision");
    expect(
      classifyProjectControlBinding(
        { ...valid, projectKey: "missing/project" },
        snapshot(),
      ).status,
    ).toBe("unknown_project");
    expect(
      classifyProjectControlBinding(
        { ...valid, stageId: "missing-stage" },
        snapshot(),
      ).status,
    ).toBe("unknown_stage");
    expect(
      classifyProjectControlBinding(
        { ...valid, workPackageId: "missing-package" },
        snapshot(),
      ).status,
    ).toBe("unknown_work_package");
    expect(classifyProjectControlBinding(valid, null).status).toBe(
      "control_source_unavailable",
    );
  });
});
