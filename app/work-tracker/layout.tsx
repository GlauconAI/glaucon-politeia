import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Concerto — Work Tracker",
  description: "Where work and minds move in concert.",
};

export default function WorkTrackerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
