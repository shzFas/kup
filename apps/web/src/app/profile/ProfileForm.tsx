"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LANGS, type Lang } from "@kup/shared";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";
import { formatPhone, memberSince } from "@/lib/format";
import { useI18n } from "@/i18n/client";

export function ProfileForm() {
  const { user, setUser, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!user) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      setUser(await api().updateMe({ name: name.trim() }));
      setMsg({ ok: true, text: t("common.saved") });
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err, lang) });
    } finally {
      setBusy(false);
    }
  }

  function changeLang(l: Lang) {
    if (l === lang) return;
    setLang(l);
    api()
      .updateMe({ lang: l })
      .then((u) => setUser({ ...u, lang: u.lang ?? l }))
      .catch(() => {});
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl sm:text-3xl font-bold">{t("nav.profile")}</h1>
      <form onSubmit={save} className="card p-6 space-y-4">
        <div>
          <div className="text-sm text-gray-500">{t("profile.phone")}</div>
          <div className="font-medium">{formatPhone(user.phone)}</div>
          {user.created_at && <div className="text-xs text-gray-400 mt-0.5">{memberSince(user.created_at, lang)}</div>}
        </div>
        <label className="block">
          <span className="block text-sm font-medium mb-1.5">{t("profile.name")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder={t("profile.namePlaceholder")} />
          <span className="block mt-1 text-xs text-gray-500">{t("profile.nameHint")}</span>
        </label>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
        <button type="submit" className="btn-primary" disabled={busy || name.trim() === user.name}>
          {busy ? t("common.saving") : t("common.save")}
        </button>
      </form>
      <fieldset className="card p-6">
        <legend className="sr-only">{t("lang.label")}</legend>
        <div className="text-sm font-medium mb-1">{t("lang.label")}</div>
        <p className="text-xs text-gray-500 mb-3">{t("profile.langHint")}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("lang.label")}>
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={l.code === lang}
              lang={l.code}
              onClick={() => changeLang(l.code)}
              className={`chip ${l.code === lang ? "border-accent-600 bg-accent-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
            >
              {l.name}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="card p-2 flex flex-col">
        <Link href="/my" className="rounded-xl px-4 py-3 hover:bg-gray-50">{t("nav.my")}</Link>
        <Link href="/chats" className="rounded-xl px-4 py-3 hover:bg-gray-50">{t("nav.chats")}</Link>
        <Link href="/notifications" className="rounded-xl px-4 py-3 hover:bg-gray-50">{t("nav.notifications")}</Link>
        <Link href="/favorites" className="rounded-xl px-4 py-3 hover:bg-gray-50">{t("nav.favorites")}</Link>
        <Link href="/searches" className="rounded-xl px-4 py-3 hover:bg-gray-50">{t("nav.searches")}</Link>
        {(user.role === "moderator" || user.role === "admin") && (
          <Link href="/admin" className="rounded-xl px-4 py-3 hover:bg-gray-50">{t("nav.admin")}</Link>
        )}
        <button
          type="button"
          className="rounded-xl px-4 py-3 text-left text-red-600 hover:bg-red-50"
          onClick={async () => {
            await logout();
            router.push("/");
          }}
        >
          {t("nav.logout")}
        </button>
      </div>
    </div>
  );
}
