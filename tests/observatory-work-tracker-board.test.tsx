import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkTrackerBoard } from "@/components/observatory/WorkTrackerBoard";
import type { ObservatoryWorkItemRow } from "@/lib/observatory/repository";
import type { ObservatoryWorkItemClaimRow } from "@/lib/observatory/repository";

const item: ObservatoryWorkItemRow = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "feature",
  title: "Build the manual board",
  description: "Admin-only workflow.",
  state: "triage",
  priority: "high",
  owner_id: "22222222-2222-4222-8222-222222222222",
  acceptance_criteria: "The item reaches Done.",
  project_ref: "dashboard",
  milestone_ref: "OBS-M3",
  project_key: null,
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

describe("WorkTrackerBoard", () => {
  it("renders every workflow column and an explicit empty state", () => {
    render(
      <WorkTrackerBoard state={{ status: "ready", items: [item] }} />,
    );

    for (const label of [
      "Inbox",
      "Triage",
      "Ready",
      "In Progress",
      "Review",
      "Done",
      "Blocked",
      "Waiting",
      "Reopened",
    ]) {
      expect(
        screen.getByRole("region", { name: new RegExp(`^${label}`, "i") }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("Build the manual board")).toBeInTheDocument();
    expect(screen.getAllByText("No work items.").length).toBeGreaterThan(0);
  });

  it("links each card to its detail and exposes only allowed move targets", () => {
    render(
      <WorkTrackerBoard state={{ status: "ready", items: [item] }} />,
    );

    expect(
      screen.getByRole("link", { name: "Build the manual board" }),
    ).toHaveAttribute(
      "href",
      `/dashboard/work-items/${item.id}`,
    );
    const select = screen.getByLabelText(/move build the manual board to/i);
    expect(select).toHaveValue("inbox");
    expect(screen.getByRole("option", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ready" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Done" }),
    ).not.toBeInTheDocument();
  });

  it("labels manual, eligible, and actively claimed work without drag-only semantics", () => {
    const eligible = {
      ...item,
      id: "22222222-2222-4222-8222-222222222222",
      title: "Eligible feature",
      state: "ready" as const,
      risk_level: "low" as const,
      agent_claim_enabled: true,
      authorized_paths: ["components/observatory"],
      allowed_action_classes: ["code_edit" as const],
    };
    const claimed = {
      ...eligible,
      id: "33333333-3333-4333-8333-333333333333",
      title: "Claimed feature",
      state: "in_progress" as const,
    };
    const claim: ObservatoryWorkItemClaimRow = {
      id: "44444444-4444-4444-8444-444444444444",
      work_item_id: claimed.id,
      agent_id: "plato-pilot",
      status: "active",
      claim_version: 1,
      started_at: "2026-07-23T20:00:00.000Z",
      last_heartbeat_at: "2026-07-23T20:01:00.000Z",
      lease_expires_at: "2099-07-23T20:15:00.000Z",
      ended_at: null,
      completion_summary: null,
      result_evidence_url: null,
      created_at: "2026-07-23T20:00:00.000Z",
      updated_at: "2026-07-23T20:01:00.000Z",
    };

    render(
      <WorkTrackerBoard
        state={{
          status: "ready",
          items: [item, eligible, claimed],
          activeClaims: [claim],
        }}
      />,
    );

    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("Agent eligible")).toBeInTheDocument();
    expect(screen.getByText("Claimed by plato-pilot")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/move claimed feature to/i),
    ).toBeInTheDocument();
  });

  it("submits the keyboard-operable move form with expected version", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ status: "success", version: 4 });
    render(
      <WorkTrackerBoard
        state={{ status: "ready", items: [item] }}
        action={action}
      />,
    );

    fireEvent.change(
      screen.getByLabelText(/move build the manual board to/i),
      { target: { value: "ready" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /^move$/i }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("workItemId")).toBe(item.id);
    expect(submitted.get("expectedVersion")).toBe("3");
    expect(submitted.get("targetState")).toBe("ready");
  });

  it("supports native drag as enhancement and reports stable failures", async () => {
    const action = vi.fn().mockResolvedValue({
      status: "error",
      formError: "This item changed. Refresh before trying again.",
    });
    render(
      <WorkTrackerBoard
        state={{ status: "ready", items: [item] }}
        action={action}
      />,
    );

    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
      effectAllowed: "move",
    };
    fireEvent.dragStart(screen.getByTestId(`work-item-${item.id}`), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByRole("region", { name: /^ready/i }), {
      dataTransfer,
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/changed.*refresh/i),
    );
  });

  it("renders bounded unavailable and empty-board states", () => {
    const view = render(
      <WorkTrackerBoard
        state={{ status: "error", message: "Work Tracker is unavailable." }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Work Tracker is unavailable.",
    );
    view.rerender(
      <WorkTrackerBoard state={{ status: "ready", items: [] }} />,
    );
    expect(screen.getByText(/capture the first work item/i)).toBeInTheDocument();
  });
});
