"use client";

import { useEffect, useRef, useState } from "react";

export type DashboardSectionLink = {
  id: string;
  label: string;
};

export function DashboardSectionNav({
  sections,
}: {
  sections: DashboardSectionLink[];
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const [topOffset, setTopOffset] = useState(188);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const shell = nav.closest<HTMLElement>(".dashboard-route-shell");
    const routeNav =
      shell?.querySelector<HTMLElement>(".dashboard-route-nav") ?? null;
    const measure = () => {
      const stickyTop = Number.parseFloat(getComputedStyle(nav).top);
      const safeTop = Number.isFinite(stickyTop) ? stickyTop : 132;
      setTopOffset(Math.ceil(safeTop + nav.getBoundingClientRect().height));
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(nav);
    if (routeNav) resizeObserver.observe(routeNav);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element));
    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              right.intersectionRatio - left.intersectionRatio ||
              left.boundingClientRect.top - right.boundingClientRect.top,
          )[0];
        if (current?.target.id) setActiveId(current.target.id);
      },
      {
        rootMargin: `-${topOffset + 16}px 0px -62% 0px`,
        threshold: [0, 0.2, 0.5, 0.8],
      },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sections, topOffset]);

  return (
    <nav
      ref={navRef}
      className="dashboard-section-nav"
      aria-label="Dashboard sections"
    >
      <div>
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={activeId === section.id ? "location" : undefined}
            onClick={() => setActiveId(section.id)}
          >
            {section.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
