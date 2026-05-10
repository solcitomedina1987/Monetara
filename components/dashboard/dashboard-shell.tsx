"use client";

import { useState, useLayoutEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import type { Profile } from "@/lib/types";

function ProfileThemeSync({ defaultTheme }: { defaultTheme?: string | null }) {
  const { setTheme } = useTheme();
  const applied = useRef(false);

  useLayoutEffect(() => {
    if (applied.current) return;
    if (defaultTheme === "light" || defaultTheme === "dark" || defaultTheme === "monetara") {
      setTheme(defaultTheme);
    }
    applied.current = true;
  }, [defaultTheme, setTheme]);

  return null;
}

export function DashboardShell({
  children,
  initialProfile,
}: {
  children: React.ReactNode;
  initialProfile: Profile | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <ProfileThemeSync defaultTheme={initialProfile?.default_theme} />
      <div className="flex h-screen overflow-hidden bg-background">
        <aside className="hidden md:flex md:w-64 md:flex-col">
          <Sidebar />
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-72 z-10">
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          <Header profile={initialProfile} onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto p-4 md:p-6 max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}
