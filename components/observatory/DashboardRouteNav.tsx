"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const routes = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/projects", label: "Projects", exact: false },
  { href: "/dashboard/decisions", label: "Decisions", exact: false },
  { href: "/dashboard/skills", label: "Skills", exact: false },
  { href: "/dashboard/crons", label: "Cron Jobs", exact: false },
] as const;

export function DashboardRouteNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const shell = nav?.closest<HTMLElement>(".dashboard-route-shell");
    if (!nav || !shell) return;
    const header = document.querySelector<HTMLElement>(".site-header");
    const measure = () => {
      shell.style.setProperty(
        "--dashboard-header-height",
        `${Math.ceil(header?.getBoundingClientRect().height ?? 64)}px`,
      );
      shell.style.setProperty(
        "--dashboard-route-height",
        `${Math.ceil(nav.getBoundingClientRect().height)}px`,
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const resizeObserver = new ResizeObserver(measure);
    if (header) resizeObserver.observe(header);
    resizeObserver.observe(nav);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <nav
      ref={navRef}
      className="dashboard-route-nav"
      aria-label="Dashboard routes"
    >
      {routes.map((route) => {
        const current = route.exact
          ? pathname === route.href
          : pathname.startsWith(route.href);
        return (
          <Link
            key={route.href}
            href={route.href}
            aria-current={current ? "page" : undefined}
          >
            {route.label}
          </Link>
        );
      })}
    </nav>
  );
}
