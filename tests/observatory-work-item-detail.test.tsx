import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkItemDetail } from "@/components/observatory/WorkItemDetail";
import type {
  ObservatoryWorkItemEventRow,
  ObservatoryWorkItemEvidenceRow,
  ObservatoryWorkItemRow,
  ObservatoryWorkItemClaimRow,
} from "@/lib/observatory/repository";
import { ProjectControlSnapshotSchema } from "@/lib/observatory/project-control-schema";
import type { WorkTrackerProjectOption } from "@/lib/observatory/work-tracker-projects";
import { asgardProjectControlFixture } from "./fixtures/project-control/asgard-plan-v3";

const item: ObservatoryWorkItemRow = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "feature",
  title: "Build the manual board",
  description: "Admin-only workflow.",
  state: "triage",
  priority: "high",
  owner_id: "22222222-2222-4222-8222-222222222222",
  assigned_agent_id: "plato",
  acceptance_criteria: "The item can reach Done.",
  project_ref: "Dashboard",
  milestone_ref: "OBS-M3",
  project_key: null,
  project_version_id: "33333333-3333-4333-8333-333333333333",
  version_binding_kind: "required",
  plan_revision: null,
  stage_id: null,
  work_package_id: null,
  idempotency_key: "capture-1",
  version: 3,
  created_by: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-07-23T20:00:00.000Z",
  updated_at: "2026-07-23T20:05:00.000Z",
  risk_level: "unclassified",
  agent_claim_enabled: false,
  authorized_paths: [],
  allowed_action_classes: [],
  claim_approved_by: null,
  claim_approved_at: null,
};

const projects: WorkTrackerProjectOption[] = [
  {
    projectKey: "plato/dashboard",
    title: "Dashboard",
    owner: "plato",
    status: "active",
  },
  {
    projectKey: "asgard/archaea-gacha-game",
    title: "阿斯加德古菌",
    owner: "lordguan",
    status: "active",
  },
];

const evidence: ObservatoryWorkItemEvidenceRow[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    work_item_id: item.id,
    label: "Production dashboard",
    url: "https://402v.com/dashboard",
    created_by: item.created_by,
    created_by_agent: null,
    created_at: "2026-07-23T20:04:00.000Z",
    removed_at: null,
    removed_by: null,
  },
];

const events: ObservatoryWorkItemEventRow[] = [
  {
    id: "event-1",
    work_item_id: item.id,
    event_type: "created",
    actor_id: item.created_by,
    agent_id: null,
    data: { title: item.title, state: "inbox" },
    created_at: "2026-07-23T20:00:00.000Z",
  },
  {
    id: "event-2",
    work_item_id: item.id,
    event_type: "state_transitioned",
    actor_id: item.created_by,
    agent_id: null,
    data: { from: "inbox", to: "triage" },
    created_at: "2026-07-23T20:02:00.000Z",
  },
];

const successAction = vi
  .fn()
  .mockResolvedValue({ status: "success", version: 4 });

const activeClaim: ObservatoryWorkItemClaimRow = {
  id: "44444444-4444-4444-8444-444444444444",
  work_item_id: item.id,
  agent_id: "plato-pilot",
  status: "active",
  claim_version: 2,
  started_at: "2026-07-23T20:06:00.000Z",
  last_heartbeat_at: "2026-07-23T20:07:00.000Z",
  lease_expires_at: "2099-07-23T20:22:00.000Z",
  ended_at: null,
  completion_summary: null,
  result_evidence_url: null,
  created_at: "2026-07-23T20:06:00.000Z",
  updated_at: "2026-07-23T20:07:00.000Z",
};

describe("WorkItemDetail", () => {
  it("offers only validated Project Control Work Package bindings", async () => {
    const updateAction = vi
      .fn()
      .mockResolvedValue({ status: "success", version: 4 });
    render(
      <WorkItemDetail
        item={item}
        evidence={evidence}
        events={events}
        projects={projects}
        projectControls={ProjectControlSnapshotSchema.parse(asgardProjectControlFixture())}
        currentAdmin={{ user_id: item.created_by, display_name: "Glaucon", username: "glaucon" }}
        updateAction={updateAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
      />,
    );

    expect(screen.getByLabelText(/project control binding/i)).toHaveTextContent(
      "Coordinate interaction slice",
    );
    expect(screen.getByText(/parent Stage and Gate remain Orchestrator-owned/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^project$/i)).toHaveValue("plato/dashboard");
    expect(screen.queryByLabelText(/project reference/i)).not.toBeInTheDocument();

    const binding = screen.getByLabelText(/project control binding/i);
    const asgardBinding = Array.from(
      (binding as HTMLSelectElement).options,
    ).find((option) => option.value && option.textContent?.includes("Coordinate interaction slice"));
    expect(asgardBinding).toBeDefined();
    fireEvent.change(binding, { target: { value: asgardBinding!.value } });
    expect(screen.getByLabelText(/^project$/i)).toHaveValue(
      "asgard/archaea-gacha-game",
    );
    expect(screen.getByLabelText(/project version/i)).toHaveValue("");

    fireEvent.submit(screen.getByRole("button", { name: /save fields/i }).closest("form")!);
    await waitFor(() => expect(updateAction).toHaveBeenCalledTimes(1));
    const submitted = updateAction.mock.calls[0][1] as FormData;
    expect(submitted.get("projectRef")).toBe("asgard/archaea-gacha-game");
    expect(submitted.get("projectKey")).toBe("asgard/archaea-gacha-game");
  });

  it("renders editable fields, Ready Gate guidance, and allowed transitions", () => {
    render(
      <WorkItemDetail
        item={item}
        evidence={evidence}
        events={events}
        projects={projects}
        currentAdmin={{
          user_id: item.created_by,
          display_name: "Glaucon",
          username: "glaucon",
        }}
        updateAction={successAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
      />,
    );

    expect(
      screen.getByRole("heading", { name: item.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /work tracker/i })).toHaveAttribute(
      "href",
      "/work-tracker",
    );
    expect(
      screen.getByText(/标题、描述和验收标准默认使用中文/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^title$/i)).toHaveValue(item.title);
    expect(screen.getByLabelText(/acceptance criteria/i)).toHaveValue(
      item.acceptance_criteria,
    );
    expect(screen.getByLabelText(/^priority$/i)).toHaveValue("high");
    expect(screen.getByLabelText(/^owner$/i)).toHaveValue(item.owner_id);
    expect(screen.getByLabelText(/^assigned agent$/i)).toHaveValue("plato");
    expect(screen.getByRole("region", { name: /item content/i })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /item properties/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^activity$/i })).toBeInTheDocument();
    expect(screen.getByText(/ready gate requires/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Required version scope")).toBeChecked();
    expect(screen.getByText(/does not grant execution authority/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /move to inbox/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /move to ready/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /move to done/i }),
    ).not.toBeInTheDocument();
  });

  it("submits optional Product Version binding and defaults missing legacy kind safely", async () => {
    const updateAction = vi.fn().mockResolvedValue({ status: "success", version: 4 });
    const { unmount } = render(
      <WorkItemDetail
        item={item}
        evidence={[]}
        events={events}
        projects={projects}
        currentAdmin={{ user_id: item.created_by, display_name: "Glaucon", username: "glaucon" }}
        updateAction={updateAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
      />,
    );
    fireEvent.click(screen.getByLabelText("Optional version scope"));
    fireEvent.submit(screen.getByRole("button", { name: /save fields/i }).closest("form")!);
    await waitFor(() => expect(updateAction).toHaveBeenCalledTimes(1));
    expect((updateAction.mock.calls[0][1] as FormData).get("versionBindingKind")).toBe("optional");

    unmount();
    render(
      <WorkItemDetail
        item={{ ...item, version_binding_kind: undefined }}
        evidence={[]}
        events={events}
        projects={projects}
        currentAdmin={{ user_id: item.created_by, display_name: "Glaucon", username: "glaucon" }}
        updateAction={updateAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
      />,
    );
    expect(screen.getByLabelText("Optional version scope")).toBeChecked();
  });

  it("renders Item dates in the operator timezone regardless of server timezone", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "UTC";

    try {
      render(
        <WorkItemDetail
          item={{ ...item, updated_at: "2026-08-28T00:30:00.000Z" }}
          evidence={[]}
          events={events}
          projects={projects}
          currentAdmin={{
            user_id: item.created_by,
            display_name: "Glaucon",
            username: "glaucon",
          }}
          updateAction={successAction}
          transitionAction={successAction}
          addEvidenceAction={successAction}
          removeEvidenceAction={successAction}
        />,
      );

      expect(screen.getByText(/Updated 2026-08-27/)).toBeInTheDocument();
    } finally {
      process.env.TZ = previousTimezone;
    }
  });

  it("submits an explicit assigned Agent separately from Owner and Agent Claim", async () => {
    const updateAction = vi
      .fn()
      .mockResolvedValue({ status: "success", version: 4 });
    render(
      <WorkItemDetail
        item={item}
        evidence={[]}
        events={events}
        projects={projects}
        agentIds={["amou", "lordguan", "plato"]}
        currentAdmin={{
          user_id: item.created_by,
          display_name: "Glaucon",
          username: "glaucon",
        }}
        updateAction={updateAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
      />,
    );

    const assignedAgent = screen.getByLabelText(/^assigned agent$/i);
    fireEvent.change(assignedAgent, { target: { value: "amou" } });
    fireEvent.submit(
      screen.getByRole("button", { name: /save fields/i }).closest("form")!,
    );

    await waitFor(() => expect(updateAction).toHaveBeenCalledTimes(1));
    const submitted = updateAction.mock.calls[0][1] as FormData;
    expect(submitted.get("assignedAgentId")).toBe("amou");
    expect(submitted.get("ownerId")).toBe(item.owner_id);
    expect(screen.queryByText(/claimed by amou/i)).not.toBeInTheDocument();
  });

  it("does not treat Project owner labels as assigned Agent IDs", () => {
    render(
      <WorkItemDetail
        item={item}
        evidence={[]}
        events={events}
        projects={[
          { ...projects[0], owner: "Plato" },
          { ...projects[1], owner: "LordGuan" },
          {
            projectKey: "shared/asgard-archaea-game",
            title: "阿斯加德古菌",
            owner: "Shared",
            status: "active",
          },
        ]}
        currentAdmin={{
          user_id: item.created_by,
          display_name: "Glaucon",
          username: "glaucon",
        }}
        updateAction={successAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
      />,
    );

    const values = Array.from(
      (screen.getByLabelText(/^assigned agent$/i) as HTMLSelectElement).options,
      (option) => option.value,
    );
    expect(values).toEqual(["plato"]);
    expect(values.every((value) => /^[a-z][a-z0-9-]{0,79}$/u.test(value))).toBe(true);
  });

  it("renders safe evidence controls and chronological audit history", () => {
    render(
      <WorkItemDetail
        item={item}
        evidence={evidence}
        events={events}
        projects={projects}
        currentAdmin={{
          user_id: item.created_by,
          display_name: "Glaucon",
          username: "glaucon",
        }}
        updateAction={successAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Production dashboard" }),
    ).toHaveAttribute("href", "https://402v.com/dashboard");
    expect(
      screen.getByRole("link", { name: "Production dashboard" }),
    ).toHaveAttribute("rel", "noreferrer");
    expect(
      screen.getByRole("button", { name: /remove production dashboard/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^activity$/i }),
    ).toBeInTheDocument();
    const activity = screen
      .getByRole("heading", { name: /^activity$/i })
      .closest("section");
    expect(activity).not.toBeNull();
    expect(within(activity!).getByText(/^created$/i)).toBeInTheDocument();
    expect(screen.getByText(/inbox → triage/i)).toBeInTheDocument();
    expect(screen.queryByText(/actor_id/i)).not.toBeInTheDocument();
  });

  it("renders an explicit empty evidence state", () => {
    render(
      <WorkItemDetail
        item={{ ...item, priority: null, owner_id: null, acceptance_criteria: "" }}
        evidence={[]}
        events={[]}
        projects={projects}
        currentAdmin={{
          user_id: item.created_by,
          display_name: "Glaucon",
          username: "glaucon",
        }}
        updateAction={successAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
      />,
    );

    expect(screen.getByText(/no evidence links yet/i)).toBeInTheDocument();
    expect(screen.getByText(/missing acceptance criteria, priority, owner/i)).toBeInTheDocument();
    expect(screen.getByText(/no history events/i)).toBeInTheDocument();
  });

  it("keeps newly selected Ready Gate values through a successful server action", async () => {
    const updateAction = vi
      .fn()
      .mockResolvedValue({ status: "success", version: 4 });

    render(
      <WorkItemDetail
        item={{ ...item, priority: null, owner_id: null }}
        evidence={[]}
        events={[]}
        projects={projects}
        currentAdmin={{
          user_id: item.created_by,
          display_name: "Glaucon",
          username: "glaucon",
        }}
        updateAction={updateAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
      />,
    );

    const priority = screen.getByLabelText(/^priority$/i);
    const owner = screen.getByLabelText(/^owner$/i);
    fireEvent.change(priority, { target: { value: "high" } });
    fireEvent.change(owner, { target: { value: item.created_by } });
    fireEvent.submit(screen.getByRole("button", { name: /save fields/i }).closest("form")!);

    await waitFor(() =>
      expect(screen.getByText(/fields saved\. version 4/i)).toBeInTheDocument(),
    );
    expect(priority).toHaveValue("high");
    expect(owner).toHaveValue(item.created_by);
  });

  it("renders policy eligibility, active lease history, and admin cancellation", () => {
    render(
      <WorkItemDetail
        item={{
          ...item,
          state: "in_progress",
          risk_level: "low",
          agent_claim_enabled: true,
          authorized_paths: ["components/observatory"],
          allowed_action_classes: ["code_edit", "test"],
        }}
        evidence={[]}
        events={[]}
        projects={projects}
        claims={[activeClaim]}
        currentAdmin={{
          user_id: item.created_by,
          display_name: "Glaucon",
          username: "glaucon",
        }}
        updateAction={successAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
        claimPolicyAction={successAction}
        cancelClaimAction={successAction}
      />,
    );

    expect(screen.getByRole("heading", { name: /agent claim/i })).toBeInTheDocument();
    expect(screen.getByText(/claimed by plato-pilot/i)).toBeInTheDocument();
    expect(screen.getByText(/agent completion stops at review/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel claim/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/risk level/i)).toHaveValue("low");
  });

  it("never treats an ended claim as active even when its historical expiry is future", () => {
    render(
      <WorkItemDetail
        item={item}
        evidence={[]}
        events={[]}
        projects={projects}
        claims={[
          {
            ...activeClaim,
            status: "expired",
            ended_at: "2026-07-23T20:08:00.000Z",
          },
        ]}
        currentAdmin={{
          user_id: item.created_by,
          display_name: "Glaucon",
          username: "glaucon",
        }}
        updateAction={successAction}
        transitionAction={successAction}
        addEvidenceAction={successAction}
        removeEvidenceAction={successAction}
        claimPolicyAction={successAction}
        cancelClaimAction={successAction}
      />,
    );

    expect(screen.getByText(/expired · plato-pilot/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel claim/i })).not.toBeInTheDocument();
  });
});
