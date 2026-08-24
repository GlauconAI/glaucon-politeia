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
    expect(within(form).getByLabelText(/details/i)).toHaveAttribute(
      "name",
      "description",
    );
    expect(
      within(form).getByRole("button", { name: /capture work item/i }),
    ).toHaveAttribute("type", "submit");
    expect(
      (form.querySelector('input[name="idempotencyKey"]') as HTMLInputElement)
        .value,
    ).toBe("observatory-capture-11111111-1111-4111-8111-111111111111");
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
