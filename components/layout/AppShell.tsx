import type { ReactNode } from "react";

import { CommandShortcuts } from "@/components/layout/CommandShortcuts";
import { Header } from "@/components/layout/Header";

type AppShellProps = {
  children: ReactNode;
  canPublish?: boolean;
  userEmail: string | null;
};

export function AppShell({ children, canPublish = false, userEmail }: AppShellProps) {
  return (
    <div className="app-shell">
      <CommandShortcuts />
      <Header canPublish={canPublish} userEmail={userEmail} />
      <main className="main-content archive-main">{children}</main>
    </div>
  );
}
