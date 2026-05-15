"use client";

import { type ReactNode, useEffect } from "react";

import {
  createPromptIdempotencyKey,
  enqueuePrompt,
  findPromptCandidate,
  getOrCreateClientSessionId,
  readQueuedPrompts,
  replaceQueuedPrompts,
  shouldSkipPromptCapture,
  type QueuedPromptPayload,
} from "@/lib/prompts/client";

type PromptCaptureProviderProps = {
  children: ReactNode;
};

export function PromptCaptureProvider({ children }: PromptCaptureProviderProps) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let disposed = false;

    async function send(payload: QueuedPromptPayload, queueOnFailure = true) {
      try {
        const response = await fetch("/api/prompts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        });

        if (!response.ok && queueOnFailure) {
          enqueuePrompt(localStorage, payload);
        }
      } catch {
        if (queueOnFailure) {
          enqueuePrompt(localStorage, payload);
        }
      }
    }

    async function captureFrom(root: ParentNode | null) {
      if (!root || disposed || shouldSkipPromptCapture(window.location.pathname, root)) {
        return;
      }

      const content = findPromptCandidate(root);

      if (!content) {
        return;
      }

      const clientSessionId = getOrCreateClientSessionId(localStorage);
      const sourceUrl = window.location.href;
      const idempotencyKey = await createPromptIdempotencyKey({
        content,
        clientSessionId,
        sourceUrl,
      });

      await send({ content, clientSessionId, sourceUrl, idempotencyKey });
    }

    async function flushQueue() {
      const queue = readQueuedPrompts(localStorage);
      const failures: QueuedPromptPayload[] = [];

      for (const payload of queue) {
        try {
          const response = await fetch("/api/prompts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
          });

          if (!response.ok) {
            failures.push(payload);
          }
        } catch {
          failures.push(payload);
        }
      }

      replaceQueuedPrompts(localStorage, failures);
    }

    function onSubmit(event: SubmitEvent) {
      void captureFrom(event.target instanceof HTMLFormElement ? event.target : null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        const target = event.target instanceof Element ? event.target.closest("form") : null;
        void captureFrom(target ?? document);
      }
    }

    window.addEventListener("submit", onSubmit, true);
    window.addEventListener("keydown", onKeyDown, true);
    void flushQueue();

    return () => {
      disposed = true;
      window.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return children;
}
