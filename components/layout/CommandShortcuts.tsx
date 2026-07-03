"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const sequenceTimeoutMs = 1200;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

export function CommandShortcuts() {
  const router = useRouter();
  const pendingSequence = useRef<string | null>(null);
  const pendingTimer = useRef<number | null>(null);

  useEffect(() => {
    function clearSequence() {
      pendingSequence.current = null;
      if (pendingTimer.current) {
        window.clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
    }

    function startSequence(key: string) {
      clearSequence();
      pendingSequence.current = key;
      pendingTimer.current = window.setTimeout(clearSequence, sequenceTimeoutMs);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && !event.altKey && key === "k") {
        event.preventDefault();
        clearSequence();
        const searchInput = document.querySelector<HTMLInputElement>("[data-command-search]");
        searchInput?.focus();
        searchInput?.select();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        clearSequence();
        return;
      }

      if (pendingSequence.current === "g") {
        if (key === "h") {
          event.preventDefault();
          clearSequence();
          router.push("/");
          return;
        }

        if (key === "s") {
          event.preventDefault();
          clearSequence();
          router.push("/sites");
          return;
        }

        if (key === "l") {
          event.preventDefault();
          clearSequence();
          router.push("/learn");
          return;
        }
      }

      if (key === "g") {
        startSequence("g");
        return;
      }

      clearSequence();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearSequence();
    };
  }, [router]);

  return null;
}
