"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, type CategorySchema, type Listing } from "@kup/shared";
import { api } from "@/lib/client-api";
import { useAuth } from "@/lib/auth";
import { ListingView } from "./ListingView";
import { EmptyState } from "../ListingCard";
import Link from "next/link";

/** Fallback when SSR (anonymous) got 404 — e.g. the owner viewing an archived listing. */
export function ClientListing({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<{ listing: Listing; schema: CategorySchema | null } | null>(null);
  const [state, setState] = useState<"loading" | "not_found" | "error" | "ok">("loading");

  const load = useCallback(async () => {
    try {
      const listing = await api().listing(id);
      const schema = await api().schema(listing.category).catch(() => null);
      setData({ listing, schema });
      setState("ok");
    } catch (e) {
      setState(e instanceof ApiError && (e.status === 404 || e.status === 403) ? "not_found" : "error");
    }
  }, [id]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setState("not_found");
      return;
    }
    void load();
  }, [user, loading, load]);

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="skeleton aspect-[4/3] rounded-2xl" />
        <div className="space-y-3"><div className="skeleton h-40 rounded-2xl" /><div className="skeleton h-20 rounded-2xl" /></div>
      </div>
    );
  }
  if (state !== "ok" || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          title={state === "error" ? "Не удалось загрузить объявление" : "Объявление не найдено"}
          text={state === "error" ? "Попробуйте обновить страницу." : "Возможно, оно удалено или снято с публикации."}
          action={<Link href="/" className="btn-primary">На главную</Link>}
        />
      </div>
    );
  }
  return (
    <ListingView
      listing={data.listing}
      schema={data.schema}
      onOwnerChanged={(s) => {
        if (s === "deleted") router.push("/my");
        else void load();
      }}
    />
  );
}
