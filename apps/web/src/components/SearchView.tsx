"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  filterValuesForDeps,
  isDependencyMet,
  pruneFilters,
  type CategorySchema,
  type FilterDef,
  type Filters,
  type SearchResponse,
} from "@kup/shared";
import { api } from "@/lib/client-api";
import { chipLabel } from "@/lib/num";
import { listingsCount, plural } from "@/lib/format";
import { PAGE_SIZE, searchHref, toSearchRequest, withoutFilter, type SearchState } from "@/lib/search";
import { FilterPanel } from "./filters/FilterPanel";
import { CardSkeleton, EmptyState, ListingCardView } from "./ListingCard";
import { IconFilter, IconGrid, IconList, IconX, IconChevronLeft, IconChevronRight } from "./icons";

interface Props {
  schema: CategorySchema;
  state: SearchState;
  result: SearchResponse | null;
  refNames: Record<string, string>;
}

const LAYOUT_KEY = "kup.layout";

export function SearchView({ schema, state, result, refNames: initialNames }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [names, setNames] = useState(initialNames);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  // Optimistic copy of filters so the sidebar reacts instantly while the server renders.
  const [optimistic, setOptimistic] = useState<Filters>(state.filters);
  useEffect(() => setOptimistic(state.filters), [state.filters]);
  useEffect(() => setNames((n) => ({ ...n, ...initialNames })), [initialNames]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAYOUT_KEY);
      if (v === "list" || v === "grid") setLayout(v);
    } catch {}
  }, []);
  const changeLayout = (l: "grid" | "list") => {
    setLayout(l);
    try { localStorage.setItem(LAYOUT_KEY, l); } catch {}
  };

  const addNames = useCallback((n: Record<string, string>) => {
    if (Object.keys(n).length) setNames((prev) => ({ ...prev, ...n }));
  }, []);

  const navigate = useCallback(
    (next: Partial<SearchState>) => {
      const s = { ...state, page: 1, ...next };
      if (next.filters) setOptimistic(next.filters);
      startTransition(() => router.push(searchHref(schema.category, s), { scroll: false }));
    },
    [state, schema.category, router],
  );

  const applyFilters = (f: Filters) => navigate({ filters: pruneFilters(f, schema.filters) });

  const total = result?.total ?? 0;
  const facets = result?.facets ?? {};
  const items = result?.items ?? [];
  const pages = Math.max(1, Math.ceil(total / (result?.limit || PAGE_SIZE)));
  const sortValue = state.sort || schema.sorts[0]?.value || "";

  const chips = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    for (const def of schema.filters) {
      const f = optimistic[def.key];
      if (f) list.push({ key: def.key, label: chipLabel(def, f, names) });
    }
    return list;
  }, [schema.filters, optimistic, names]);

  const hasAnything = chips.length > 0 || !!state.q;

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:py-6">
      <nav className="text-sm text-gray-500 mb-2" aria-label="Хлебные крошки">
        <Link href="/" className="hover:text-accent-600">Главная</Link>
        <span className="mx-1.5">/</span>
        <span className="text-gray-700">{schema.name}</span>
      </nav>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold">{state.q ? `«${state.q}» — ${schema.name.toLowerCase()}` : schema.name}</h1>
        {result && <span className="text-gray-500">{listingsCount(total)}</span>}
      </div>

      {/* Mobile: filter button + pinned quick filters */}
      <div className="lg:hidden mt-4 -mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar">
        <button type="button" onClick={() => setSheetOpen(true)} className="chip shrink-0 border-gray-900 bg-gray-900 text-white">
          <IconFilter size={16} /> Фильтры{chips.length ? ` · ${chips.length}` : ""}
        </button>
        {schema.filters
          .filter((d) => d.pinned && isDependencyMet(d.depends_on, filterValuesForDeps(optimistic)))
          .map((d) => (
            <PinnedChip
              key={d.key}
              def={d}
              active={d.key in optimistic}
              label={optimistic[d.key] ? chipLabel(d, optimistic[d.key], names) : d.label}
              onToggle={() =>
                applyFilters(d.key in optimistic ? withoutFilter(optimistic, d.key, schema.filters) : { ...optimistic, [d.key]: { eq: true } })
              }
              onOpen={() => {
                setSheetOpen(true);
                setTimeout(() => document.getElementById(`sheet-filter-${d.key}`)?.scrollIntoView({ block: "start" }), 50);
              }}
            />
          ))}
      </div>

      <div className="mt-4 lg:mt-6 flex gap-6 items-start">
        <aside className="hidden lg:block w-80 shrink-0 card px-5 py-1 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <FilterPanel schema={schema} value={optimistic} onChange={applyFilters} facets={facets} onRefNames={addNames} />
          {hasAnything && (
            <div className="sticky bottom-0 bg-white py-3 border-t border-gray-100">
              <button type="button" className="btn-secondary w-full" onClick={() => navigate({ filters: {}, q: "" })}>
                Сбросить всё
              </button>
            </div>
          )}
        </aside>

        <section className="flex-1 min-w-0" aria-label="Результаты">
          {hasAnything && (
            <div className="flex flex-wrap gap-2 mb-3">
              {state.q && (
                <ActiveChip label={`«${state.q}»`} onRemove={() => navigate({ q: "" })} />
              )}
              {chips.map((c) => (
                <ActiveChip key={c.key} label={c.label} onRemove={() => applyFilters(withoutFilter(optimistic, c.key, schema.filters))} />
              ))}
              <button type="button" onClick={() => navigate({ filters: {}, q: "" })} className="chip border-transparent text-accent-600 hover:bg-accent-50">
                Сбросить всё
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-gray-500 hidden sm:inline">Сортировка:</span>
              <select
                value={sortValue}
                onChange={(e) => navigate({ sort: e.target.value === schema.sorts[0]?.value ? "" : e.target.value })}
                className="input !h-9 !w-auto max-w-[14rem] pr-8"
                aria-label="Сортировка"
              >
                {schema.sorts.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-1 shrink-0" role="group" aria-label="Вид">
              <button type="button" onClick={() => changeLayout("grid")} aria-pressed={layout === "grid"} aria-label="Плиткой" className={`p-2 rounded-lg ${layout === "grid" ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:bg-gray-100"}`}>
                <IconGrid size={18} />
              </button>
              <button type="button" onClick={() => changeLayout("list")} aria-pressed={layout === "list"} aria-label="Списком" className={`p-2 rounded-lg ${layout === "list" ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:bg-gray-100"}`}>
                <IconList size={18} />
              </button>
            </div>
          </div>

          {result === null ? (
            <div className="card px-6 py-10 text-center">
              <div className="text-lg font-semibold text-red-700">Не удалось загрузить объявления</div>
              <p className="mt-1 text-gray-600">Сервер недоступен или фильтр некорректен.</p>
              <button className="btn-secondary mt-4" onClick={() => router.refresh()}>Повторить</button>
            </div>
          ) : pending ? (
            <Results layout={layout}>{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} layout={layout} />)}</Results>
          ) : items.length === 0 ? (
            <EmptyState
              title="Ничего не найдено"
              text="Ничего не найдено — попробуйте убрать часть фильтров"
              action={hasAnything ? <button className="btn-secondary" onClick={() => navigate({ filters: {}, q: "" })}>Сбросить фильтры</button> : undefined}
            />
          ) : (
            <Results layout={layout}>
              {items.map((it, i) => <ListingCardView key={it.id} item={it} layout={layout} eager={i < 3} />)}
            </Results>
          )}

          {result && pages > 1 && !pending && <Pagination category={schema.category} state={state} pages={pages} />}
        </section>
      </div>

      {sheetOpen && (
        <FilterSheet
          schema={schema}
          state={state}
          initial={optimistic}
          facets={facets}
          appliedTotal={total}
          onRefNames={addNames}
          onClose={() => setSheetOpen(false)}
          onApply={(f) => {
            setSheetOpen(false);
            applyFilters(f);
          }}
        />
      )}
    </div>
  );
}

function Results({ layout, children }: { layout: "grid" | "list"; children: React.ReactNode }) {
  return <div className={layout === "grid" ? "grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4" : "flex flex-col gap-3"}>{children}</div>;
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="chip border-accent-200 bg-accent-50 text-accent-700 !pr-1 max-w-full">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onRemove} className="p-1 rounded-full hover:bg-accent-100" aria-label={`Убрать фильтр: ${label}`}>
        <IconX size={14} />
      </button>
    </span>
  );
}

function PinnedChip({ def, active, label, onToggle, onOpen }: { def: FilterDef; active: boolean; label: string; onToggle: () => void; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={def.widget === "toggle" ? onToggle : onOpen}
      className={`chip shrink-0 ${active ? "border-accent-500 bg-accent-50 text-accent-700" : "border-gray-200 bg-white text-gray-800"}`}
    >
      <span className="max-w-[12rem] truncate">{label}</span>
    </button>
  );
}

function Pagination({ category, state, pages }: { category: string; state: SearchState; pages: number }) {
  const cur = Math.min(state.page, pages);
  const nums: (number | "…")[] = [];
  const add = (n: number) => nums.push(n);
  const from = Math.max(2, cur - 2);
  const to = Math.min(pages - 1, cur + 2);
  add(1);
  if (from > 2) nums.push("…");
  for (let i = from; i <= to; i++) add(i);
  if (to < pages - 1) nums.push("…");
  if (pages > 1) add(pages);
  const href = (p: number) => searchHref(category, { ...state, page: p });
  const cls = "min-w-10 h-10 px-2 inline-flex items-center justify-center rounded-xl text-sm";
  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1" aria-label="Страницы">
      {cur > 1 && <Link href={href(cur - 1)} className={`${cls} hover:bg-gray-200`} aria-label="Предыдущая"><IconChevronLeft size={18} /></Link>}
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className={`${cls} text-gray-400`}>…</span>
        ) : (
          <Link key={n} href={href(n)} aria-current={n === cur ? "page" : undefined} className={`${cls} ${n === cur ? "bg-accent-600 text-white" : "hover:bg-gray-200"}`}>
            {n}
          </Link>
        ),
      )}
      {cur < pages && <Link href={href(cur + 1)} className={`${cls} hover:bg-gray-200`} aria-label="Следующая"><IconChevronRight size={18} /></Link>}
    </nav>
  );
}

function FilterSheet({
  schema,
  state,
  initial,
  facets,
  appliedTotal,
  onRefNames,
  onClose,
  onApply,
}: {
  schema: CategorySchema;
  state: SearchState;
  initial: Filters;
  facets: Record<string, Record<string, number>>;
  appliedTotal: number;
  onRefNames: (n: Record<string, string>) => void;
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const [draft, setDraft] = useState<Filters>(initial);
  const [count, setCount] = useState<number | null>(appliedTotal);
  const [counting, setCounting] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setCounting(true);
    let cancelled = false;
    const t = setTimeout(() => {
      api()
        .count(toSearchRequest(schema.category, { ...state, filters: draft, page: 1 }))
        .then((n) => !cancelled && setCount(n))
        .catch(() => !cancelled && setCount(null))
        .finally(() => !cancelled && setCounting(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft, schema.category, state]);

  const label =
    count == null
      ? "Показать объявления"
      : count === 0
        ? "Ничего не найдено"
        : `Показать ${count.toLocaleString("ru-RU").replace(/ /g, " ")} ${plural(count, "объявление", "объявления", "объявлений")}`;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col lg:hidden" role="dialog" aria-modal="true" aria-label="Фильтры">
      <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-gray-100">
        <button type="button" onClick={onClose} className="p-2 -ml-2" aria-label="Закрыть"><IconX size={22} /></button>
        <span className="font-semibold">Фильтры</span>
        <button type="button" onClick={() => setDraft({})} className="text-sm text-accent-600 disabled:text-gray-300" disabled={Object.keys(draft).length === 0}>
          Сбросить
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <FilterPanel openAll idPrefix="sheet-filter-" schema={schema} value={draft} onChange={(f) => setDraft(pruneFilters(f, schema.filters))} facets={facets} onRefNames={onRefNames} />
      </div>
      <div className="shrink-0 border-t border-gray-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white">
        <button type="button" className="btn-primary w-full !h-12 text-base" onClick={() => onApply(draft)} disabled={counting && count === null}>
          {counting ? <span className="inline-block w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" /> : null}
          {label}
        </button>
      </div>
    </div>
  );
}
