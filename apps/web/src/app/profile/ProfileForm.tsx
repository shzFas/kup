"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";
import { formatPhone, memberSince } from "@/lib/format";

export function ProfileForm() {
  const { user, setUser, logout } = useAuth();
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
      setMsg({ ok: true, text: "Сохранено" });
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl sm:text-3xl font-bold">Профиль</h1>
      <form onSubmit={save} className="card p-6 space-y-4">
        <div>
          <div className="text-sm text-gray-500">Телефон</div>
          <div className="font-medium">{formatPhone(user.phone)}</div>
          {user.created_at && <div className="text-xs text-gray-400 mt-0.5">{memberSince(user.created_at)}</div>}
        </div>
        <label className="block">
          <span className="block text-sm font-medium mb-1.5">Имя</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="Как к вам обращаться" />
          <span className="block mt-1 text-xs text-gray-500">Имя видят покупатели в ваших объявлениях.</span>
        </label>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
        <button type="submit" className="btn-primary" disabled={busy || name.trim() === user.name}>
          {busy ? "Сохраняем…" : "Сохранить"}
        </button>
      </form>
      <div className="card p-2 flex flex-col">
        <Link href="/my" className="rounded-xl px-4 py-3 hover:bg-gray-50">Мои объявления</Link>
        <Link href="/favorites" className="rounded-xl px-4 py-3 hover:bg-gray-50">Избранное</Link>
        <button
          type="button"
          className="rounded-xl px-4 py-3 text-left text-red-600 hover:bg-red-50"
          onClick={async () => {
            await logout();
            router.push("/");
          }}
        >
          Выйти
        </button>
      </div>
    </div>
  );
}
