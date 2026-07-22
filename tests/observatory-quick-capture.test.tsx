import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuickCapture } from "@/components/observatory/QuickCapture";

describe("QuickCapture", () => {
  it("uses keyboard-accessible native controls for Idea, Feature, and Bug capture", () => {
    render(<QuickCapture />);

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
    ).toMatch(/^observatory-capture-[A-Za-z0-9._:-]+-0$/u);
  });

  it("announces a successful capture", () => {
    render(
      <QuickCapture
        initialState={{ status: "success", workItemId: "work-item-1" }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/captured in inbox/i);
    expect(screen.getByRole("status")).toHaveTextContent("work-item-1");
  });

  it("associates field errors with controls and announces form errors", () => {
    render(
      <QuickCapture
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

  it("accepts an injected action boundary", () => {
    const action = vi.fn(async () => ({
      status: "success" as const,
      workItemId: "work-item-2",
    }));

    render(<QuickCapture action={action} />);

    expect(screen.getByRole("form", { name: /quick capture/i })).toBeInTheDocument();
  });
});
