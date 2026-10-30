"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Category } from "@kup/shared";
import { useAuth } from "@/lib/auth";
import { IconHeart, IconPlus, IconSearch, IconUser } from "./icons";
import { Suspense } from "react";

export function Header({ categories }: { categories: Category[] }) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-3">
        <Link href="/" className="text-2xl font-extrabold tracking-tight text-accent-600 shrink-0" aria-label="kup — на главную">
          kup
        </Link>
        <div className="flex-1 min-w-0">
          <Suspense fallback={<div className="input" />}>
            <SearchBox categories={categories} />
          </Suspense>
        </div>
        <Link href="/new" className="btn-primary hidden md:inline-flex">
          <IconPlus size={18} /> Подать объявление
        </Link>
        <Link href="/new" className="btn-primary md:hidden !px-0 w-10 shrink-0" aria-label="Подать объявление">
          <IconPlus size={20} />
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}

function SearchBox({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const current = pathname.startsWith("/s/") ? pathname.split("/")[2] : "";
  const [category, setCategory] = useState(current || categories[0]?.slug || "cars");
  const [q, setQ] = useState(current ? params.get("q") ?? "" : "");

  useEffect(() => {
    if (current) {
      setCategory(current);
      setQ(params.get("q") ?? "");
    }
  }, [current, params]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams(category === current ? params.toString() : "");
    sp.delete("page");
    if (q.trim()) sp.set("q", q.trim());
    else sp.delete("q");
    const qs = sp.toString().replace(/%2C/gi, ",");
    router.push(`/s/${category}${qs ? "?" + qs : ""}`);
  }

  return (
    <form onSubmit={submit} role="search" className="flex h-10 rounded-xl border border-gray-200 bg-gray-50 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-100 focus-within:bg-white overflow-hidden">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        aria-label="Категория"
        className="hidden sm:block bg-transparent pl-3 pr-1 text-sm text-gray-700 outline-none border-r border-gray-200 max-w-[11rem]"
      >
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск: «камри», «2-комнатная»…"
        aria-label="Поиск"
        className="flex-1 min-w-0 bg-transparent px-3 text-sm outline-none"
        type="search"
        enterKeyHint="search"
      />
      <button type="submit" className="px-3 text-gray-500 hover:text-accent-600" aria-label="Найти">
        <IconSearch size={18} />
      </button>
    </form>
  );
}

function UserMenu() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  if (loading && !user) return <div className="skeleton w-10 h-10 rounded-full shrink-0" />;
  if (!user) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn-secondary shrink-0 !px-3">
        <IconUser size={18} /> <span className="hidden sm:inline">Войти</span>
      </Link>
    );
  }
  const initial = user.name.trim().slice(0, 1).toUpperCase();
  return (
    <div className="relative shrink-0">
      <Link href="/favorites" className="btn-ghost !px-2 hidden sm:inline-flex mr-1 align-middle" aria-label="Избранное">
        <IconHeart size={20} />
      </Link>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full bg-accent-100 text-accent-700 font-semibold align-middle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Профиль"
      >
        {initial || <IconUser size={18} className="mx-auto" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 mt-2 z-20 w-56 card p-1.5 shadow-lg">
            <div className="px-3 py-2 text-sm">
              <div className="font-medium truncate">{user.name || "Без имени"}</div>
              <div className="text-gray-500">{user.phone}</div>
            </div>
            <MenuLink href="/my">Мои объявления</MenuLink>
            <MenuLink href="/favorites">Избранное</MenuLink>
            <MenuLink href="/profile">Профиль</MenuLink>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} role="menuitem" className="block rounded-lg px-3 py-2 text-sm hover:bg-gray-100">
      {children}
    </Link>
  );
}
