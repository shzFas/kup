"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Category } from "@kup/shared";
import { useAuth } from "@/lib/auth";
import { useEvents } from "@/lib/events";
import { useI18n } from "@/i18n/client";
import { IconBell, IconChat, IconHeart, IconPlus, IconUser } from "./icons";
import { Badge } from "./Modal";
import { LangSwitcher } from "./LangSwitcher";
import { SearchBox } from "./SearchBox";

export function Header({ categories }: { categories: Category[] }) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-2 sm:gap-3">
        <Link href="/" className="text-2xl font-extrabold tracking-tight text-accent-600 shrink-0" aria-label={t("header.logoLabel")}>
          kup
        </Link>
        <div className="flex-1 min-w-0">
          <Suspense fallback={<div className="input" />}>
            <SearchBox categories={categories} />
          </Suspense>
        </div>
        <Link href="/new" className="btn-primary hidden md:inline-flex">
          <IconPlus size={18} /> {t("header.post")}
        </Link>
        <Link href="/new" className="btn-primary md:hidden !px-0 w-10 shrink-0" aria-label={t("header.post")}>
          <IconPlus size={20} />
        </Link>
        <LangSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { user, loading, logout } = useAuth();
  const { chatUnread, notifUnread } = useEvents();
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (loading && !user) return <div className="skeleton w-10 h-10 rounded-full shrink-0" />;
  if (!user) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn-secondary shrink-0 !px-3">
        <IconUser size={18} /> <span className="hidden sm:inline">{t("header.login")}</span>
      </Link>
    );
  }
  const initial = user.name.trim().slice(0, 1).toUpperCase();
  const isModerator = user.role === "moderator" || user.role === "admin";
  const total = chatUnread + notifUnread;
  return (
    <div className="relative shrink-0 flex items-center">
      <Link href="/favorites" className="btn-ghost !px-2 hidden lg:inline-flex" aria-label={t("nav.favorites")} title={t("nav.favorites")}>
        <IconHeart size={20} />
      </Link>
      <Link href="/chats" className="btn-ghost !px-2 hidden sm:inline-flex relative" aria-label={`${t("nav.chats")}${chatUnread ? ` (${chatUnread})` : ""}`} title={t("nav.chats")}>
        <IconChat size={20} />
        <Badge n={chatUnread} className="absolute -top-0.5 -right-0.5" />
      </Link>
      <Link
        href="/notifications"
        className="btn-ghost !px-2 hidden sm:inline-flex relative mr-1"
        aria-label={`${t("nav.notifications")}${notifUnread ? ` (${notifUnread})` : ""}`}
        title={t("nav.notifications")}
      >
        <IconBell size={20} />
        <Badge n={notifUnread} className="absolute -top-0.5 -right-0.5" />
      </Link>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-full bg-accent-100 text-accent-700 font-semibold"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("nav.profile")}
      >
        {initial || <IconUser size={18} className="mx-auto" />}
        {total > 0 && <span className="sm:hidden absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full mt-2 z-20 w-60 card p-1.5 shadow-lg">
            <div className="px-3 py-2 text-sm">
              <div className="font-medium truncate">{user.name || t("common.unnamed")}</div>
              <div className="text-gray-500">{user.phone}</div>
            </div>
            <MenuLink href="/my">{t("nav.my")}</MenuLink>
            <MenuLink href="/chats" badge={chatUnread}>{t("nav.chats")}</MenuLink>
            <MenuLink href="/notifications" badge={notifUnread}>{t("nav.notifications")}</MenuLink>
            <MenuLink href="/favorites">{t("nav.favorites")}</MenuLink>
            <MenuLink href="/searches">{t("nav.searches")}</MenuLink>
            <MenuLink href="/profile">{t("nav.profile")}</MenuLink>
            {isModerator && <MenuLink href="/admin">{t("nav.admin")}</MenuLink>}
            <div className="my-1 border-t border-gray-100" />
            <button type="button" role="menuitem" onClick={() => void logout()} className="w-full text-left rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
              {t("nav.logout")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({ href, children, badge = 0 }: { href: string; children: React.ReactNode; badge?: number }) {
  return (
    <Link href={href} role="menuitem" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-gray-100">
      {children}
      <Badge n={badge} />
    </Link>
  );
}
