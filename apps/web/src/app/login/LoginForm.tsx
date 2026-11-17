"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@kup/shared";
import { api } from "@/lib/client-api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { formatPhone } from "@/lib/format";
import { useI18n } from "@/i18n/client";

/** Country codes for the phone selector; +420 (Czechia) is the default. `len` = national number length for validation. */
const COUNTRIES = [
  { code: "420", iso: "CZ", flag: "🇨🇿", len: [9], example: "777 123 456" },
  { code: "421", iso: "SK", flag: "🇸🇰", len: [9], example: "901 123 456" },
  { code: "380", iso: "UA", flag: "🇺🇦", len: [9], example: "67 123 4567" },
  { code: "48", iso: "PL", flag: "🇵🇱", len: [9], example: "512 345 678" },
  { code: "7", iso: "RU/KZ", flag: "🌐", len: [10], example: "701 123 4567" },
  { code: "375", iso: "BY", flag: "🇧🇾", len: [9], example: "29 123 4567" },
  { code: "373", iso: "MD", flag: "🇲🇩", len: [8], example: "62 123 456" },
  { code: "995", iso: "GE", flag: "🇬🇪", len: [9], example: "555 123 456" },
  { code: "49", iso: "DE", flag: "🇩🇪", len: [10, 11], example: "151 2345 6789" },
] as const;

type Country = (typeof COUNTRIES)[number];

/** E.164 from the selected country + national number. A number typed with "+" (or 00) wins over the selector. */
function normalizePhone(country: Country, input: string): string | null {
  const raw = input.trim();
  if (raw.startsWith("+") || raw.startsWith("00")) {
    const d = raw.replace(/\D/g, "").replace(/^00/, "");
    return d.length >= 10 && d.length <= 15 ? "+" + d : null;
  }
  let d = raw.replace(/\D/g, "");
  if (d.startsWith(country.code) && d.length > Math.max(...country.len)) d = d.slice(country.code.length);
  // trunk prefixes: 0 (UA, DE, …), 8 (+7)
  if (country.code === "7" && d.length === 11 && d.startsWith("8")) d = d.slice(1);
  else if (d.startsWith("0") && d.length === Math.max(...country.len) + 1) d = d.slice(1);
  if (!(country.len as readonly number[]).includes(d.length)) return null;
  return `+${country.code}${d}`;
}

function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { user, setUser } = useAuth();
  const { t, lang } = useI18n();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [phoneInput, setPhoneInput] = useState("");
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
      if (e instanceof ApiError && e.status === 429) setError(t("login.err.tooSoon"));
      else if (e instanceof ApiError && e.status === 400) setError(t("login.err.phone"));
      else setError(errorMessage(e, lang));
    } finally {
      setBusy(false);
    }
  }

  async function onPhone(e: React.FormEvent) {
    e.preventDefault();
    const p = normalizePhone(country, phoneInput);
    if (!p) {
      setError(t("login.err.format", { example: `+${country.code} ${country.example}` }));
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
      if (e instanceof ApiError && e.code === "invalid_code") setError(t("login.err.code"));
      else setError(errorMessage(e, lang));
      setBusy(false);
    }
  }

  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold">{t("login.title")}</h1>
      {step === "phone" ? (
        <form onSubmit={onPhone} className="mt-6 space-y-4" noValidate>
          <p className="text-gray-600 text-sm">{t("login.intro")}</p>
          <div>
            <label htmlFor="login-phone" className="block text-sm font-medium mb-1.5">
              {t("profile.phone")}
            </label>
            <div className="flex gap-2">
              <select
                aria-label={t("login.country")}
                className="input !h-12 !w-auto shrink-0 text-base"
                value={country.code}
                onChange={(e) => setCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? COUNTRIES[0])}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} +{c.code} {c.iso}
                  </option>
                ))}
              </select>
              <input
                id="login-phone"
                className="input !h-12 text-lg min-w-0 flex-1"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value.replace(/[^\d+\s()-]/g, ""))}
                placeholder={country.example}
                autoFocus
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full !h-12 text-base" disabled={busy}>
            {busy ? t("common.sending") : t("login.getCode")}
          </button>
        </form>
      ) : (
        <form onSubmit={onCode} className="mt-6 space-y-4">
          <p className="text-gray-600 text-sm">
            {t("login.codeSent")} <b className="text-gray-900">{formatPhone(phone)}</b>.{" "}
            <button type="button" className="text-accent-600 hover:underline" onClick={() => { setStep("phone"); setError(null); }}>
              {t("login.change")}
            </button>
          </p>
          {devCode && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              {t("login.devCode")}: <b className="tracking-widest">{devCode}</b>
            </div>
          )}
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">{t("login.smsCode")}</span>
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
            {busy ? t("login.checking") : t("header.login")}
          </button>
          <button type="button" className="btn-ghost w-full" disabled={wait > 0 || busy} onClick={() => requestCode(phone)}>
            {wait > 0 ? t("login.resendIn", { s: wait }) : t("login.resend")}
          </button>
        </form>
      )}
    </div>
  );
}
