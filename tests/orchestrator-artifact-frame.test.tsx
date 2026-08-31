import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrchestratorArtifactFrame } from "@/components/orchestrator/OrchestratorArtifactFrame";

const channel = "402v:orchestrator-frame";

function dispatchFrameMessage(
  frame: HTMLIFrameElement,
  data: unknown,
  source: MessageEventSource | null = frame.contentWindow,
) {
  const event = new MessageEvent("message", { data });
  Object.defineProperty(event, "source", { value: source });
  window.dispatchEvent(event);
}

describe("OrchestratorArtifactFrame", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the iframe scrollable until the child reports a valid height", () => {
    render(<OrchestratorArtifactFrame />);

    const frame = screen.getByTitle("Orchestrator control surface");
    expect(frame).toHaveAttribute("src", "/orchestrator/artifact");
    expect(frame).toHaveAttribute("scrolling", "auto");
    expect(frame).toHaveAttribute("data-height-synchronized", "false");
    expect(frame).not.toHaveStyle({ height: expect.any(String) });
  });

  it("accepts bounded height messages only from its own iframe window", () => {
    render(<OrchestratorArtifactFrame />);

    const frame = screen.getByTitle(
      "Orchestrator control surface",
    ) as HTMLIFrameElement;

    act(() => {
      dispatchFrameMessage(
        frame,
        { channel, type: "height", value: 18_642 },
        window,
      );
      dispatchFrameMessage(frame, { channel, type: "height", value: 0 });
      dispatchFrameMessage(frame, {
        channel,
        type: "height",
        value: 500_001,
      });
    });

    expect(frame).toHaveAttribute("scrolling", "auto");
    expect(frame).toHaveAttribute("data-height-synchronized", "false");

    act(() => {
      dispatchFrameMessage(frame, {
        channel,
        type: "height",
        value: 18_642,
      });
    });

    expect(frame).toHaveStyle({ height: "18642px" });
    expect(frame).toHaveAttribute("scrolling", "no");
    expect(frame).toHaveAttribute("data-height-synchronized", "true");
  });

  it("translates child anchor messages into outer-document scrolling", () => {
    render(<OrchestratorArtifactFrame />);

    const frame = screen.getByTitle(
      "Orchestrator control surface",
    ) as HTMLIFrameElement;
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 220,
      width: 0,
      x: 0,
      y: 220,
      toJSON: () => ({}),
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 300,
    });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    act(() => {
      dispatchFrameMessage(frame, {
        channel,
        type: "anchor",
        value: 900,
      });
    });

    expect(scrollTo).toHaveBeenCalledWith({
      behavior: "smooth",
      top: 1_340,
    });
  });
});
