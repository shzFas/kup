"use client";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Category, Suggestion } from "@kup/shared";
import { api } from "@/lib/client-api";
import { searchHref } from "@/lib/search";
import { useI18n } from "@/i18n/client";
import { CategoryIcon, IconLayout, IconPin, IconSearch, IconTag } from "./icons";

const fold = (c: string) => c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Splits `label` into parts, marking the ones matching words of `q` (case/diacritics-insensitive: "skoda" ↔ "Škoda"). */
export function highlight(label: string, q: string): { text: string; hit: boolean }[] {
  const chars = Array.from(label);
  // fold char by char so indexes map 1:1 back to the label
  const folded = chars.map((c) => fold(c).slice(0, 1) || c);
  const hay = folded.join("");
  const mark = new Array(chars.length).fill(false);
  for (const w of q.split(/\s+/).map(fold).filter(Boolean)) {
    let from = 0;
    while (from <= hay.length) {
      const i = hay.indexOf(w, from);
      if (i < 0) break;
      // only highlight from a word start
      if (i === 0 || /[\s\-(/,.]/.test(hay[i - 1])) {
        for (let k = i; k < i + w.length && k < mark.length; k++) mark[k] = true;
        break;
      }
      from = i + 1;
    }
  }
  const out: { text: string; hit: boolean }[] = [];
  chars.forEach((c, i) => {
    const last = out[out.length - 1];
    if (last && last.hit === mark[i]) last.text += c;
    else out.push({ text: c, hit: mark[i] });
  });
  return out;
}

function SuggestionIcon({ s, categories }: { s: Suggestion; categories: Category[] }) {
  switch (s.type) {
    case "category":
      return <CategoryIcon icon={categories.find((c) => c.slug === s.category)?.icon ?? ""} size={18} />;
    case "city":
      return <IconPin size={18} />;
    case "layout":
      return <IconLayout size={18} />;
    default:
      return <IconTag size={18} />;
  }
}

export function SearchBox({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { t, lang } = useI18n();
  const listId = useId();
  const current = pathname.startsWith("/s/") ? pathname.split("/")[2] : "";
  const [category, setCategory] = useState(current || categories[0]?.slug || "cars");
  const [q, setQ] = useState(current ? params.get("q") ?? "" : "");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typed, setTyped] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (current) {
      setCategory(current);
      setQ(params.get("q") ?? "");
    }
    setOpen(false);
    setTyped(false);
  }, [current, params]);

  // Debounced suggestions — only while the user is typing (not when the value came from the URL).
  useEffect(() => {
    const query = q.trim();
    if (!typed || query.length < 2) {
      setItems([]);
      setActive(-1);
      return;
    }
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      api()
        .suggest(query, 8)
        .then((r) => {
          if (id !== reqId.current) return;
          setItems(r);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => id === reqId.current && setItems([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [q, typed, lang]);

  function go(s: Suggestion) {
    setOpen(false);
    setTyped(false);
    setQ("");
    router.push(searchHref(s.category, { filters: s.filters }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (open && active >= 0 && items[active]) {
      go(items[active]);
      return;
    }
    setOpen(false);
    setTyped(false);
    const sp = new URLSearchParams(category === current ? params.toString() : "");
    sp.delete("page");
    sp.delete("saved");
    if (q.trim()) sp.set("q", q.trim());
    else sp.delete("q");
    const qs = sp.toString().replace(/%2C/gi, ",");
    router.push(`/s/${category}${qs ? "?" + qs : ""}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  const showList = open && items.length > 0;

  return (
    <div className="relative">
      <form
        onSubmit={submit}
        role="search"
        className="flex h-10 rounded-xl border border-gray-200 bg-gray-50 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-100 focus-within:bg-white overflow-hidden"
      >
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label={t("search.category")}
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
          onChange={(e) => {
            setQ(e.target.value);
            setTyped(true);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={t("search.placeholder")}
          aria-label={t("common.search")}
          className="flex-1 min-w-0 bg-transparent px-3 text-sm outline-none"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        />
        <button type="submit" className="px-3 text-gray-500 hover:text-accent-600" aria-label={t("search.submit")}>
          <IconSearch size={18} />
        </button>
      </form>
      {showList && (
        <ul id={listId} role="listbox" aria-label={t("search.suggestions")} className="absolute left-0 right-0 mt-1 z-40 card shadow-lg p-1.5 max-h-[70vh] overflow-y-auto">
          {items.map((s, i) => (
            <li
              key={`${s.type}-${s.category}-${s.label}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (not click) so the input's blur doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                go(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer ${i === active ? "bg-gray-100" : ""}`}
            >
              <span className="w-8 h-8 shrink-0 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center">
                <SuggestionIcon s={s} categories={categories} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm truncate">
                  {highlight(s.label, q).map((p, k) =>
                    p.hit ? (
                      <mark key={k} className="bg-transparent font-semibold text-gray-900">
                        {p.text}
                      </mark>
                    ) : (
                      <span key={k} className="text-gray-700">
                        {p.text}
                      </span>
                    ),
                  )}
                </span>
                {s.sublabel && <span className="block text-xs text-gray-400 truncate">{s.sublabel}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
