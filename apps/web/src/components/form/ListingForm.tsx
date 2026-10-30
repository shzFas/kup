"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  visibleFormAttributes,
  type Attribute,
  type AttrValue,
  type Category,
  type CategorySchema,
  type Listing,
  type ListingInput,
} from "@kup/shared";
import { api } from "@/lib/client-api";
import { fmtNum as formatNumber } from "@/lib/num";
import { errorMessage } from "@/lib/errors";
import { CategoryIcon } from "../icons";
import { Segmented, Switch } from "../filters/widgets";
import { RefSelect } from "./RefSelect";
import { PhotoUploader, type PhotoItem } from "./PhotoUploader";

type Values = Record<string, AttrValue | undefined>;

/** Photo id from a /media/photos/<id>.<ext> URL (Listing returns URLs only). */
export function photoIdFromUrl(url: string): string {
  const base = url.split("?")[0].split("/").pop() ?? url;
  return base.replace(/\.[a-z0-9]+$/i, "").replace(/_t$/, "");
}

function digitsOnly(s: string) {
  return s.replace(/\D/g, "");
}

function parseNumber(v: AttrValue | undefined, decimal: boolean): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return v;
  const t = String(v).replace(/[\s  ]/g, "").replace(",", ".");
  if (t === "") return undefined;
  const n = decimal ? Number(t) : Number(t);
  if (!Number.isFinite(n)) return NaN;
  return decimal ? n : Math.trunc(n);
}

export function ListingForm({ categories, listing, initialCategory }: { categories: Category[]; listing?: Listing; initialCategory?: string }) {
  const router = useRouter();
  const editing = !!listing;
  const [category, setCategory] = useState<string | null>(listing?.category ?? (categories.some((c) => c.slug === initialCategory) ? initialCategory! : null));
  const [schema, setSchema] = useState<CategorySchema | null>(null);
  const [schemaError, setSchemaError] = useState(false);
  const [values, setValues] = useState<Values>({});
  const [price, setPrice] = useState(listing ? formatNumber(listing.price) : "");
  const [city, setCity] = useState<string | undefined>(listing?.city?.id);
  const [description, setDescription] = useState(listing?.description ?? "");
  const [photos, setPhotos] = useState<PhotoItem[]>(
    () => {
      if (!listing) return [];
      // Backend may expose photo_ids (not in docs/API.md); otherwise derive ids from /media/photos/<id>.jpg.
      const ids = (listing as Listing & { photo_ids?: string[] }).photo_ids;
      return listing.photos.map((url, i) => ({ key: `existing-${i}`, id: ids?.[i] ?? photoIdFromUrl(url), url }));
    },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!category) return;
    let c = false;
    setSchema(null);
    setSchemaError(false);
    api()
      .schema(category)
      .then((s) => {
        if (c) return;
        setSchema(s);
        if (listing && listing.category === category) {
          const v: Values = {};
          for (const a of s.attributes) {
            if (a.computed) continue;
            const x = listing.attributes[a.key];
            if (x == null) continue;
            v[a.key] = (a.type === "int" || a.type === "decimal") && typeof x === "number" ? formatNumber(x) : x;
          }
          setValues(v);
        } else {
          setValues({});
        }
      })
      .catch(() => !c && setSchemaError(true));
    return () => {
      c = true;
    };
  }, [category, listing]);

  const visible = useMemo(() => (schema ? visibleFormAttributes(schema.attributes, values) : []), [schema, values]);

  const groups = useMemo(() => {
    if (!schema) return [];
    const gs = schema.groups.map((g) => ({ ...g, attrs: [] as Attribute[] }));
    const other = { key: "_other", label: "Прочее", attrs: [] as Attribute[] };
    for (const a of visible) (gs.find((g) => g.key === a.group) ?? other).attrs.push(a);
    return [...gs, other]
      .filter((g) => g.attrs.length)
      .map((g) => ({ ...g, attrs: [...g.attrs.filter((a) => a.required), ...g.attrs.filter((a) => !a.required)] }));
  }, [schema, visible]);

  function setValue(key: string, v: AttrValue | undefined) {
    setValues((prev) => {
      const next = { ...prev, [key]: v };
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete next[key];
      // Reset children (model when make changes), recursively.
      if (schema) {
        const queue = [key];
        while (queue.length) {
          const k = queue.shift()!;
          for (const a of schema.attributes) {
            if (a.parent === k && a.key in next) {
              delete next[a.key];
              queue.push(a.key);
            }
          }
        }
      }
      return next;
    });
    setErrors((e) => {
      if (!e[`attributes.${key}`]) return e;
      const n = { ...e };
      delete n[`attributes.${key}`];
      return n;
    });
  }

  function buildAttributes(errs: Record<string, string>): Record<string, AttrValue> {
    const out: Record<string, AttrValue> = {};
    for (const a of visible) {
      const v = values[a.key];
      const ek = `attributes.${a.key}`;
      switch (a.type) {
        case "int":
        case "decimal": {
          const n = parseNumber(v, a.type === "decimal");
          if (n === undefined) break;
          if (Number.isNaN(n)) { errs[ek] = "Введите число"; break; }
          if (a.min != null && n < a.min) { errs[ek] = `Не меньше ${formatNumber(a.min)}`; break; }
          if (a.max != null && n > a.max) { errs[ek] = `Не больше ${formatNumber(a.max)}`; break; }
          out[a.key] = n;
          break;
        }
        case "bool":
          out[a.key] = v === true;
          break;
        case "multi_enum":
          if (Array.isArray(v) && v.length) out[a.key] = v;
          break;
        case "text":
          if (typeof v === "string" && v.trim()) out[a.key] = v.trim();
          break;
        default:
          if (typeof v === "string" && v) out[a.key] = v;
      }
      if (a.required && a.type !== "bool" && !(a.key in out) && !errs[ek]) errs[ek] = "Обязательное поле";
    }
    return out;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!schema || !category) return;
    setFormError(null);
    const errs: Record<string, string> = {};
    const attributes = buildAttributes(errs);
    const priceNum = Number(digitsOnly(price));
    if (!digitsOnly(price)) errs.price = "Укажите цену";
    if (!city) errs.city = "Выберите город";
    if (photos.some((p) => p.uploading)) errs.photos = "Дождитесь окончания загрузки фото";
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError("Проверьте выделенные поля");
      scrollToFirstError(errs);
      return;
    }
    const input: ListingInput = {
      category,
      price: priceNum,
      currency: "KZT",
      city: city!,
      description: description.trim(),
      photos: photos.filter((p) => p.id && !p.error).map((p) => p.id!),
      attributes,
    };
    setSubmitting(true);
    try {
      let saved: Listing;
      if (listing) {
        const { category: _omit, ...patch } = input;
        void _omit;
        saved = await api().updateListing(listing.id, patch);
      } else {
        saved = await api().createListing(input);
      }
      router.push(`/l/${saved.id}`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields);
        setFormError(err.message || "Проверьте выделенные поля");
        scrollToFirstError(err.fields);
      } else {
        setFormError(errorMessage(err));
      }
    }
  }

  /* ---------- step 1: category ---------- */
  if (!category) {
    return (
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Новое объявление</h1>
        <p className="mt-1 text-gray-600">Шаг 1 — выберите категорию</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {categories.map((c) => (
            <button key={c.slug} type="button" onClick={() => setCategory(c.slug)} className="card p-5 flex flex-col items-start gap-3 hover:border-accent-300 hover:shadow-md transition text-left">
              <span className="w-12 h-12 rounded-2xl bg-accent-50 text-accent-600 flex items-center justify-center"><CategoryIcon icon={c.icon} /></span>
              <span className="font-semibold">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const catName = categories.find((c) => c.slug === category)?.name ?? schema?.name ?? "";

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{editing ? "Редактирование" : "Новое объявление"}</h1>
          <p className="mt-1 text-gray-600">
            Категория: <b className="text-gray-900">{catName}</b>
            {!editing && (
              <button type="button" className="ml-2 text-accent-600 hover:underline text-sm" onClick={() => { setCategory(null); setErrors({}); }}>
                изменить
              </button>
            )}
          </p>
        </div>
      </div>

      {schemaError && <div className="mt-6 card p-6 text-red-700">Не удалось загрузить форму. Обновите страницу.</div>}
      {!schema && !schemaError && (
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      )}

      {schema && (
        <div className="mt-6 space-y-5">
          {groups.map((g) => (
            <Section key={g.key} title={g.label}>
              <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
                {g.attrs.map((a) => (
                  <AttrField
                    key={a.key}
                    attr={a}
                    value={values[a.key]}
                    parentValue={a.parent ? (values[a.parent] as string | undefined) : undefined}
                    parentLabel={a.parent ? schema.attributes.find((x) => x.key === a.parent)?.label : undefined}
                    error={errors[`attributes.${a.key}`]}
                    onChange={(v) => setValue(a.key, v)}
                  />
                ))}
              </div>
            </Section>
          ))}

          <Section title="Фотографии">
            <div id="field-photos">
              <PhotoUploader photos={photos} onChange={(fn) => setPhotos(fn)} error={errors.photos} />
            </div>
          </Section>

          <Section title="Цена и место">
            <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Цена" required error={errors.price} htmlFor="field-price">
                <div className="relative">
                  <input
                    id="field-price"
                    className={`input pr-10 ${errors.price ? "!border-red-400" : ""}`}
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => {
                      const d = digitsOnly(e.target.value).slice(0, 13);
                      setPrice(d ? formatNumber(Number(d)) : "");
                      setErrors((x) => ({ ...x, price: "" }));
                    }}
                    placeholder="0"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">₸</span>
                </div>
              </Field>
              <Field label="Город" required error={errors.city} htmlFor="field-city">
                <RefSelect
                  id="field-city"
                  refName="city"
                  hasParent={false}
                  value={city}
                  onChange={(v) => {
                    setCity(v);
                    setErrors((x) => ({ ...x, city: "" }));
                  }}
                  placeholder="Выберите город"
                  invalid={!!errors.city}
                />
              </Field>
            </div>
          </Section>

          <Section title="Описание">
            <Field label="" error={errors.description} htmlFor="field-description">
              <textarea
                id="field-description"
                className={`input !h-auto min-h-36 py-2.5 leading-relaxed ${errors.description ? "!border-red-400" : ""}`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                placeholder="Расскажите о состоянии, истории обслуживания, особенностях…"
              />
              <div className="mt-1 text-right text-xs text-gray-400">{description.length} / 5000</div>
            </Field>
          </Section>

          {formError && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{formError}</div>}

          <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-[#f6f7f9]/95 backdrop-blur sm:static sm:mx-0 sm:px-0 sm:bg-transparent flex gap-3">
            <button type="submit" className="btn-primary !h-12 flex-1 sm:flex-none sm:px-8 text-base" disabled={submitting}>
              {submitting ? "Сохраняем…" : editing ? "Сохранить изменения" : "Опубликовать"}
            </button>
            {editing && (
              <button type="button" className="btn-secondary !h-12" onClick={() => router.back()}>
                Отмена
              </button>
            )}
          </div>
        </div>
      )}
    </form>
  );
}

function scrollToFirstError(errs: Record<string, string>) {
  const key = Object.keys(errs).find((k) => errs[k]);
  if (!key) return;
  const id = key.startsWith("attributes.") ? `attr-${key.slice(11)}` : `field-${key}`;
  setTimeout(() => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement || el instanceof HTMLSelectElement) el.focus({ preventScroll: true });
  }, 0);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, required, error, htmlFor, children, wide }: { label: string; required?: boolean; error?: string; htmlFor?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium mb-1.5">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function AttrField({
  attr: a,
  value,
  parentValue,
  parentLabel,
  error,
  onChange,
}: {
  attr: Attribute;
  value: AttrValue | undefined;
  parentValue?: string;
  parentLabel?: string;
  error?: string;
  onChange: (v: AttrValue | undefined) => void;
}) {
  const id = `attr-${a.key}`;
  const bad = error ? "!border-red-400" : "";
  switch (a.type) {
    case "ref":
      return (
        <Field label={a.label} required={a.required} error={error} htmlFor={id}>
          <RefSelect
            id={id}
            refName={a.ref ?? ""}
            hasParent={!!a.parent}
            parentValue={parentValue}
            value={typeof value === "string" ? value : undefined}
            onChange={onChange}
            disabledText={parentLabel ? `Сначала выберите: ${parentLabel.toLowerCase()}` : undefined}
            invalid={!!error}
          />
        </Field>
      );
    case "enum": {
      const opts = a.options ?? [];
      const v = typeof value === "string" ? value : undefined;
      if (opts.length <= 5) {
        return (
          <Field label={a.label} required={a.required} error={error} wide={opts.length > 3}>
            <div id={id}>
              <Segmented options={opts} value={v} onChange={(x) => onChange(x === v ? undefined : x)} />
            </div>
          </Field>
        );
      }
      return (
        <Field label={a.label} required={a.required} error={error} htmlFor={id}>
          <select id={id} className={`input ${bad} ${v ? "" : "text-gray-400"}`} value={v ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">Не выбрано</option>
            {opts.map((o) => (
              <option key={o.value} value={o.value} className="text-gray-900">{o.label}</option>
            ))}
          </select>
        </Field>
      );
    }
    case "multi_enum": {
      const sel = Array.isArray(value) ? value : [];
      return (
        <Field label={a.label} required={a.required} error={error} wide>
          <div id={id} className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
            {(a.options ?? []).map((o) => (
              <label key={o.value} className="flex items-center gap-2.5 py-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-accent-600"
                  checked={sel.includes(o.value)}
                  onChange={() => onChange(sel.includes(o.value) ? sel.filter((x) => x !== o.value) : [...sel, o.value])}
                />
                {o.label}
              </label>
            ))}
          </div>
        </Field>
      );
    }
    case "bool":
      return (
        <Field label="" error={error}>
          <div id={id} className="sm:pt-6">
            <Switch label={a.label} checked={value === true} onChange={(x) => onChange(x)} />
          </div>
        </Field>
      );
    case "int":
    case "decimal": {
      const hint = [a.min != null ? `от ${formatNumber(a.min)}` : null, a.max != null ? `до ${formatNumber(a.max)}` : null].filter(Boolean).join(" ");
      return (
        <Field label={a.label + (a.unit ? `, ${a.unit}` : "")} required={a.required} error={error} htmlFor={id}>
          <div className="relative">
            <input
              id={id}
              className={`input ${a.unit ? "pr-12" : ""} ${bad}`}
              inputMode={a.type === "decimal" ? "decimal" : "numeric"}
              value={value == null ? "" : String(value)}
              placeholder={hint}
              onChange={(e) => {
                const raw = e.target.value.replace(a.type === "decimal" ? /[^\d.,\s]/g : /[^\d\s]/g, "");
                onChange(raw === "" ? undefined : raw);
              }}
              onBlur={() => {
                const n = parseNumber(value, a.type === "decimal");
                if (n != null && !Number.isNaN(n)) onChange(formatNumber(n));
              }}
            />
            {a.unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{a.unit}</span>}
          </div>
        </Field>
      );
    }
    default:
      return (
        <Field label={a.label} required={a.required} error={error} htmlFor={id}>
          <input id={id} className={`input ${bad}`} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} maxLength={200} />
        </Field>
      );
  }
}
