import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DashboardSectionNav,
  type DashboardSectionLink,
} from "@/components/observatory/DashboardSectionNav";
import { DashboardRouteNav } from "@/components/observatory/DashboardRouteNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

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

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  observerCallback = undefined;
  vi.unstubAllGlobals();
});

describe("DashboardSectionNav", () => {
  it("links the dedicated Cron Jobs directory from the Dashboard route bar", () => {
    render(<DashboardRouteNav />);

    expect(screen.getByRole("link", { name: "Cron Jobs" })).toHaveAttribute(
      "href",
      "/dashboard/crons",
    );
  });

  it("uses sticky, horizontally scrollable navigation and offset section anchors", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toMatch(
      /\.dashboard-route-nav\s*\{[^}]*top:\s*var\(--dashboard-header-height/u,
    );
    expect(css).toMatch(
      /\.dashboard-section-nav\s*\{[^}]*position:\s*sticky[^}]*top:\s*var\(--dashboard-section-nav-top/u,
    );
    expect(css).toMatch(
      /\.dashboard-section-nav\s+div\s*\{[^}]*overflow-x:\s*auto/u,
    );
    expect(css).toMatch(
      /\.dashboard-section-anchor\s*\{[^}]*scroll-margin-top:\s*var\(--dashboard-anchor-offset/u,
    );
    expect(css).toMatch(
      /\.dashboard-section-nav\s+a:focus-visible\s*\{[^}]*outline:/u,
    );
  });

  it("publishes measured header and route navigation heights to the shell", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        const height = this.classList.contains("site-header")
          ? 64
          : this.classList.contains("dashboard-route-nav")
            ? 48
            : 0;
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 0,
          bottom: height,
          left: 0,
          width: 0,
          height,
          toJSON: () => ({}),
        };
      },
    );

    const { container } = render(
      <>
        <header className="site-header" />
        <div className="dashboard-route-shell">
          <DashboardRouteNav />
        </div>
      </>,
    );
    const shell = container.querySelector<HTMLElement>(
      ".dashboard-route-shell",
    );

    expect(shell).toHaveStyle({
      "--dashboard-header-height": "64px",
      "--dashboard-route-height": "48px",
    });
  });

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
import { readFileSync } from "node:fs";
import { join } from "node:path";
