"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const routes = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/projects", label: "Projects", exact: false },
  { href: "/dashboard/skills", label: "Skills", exact: false },
] as const;

export function DashboardRouteNav() {
  const pathname = usePathname();

  return (
    <nav className="dashboard-route-nav" aria-label="Dashboard routes">
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
