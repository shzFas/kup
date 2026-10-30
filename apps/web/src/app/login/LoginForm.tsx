"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@kup/shared";
import { api } from "@/lib/client-api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { formatPhone } from "@/lib/format";

function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d.length >= 10 && d.length <= 15 ? "+" + d : null;
}

function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { user, setUser } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("+7 ");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && step === "phone") router.replace(next);
  }, [user, step, next, router]);

  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [retryAt]);

  async function requestCode(p: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api().requestOtp(p);
      setPhone(p);
      setRetryAt(Date.now() + (r.retry_after_sec ?? 60) * 1000);
      setNow(Date.now());
      setDevCode(r.dev_code ?? null);
      setCode(r.dev_code ?? "");
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) setError("Код уже отправлен. Подождите немного перед повторной отправкой.");
      else if (e instanceof ApiError && e.status === 400) setError("Проверьте номер телефона.");
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onPhone(e: React.FormEvent) {
    e.preventDefault();
    const p = normalizePhone(phoneInput);
    if (!p) {
      setError("Введите номер в формате +7 701 123-45-67");
      return;
    }
    await requestCode(p);
  }

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api().verifyOtp(phone, code.trim());
      setUser(r.user);
      router.replace(!r.user.name && next === "/" ? "/profile" : next);
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_code") setError("Неверный код. Проверьте и попробуйте снова.");
      else setError(errorMessage(e));
      setBusy(false);
    }
  }

  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold">Вход на kup</h1>
      {step === "phone" ? (
        <form onSubmit={onPhone} className="mt-6 space-y-4" noValidate>
          <p className="text-gray-600 text-sm">Введите номер телефона — мы отправим код подтверждения.</p>
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Телефон</span>
            <input
              className="input !h-12 text-lg"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value.replace(/[^\d+\s()-]/g, ""))}
              placeholder="+7 701 123-45-67"
              autoFocus
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full !h-12 text-base" disabled={busy}>
            {busy ? "Отправляем…" : "Получить код"}
          </button>
        </form>
      ) : (
        <form onSubmit={onCode} className="mt-6 space-y-4">
          <p className="text-gray-600 text-sm">
            Код отправлен на <b className="text-gray-900">{formatPhone(phone)}</b>.{" "}
            <button type="button" className="text-accent-600 hover:underline" onClick={() => { setStep("phone"); setError(null); }}>
              Изменить
            </button>
          </p>
          {devCode && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              Код для разработки: <b className="tracking-widest">{devCode}</b>
            </div>
          )}
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Код из SMS</span>
            <input
              ref={codeRef}
              className="input !h-12 text-2xl tracking-[0.5em] text-center"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full !h-12 text-base" disabled={busy || !code}>
            {busy ? "Проверяем…" : "Войти"}
          </button>
          <button type="button" className="btn-ghost w-full" disabled={wait > 0 || busy} onClick={() => requestCode(phone)}>
            {wait > 0 ? `Отправить код повторно через ${wait} с` : "Отправить код повторно"}
          </button>
        </form>
      )}
    </div>
  );
}
