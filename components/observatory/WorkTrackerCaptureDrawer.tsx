"use client";

import { useEffect, useRef, useState } from "react";

import { QuickCapture } from "@/components/observatory/QuickCapture";
import type { WorkTrackerProjectOption } from "@/lib/observatory/work-tracker-projects";

type WorkTrackerCaptureDrawerProps = {
  initialIdempotencyKey: string;
  projects: WorkTrackerProjectOption[];
};

export function WorkTrackerCaptureDrawer({
  initialIdempotencyKey,
  projects,
}: WorkTrackerCaptureDrawerProps) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const triggerButton = triggerButtonRef.current;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      triggerButton?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerButtonRef}
        type="button"
        className="button-primary work-tracker-capture-trigger"
        onClick={() => setOpen(true)}
      >
        ＋ 新建 Item
      </button>
      {open ? (
        <div
          className="work-tracker-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="work-tracker-capture-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Quick Capture"
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="work-tracker-drawer-close"
              aria-label="关闭 Quick Capture"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <QuickCapture
              initialIdempotencyKey={initialIdempotencyKey}
              projects={projects}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
