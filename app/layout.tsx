import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { getPublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { themeInitScript } from "@/lib/theme/init";

import "./globals.css";

export const metadata: Metadata = {
  title: "Glaucon Politeia",
  description: "A personal AI coding archive and publishing platform.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  async function getUserEmail() {
    if (!getPublicEnv().configured) {
      return null;
    }

    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      return data.user?.email ?? null;
    } catch {
      return null;
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AppShell userEmail={await getUserEmail()}>{children}</AppShell>
      </body>
    </html>
  );
}
