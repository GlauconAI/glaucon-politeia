"use client";

import { useEffect, useRef, useState } from "react";

const FRAME_CHANNEL = "402v:orchestrator-frame";
const MAX_ARTIFACT_HEIGHT = 500_000;
const OUTER_HEADER_OFFSET = 80;

type FrameMessage = {
  channel: typeof FRAME_CHANNEL;
  type: "anchor" | "height";
  value: number;
};

function parseFrameMessage(value: unknown): FrameMessage | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<FrameMessage>;
  if (
    candidate.channel !== FRAME_CHANNEL ||
    (candidate.type !== "anchor" && candidate.type !== "height") ||
    typeof candidate.value !== "number" ||
    !Number.isFinite(candidate.value) ||
    candidate.value <= 0 ||
    candidate.value > MAX_ARTIFACT_HEIGHT
  ) {
    return null;
  }

  return candidate as FrameMessage;
}

export function OrchestratorArtifactFrame() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);

  useEffect(() => {
    function receiveFrameMessage(event: MessageEvent<unknown>) {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;

      const message = parseFrameMessage(event.data);
      if (!message) return;

      if (message.type === "height") {
        setFrameHeight(Math.ceil(message.value));
        return;
      }

      const frameTop = frame.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        behavior: "smooth",
        top: Math.max(0, frameTop + message.value - OUTER_HEADER_OFFSET),
      });
    }

    window.addEventListener("message", receiveFrameMessage);
    return () => window.removeEventListener("message", receiveFrameMessage);
  }, []);

  const synchronized = frameHeight !== null;

  return (
    <iframe
      ref={frameRef}
      className="orchestrator-artifact-frame"
      src="/orchestrator/artifact"
      title="Orchestrator control surface"
      scrolling={synchronized ? "no" : "auto"}
      data-height-synchronized={String(synchronized)}
      style={synchronized ? { height: frameHeight } : undefined}
    />
  );
}
