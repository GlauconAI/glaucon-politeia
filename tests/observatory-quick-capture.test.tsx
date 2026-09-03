import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ObservatoryQuickCaptureActionState } from "@/app/observatory/actions";
import { QuickCapture } from "@/components/observatory/QuickCapture";
import type { WorkTrackerProjectOption } from "@/lib/observatory/work-tracker-projects";
import type { ObservatoryProjectVersionRow } from "@/lib/observatory/repository";

const projects: WorkTrackerProjectOption[] = [
  {
    projectKey: "plato/dashboard",
    title: "Dashboard",
    owner: "plato",
    status: "active",
  },
  {
    projectKey: "amou/wenya-ai",
    title: "问芽 AI",
    owner: "amou",
    status: "maintained",
  },
  {
    projectKey: "shared/asgard-archaea-gacha-game",
    title: "阿斯加德古菌游戏",
    owner: "Shared",
    status: "active",
  },
];

const agentIds = ["amou", "aristotle", "plato"];
const versionBase = {
  description: "", target_date: null, released_at: null, is_backlog: false,
  row_version: 1, created_by: "admin", created_at: "2026-09-02T00:00:00Z",
  updated_by: "admin", updated_at: "2026-09-02T00:00:00Z",
} as const;
const versions: ObservatoryProjectVersionRow[] = [
  { ...versionBase, id: "11111111-1111-4111-8111-111111111111", project_key: "plato/dashboard", version_label: "v1.0", title: "Dashboard release", status: "active" },
  { ...versionBase, id: "22222222-2222-4222-8222-222222222222", project_key: "amou/wenya-ai", version_label: "v0.2", title: "问芽版本", status: "planned" },
];

describe("QuickCapture", () => {
  it("uses keyboard-accessible native controls for Idea, Feature, and Bug capture", () => {
    render(
      <QuickCapture
        initialIdempotencyKey="observatory-capture-11111111-1111-4111-8111-111111111111"
      />,
    );

    const form = screen.getByRole("form", { name: /quick capture/i });
    expect(screen.getByText("Tab ↹ · Enter ↵")).toBeVisible();
    expect(within(form).getByRole("radio", { name: "Idea" })).toBeChecked();
    expect(within(form).getByRole("radio", { name: "Feature" })).toBeEnabled();
    expect(within(form).getByRole("radio", { name: "Bug" })).toBeEnabled();
    expect(within(form).getByLabelText("Title")).toHaveAttribute("name", "title");
    expect(within(form).getByLabelText("Title")).toHaveAttribute(
      "placeholder",
      "用中文简要说明需要处理的事项",
    );
    expect(within(form).getByLabelText(/details/i)).toHaveAttribute(
      "name",
      "description",
    );
    expect(within(form).getByLabelText(/details/i)).toHaveAttribute(
      "placeholder",
      "补充背景、目标或限制；专有名词可保留英文",
    );
    expect(
      screen.getByText(/标题、描述和验收标准默认使用中文/),
    ).toBeInTheDocument();
    expect(
      within(form).getByRole("button", { name: /capture work item/i }),
    ).toHaveAttribute("type", "submit");
    expect(
      (form.querySelector('input[name="idempotencyKey"]') as HTMLInputElement)
        .value,
    ).toBe("observatory-capture-11111111-1111-4111-8111-111111111111");
  });

  it("requires a canonical Project and preserves it after a successful capture", async () => {
    const action = vi.fn(
      async (
        _previousState: ObservatoryQuickCaptureActionState,
        _formData: FormData,
      ): Promise<ObservatoryQuickCaptureActionState> => ({
        status: "success",
        workItemId: "work-item-project",
      }),
    );
    render(
      <QuickCapture
        action={action}
        projects={projects}
        agentIds={agentIds}
        versions={versions}
        initialIdempotencyKey="observatory-capture-77777777-7777-4777-8777-777777777777"
      />,
    );

    const project = screen.getByLabelText("Project");
    const assignedAgent = screen.getByLabelText("Assigned Agent");
    expect(project).toBeRequired();
    expect(assignedAgent).toBeRequired();
    fireEvent.change(project, { target: { value: "amou/wenya-ai" } });
    expect(assignedAgent).toHaveValue("amou");
    const projectVersion = screen.getByLabelText("Project Version");
    fireEvent.change(projectVersion, { target: { value: versions[1].id } });
    const bindingKind = screen.getByLabelText("Required version scope");
    expect(bindingKind).toHaveAccessibleDescription(/does not authorize execution/i);
    fireEvent.click(bindingKind);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "补充问芽训练样本" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /quick capture/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /captured in inbox/i,
    );
    expect((action.mock.calls[0][1] as FormData).get("projectRef")).toBe(
      "amou/wenya-ai",
    );
    expect((action.mock.calls[0][1] as FormData).get("assignedAgentId")).toBe(
      "amou",
    );
    expect((action.mock.calls[0][1] as FormData).get("projectVersionId")).toBe(versions[1].id);
    expect((action.mock.calls[0][1] as FormData).get("versionBindingKind")).toBe("required");
    expect(project).toHaveValue("amou/wenya-ai");
    fireEvent.change(project, { target: { value: "plato/dashboard" } });
    expect(projectVersion).toHaveValue("");
  });

  it("defaults legacy-compatible Product Version binding to optional", () => {
    render(<QuickCapture projects={projects} versions={versions} agentIds={agentIds} initialIdempotencyKey="observatory-capture-12121212-1212-4212-8212-121212121212" initialState={{ status: "error", fieldErrors: { versionBindingKind: ["Choose required or optional version scope."] } }} />);
    expect(screen.getByLabelText("Optional version scope")).toBeChecked();
    expect(screen.getByLabelText("Required version scope")).not.toBeChecked();
    expect(screen.getByText("Choose required or optional version scope.")).toBeInTheDocument();
  });

  it("requires an explicit Agent for a Shared Project instead of assigning shared", () => {
    render(
      <QuickCapture
        projects={projects}
        agentIds={agentIds}
        initialIdempotencyKey="observatory-capture-88888888-8888-4888-8888-888888888888"
      />,
    );

    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: "shared/asgard-archaea-gacha-game" },
    });

    const assignedAgent = screen.getByLabelText("Assigned Agent");
    expect(assignedAgent).toBeRequired();
    expect(assignedAgent).toHaveValue("");
    expect(screen.queryByRole("option", { name: "shared" })).not.toBeInTheDocument();
  });

  it("announces a successful capture", () => {
    render(
      <QuickCapture
        initialIdempotencyKey="observatory-capture-22222222-2222-4222-8222-222222222222"
        initialState={{ status: "success", workItemId: "work-item-1" }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/captured in inbox/i);
    expect(screen.getByRole("status")).toHaveTextContent("work-item-1");
  });

  it("associates field errors with controls and announces form errors", () => {
    render(
      <QuickCapture
        initialIdempotencyKey="observatory-capture-33333333-3333-4333-8333-333333333333"
        initialState={{
          status: "error",
          fieldErrors: { title: ["Title is required."] },
          formError: "Observatory is temporarily unavailable. Try again.",
        }}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Title")).toHaveAccessibleDescription(
      "Title is required.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /temporarily unavailable/i,
    );
  });

  it("submits once through the visible capture button", async () => {
    const action = vi.fn(
      async (
        _previousState: ObservatoryQuickCaptureActionState,
        _formData: FormData,
      ): Promise<ObservatoryQuickCaptureActionState> => ({
        status: "success",
        workItemId: "work-item-button",
      }),
    );
    const initialKey =
      "observatory-capture-66666666-6666-4666-8666-666666666666";

    render(
      <QuickCapture action={action} initialIdempotencyKey={initialKey} />,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Hydration regression" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /capture work item/i }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      /captured in inbox/i,
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect((action.mock.calls[0][1] as FormData).get("title")).toBe(
      "Hydration regression",
    );
    expect((action.mock.calls[0][1] as FormData).get("idempotencyKey")).toBe(
      initialKey,
    );
  });

  it("preserves values and key across an error, then resets and rotates only after success", async () => {
    let attempt = 0;
    const action = vi.fn(
      async (
        _previousState: ObservatoryQuickCaptureActionState,
        _formData: FormData,
      ): Promise<ObservatoryQuickCaptureActionState> => {
        attempt += 1;
        return attempt === 1
          ? {
              status: "error" as const,
              fieldErrors: {
                idempotencyKey: ["Capture key could not be accepted."],
              },
            }
          : { status: "success" as const, workItemId: "work-item-2" };
      },
    );
    const initialKey =
      "observatory-capture-44444444-4444-4444-8444-444444444444";

    render(
      <QuickCapture action={action} initialIdempotencyKey={initialKey} />,
    );

    const form = screen.getByRole("form", { name: /quick capture/i });
    const title = screen.getByLabelText("Title");
    const details = screen.getByLabelText(/details/i);
    const key = form.querySelector(
      'input[name="idempotencyKey"]',
    ) as HTMLInputElement;
    fireEvent.click(screen.getByRole("radio", { name: "Bug" }));
    fireEvent.change(title, { target: { value: "Collector timeout" } });
    fireEvent.change(details, {
      target: { value: "The source command exceeded its deadline." },
    });

    fireEvent.submit(form);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Capture key could not be accepted.",
    );
    expect(title).toHaveValue("Collector timeout");
    expect(details).toHaveValue("The source command exceeded its deadline.");
    expect(key).toHaveValue(initialKey);
    expect(screen.getByRole("radio", { name: "Bug" })).toBeChecked();
    expect(action).toHaveBeenCalledTimes(1);
    expect((action.mock.calls[0][1] as FormData).get("idempotencyKey")).toBe(
      initialKey,
    );

    fireEvent.submit(form);

    expect(await screen.findByRole("status")).toHaveTextContent(
      /captured in inbox/i,
    );
    await waitFor(() => {
      expect(title).toHaveValue("");
      expect(details).toHaveValue("");
      expect(screen.getByRole("radio", { name: "Idea" })).toBeChecked();
      expect(key.value).toMatch(
        /^observatory-capture-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
      expect(key).not.toHaveValue(initialKey);
      expect(key.value).not.toContain("work-item-2");
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("disables and labels the submit control while capture is pending", async () => {
    let settle!: (state: ObservatoryQuickCaptureActionState) => void;
    const action = vi.fn(
      (
        _previousState: ObservatoryQuickCaptureActionState,
        _formData: FormData,
      ) =>
        new Promise<ObservatoryQuickCaptureActionState>((resolve) => {
          settle = resolve;
        }),
    );

    render(
      <QuickCapture
        action={action}
        initialIdempotencyKey="observatory-capture-55555555-5555-4555-8555-555555555555"
      />,
    );

    fireEvent.submit(screen.getByRole("form", { name: /quick capture/i }));

    expect(
      await screen.findByRole("button", { name: "Capturing…" }),
    ).toBeDisabled();

    await act(async () => {
      settle({ status: "error", formError: "Capture cancelled." });
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Capture cancelled.");
  });
});
