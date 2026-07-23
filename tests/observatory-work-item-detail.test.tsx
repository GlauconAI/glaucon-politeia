import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkItemDetail } from "@/components/observatory/WorkItemDetail";
import type {
  ObservatoryWorkItemEventRow,
  ObservatoryWorkItemEvidenceRow,
  ObservatoryWorkItemRow,
} from "@/lib/observatory/repository";

const item: ObservatoryWorkItemRow = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "feature",
  title: "Build the manual board",
  description: "Admin-only workflow.",
  state: "triage",
  priority: "high",
  owner_id: "22222222-2222-4222-8222-222222222222",
  acceptance_criteria: "The item can reach Done.",
  project_ref: "dashboard",
  milestone_ref: "OBS-M3",
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

describe("WorkItemDetail", () => {
  it("renders editable fields, Ready Gate guidance, and allowed transitions", () => {
    render(
      <WorkItemDetail
        item={item}
        evidence={evidence}
        events={events}
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
    expect(screen.getByLabelText(/^title$/i)).toHaveValue(item.title);
    expect(screen.getByLabelText(/acceptance criteria/i)).toHaveValue(
      item.acceptance_criteria,
    );
    expect(screen.getByLabelText(/^priority$/i)).toHaveValue("high");
    expect(screen.getByLabelText(/^owner$/i)).toHaveValue(item.owner_id);
    expect(screen.getByText(/ready gate requires/i)).toBeInTheDocument();
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

  it("renders safe evidence controls and chronological audit history", () => {
    render(
      <WorkItemDetail
        item={item}
        evidence={evidence}
        events={events}
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
    expect(screen.getByRole("heading", { name: /history/i })).toBeInTheDocument();
    expect(screen.getByText(/created/i)).toBeInTheDocument();
    expect(screen.getByText(/inbox → triage/i)).toBeInTheDocument();
    expect(screen.queryByText(/actor_id/i)).not.toBeInTheDocument();
  });

  it("renders an explicit empty evidence state", () => {
    render(
      <WorkItemDetail
        item={{ ...item, priority: null, owner_id: null, acceptance_criteria: "" }}
        evidence={[]}
        events={[]}
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
});
