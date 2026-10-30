"use client";
import { useRequireAuth } from "@/lib/auth";

/** Renders children only for logged-in users; otherwise redirects to /login?next=… */
export function AuthGate({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const { ready } = useRequireAuth();
  if (!ready) return <>{fallback ?? <div className="space-y-4"><div className="skeleton h-8 w-60" /><div className="skeleton h-48 rounded-2xl" /></div>}</>;
  return <>{children}</>;
}
