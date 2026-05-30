"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import { getExpiresAt } from "@/lib/auth";
import { useState, useEffect } from "react";

function SessionBadge() {
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    setExpiresAt(getExpiresAt());
    const t = setInterval(() => setExpiresAt(getExpiresAt()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!expiresAt) return null;

  const minutesLeft = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60_000);
  const expiringSoon = minutesLeft < 15;

  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium ${
        expiringSoon ? "text-warning" : "text-slate-400"
      }`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full ${
          expiringSoon ? "bg-warning animate-pulse" : "bg-success"
        }`}
      />
      {expiringSoon ? `Session expires in ${minutesLeft}m` : "Session active"}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useTokenRefresh();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header
          className="h-10 flex items-center justify-end px-6 shrink-0 bg-white"
          style={{ borderBottom: "1px solid #e2e8f0" }}
        >
          <SessionBadge />
        </header>
        <main className="flex-1 overflow-auto p-6 bg-slate-50">{children}</main>
      </div>
    </div>
  );
}
