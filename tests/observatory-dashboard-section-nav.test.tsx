import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DashboardSectionNav,
  type DashboardSectionLink,
} from "@/components/observatory/DashboardSectionNav";

const sections: DashboardSectionLink[] = [
  { id: "dashboard-snapshot", label: "Snapshot" },
  { id: "dashboard-index", label: "Index" },
  { id: "dashboard-objects", label: "Objects" },
];

let observerCallback:
  | ((entries: IntersectionObserverEntry[]) => void)
  | undefined;

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = (entries) => callback(entries, this as never);
  }

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}

afterEach(() => {
  observerCallback = undefined;
  vi.unstubAllGlobals();
});

describe("DashboardSectionNav", () => {
  it("links every available section and marks clicks as current", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    render(
      <>
        <DashboardSectionNav sections={sections} />
        {sections.map((section) => (
          <section key={section.id} id={section.id} />
        ))}
      </>,
    );

    expect(
      screen.getByRole("navigation", { name: /dashboard sections/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Snapshot" })).toHaveAttribute(
      "href",
      "#dashboard-snapshot",
    );
    expect(screen.getByRole("link", { name: "Snapshot" })).toHaveAttribute(
      "aria-current",
      "location",
    );

    fireEvent.click(screen.getByRole("link", { name: "Objects" }));

    expect(screen.getByRole("link", { name: "Objects" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("updates the current section when an observed section enters the reading band", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    render(
      <>
        <DashboardSectionNav sections={sections} />
        {sections.map((section) => (
          <section key={section.id} id={section.id} />
        ))}
      </>,
    );
    const target = document.getElementById("dashboard-index");

    act(() => {
      observerCallback?.([
        {
          target: target as Element,
          isIntersecting: true,
          intersectionRatio: 0.8,
          boundingClientRect: { top: 100 },
        } as IntersectionObserverEntry,
      ]);
    });

    expect(screen.getByRole("link", { name: "Index" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });
});
