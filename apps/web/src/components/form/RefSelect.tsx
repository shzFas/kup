"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefItem } from "@kup/shared";
import { loadRefs } from "../filters/refCache";
import { IconChevronDown, IconSearch, IconX } from "../icons";

/** Searchable single-select for a reference list (city, make, model…). */
export function RefSelect({
  id,
  refName,
  parentValue,
  hasParent,
  value,
  onChange,
  placeholder = "Выберите",
  disabledText,
  invalid,
}: {
  id: string;
  refName: string;
  parentValue?: string;
  hasParent: boolean;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  disabledText?: string;
  invalid?: boolean;
}) {
  const disabled = hasParent && !parentValue;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [items, setItems] = useState<RefItem[] | null>(null);
  const [all, setAll] = useState<RefItem[]>([]);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Full list (for the selected name and the initial dropdown).
  useEffect(() => {
    if (disabled) {
      setAll([]);
      return;
    }
    let c = false;
    loadRefs(refName, parentValue ? [parentValue] : [], "")
      .then((r) => !c && setAll(r))
      .catch(() => !c && setError(true));
    return () => {
      c = true;
    };
  }, [refName, parentValue, disabled]);

  useEffect(() => {
    if (!open || disabled) return;
    if (!dq) {
      setItems(all);
      return;
    }
    let c = false;
    loadRefs(refName, parentValue ? [parentValue] : [], dq)
      .then((r) => !c && setItems(r))
      .catch(() => !c && setError(true));
    return () => {
      c = true;
    };
  }, [open, dq, all, refName, parentValue, disabled]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => setActive(0), [items]);

  const selectedName = useMemo(() => all.find((i) => i.id === value)?.name ?? (value ? value : ""), [all, value]);
  const list = items ?? [];

  const pick = (it: RefItem) => {
    onChange(it.id);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={`input flex items-center justify-between text-left ${invalid ? "!border-red-400" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${selectedName ? "text-gray-900" : "text-gray-400"}`}>{disabled ? disabledText ?? placeholder : selectedName || placeholder}</span>
        <span className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Очистить"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
            >
              <IconX size={14} />
            </span>
          )}
          <IconChevronDown size={16} className="text-gray-400" />
        </span>
      </button>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full card shadow-lg p-1.5">
          <div className="relative">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск"
              className="input !h-9 pl-9"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); if (list[active]) pick(list[active]); }
                else if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <ul role="listbox" className="mt-1 max-h-64 overflow-y-auto">
            {items === null && !error && <li className="px-3 py-2 text-sm text-gray-400">Загрузка…</li>}
            {error && <li className="px-3 py-2 text-sm text-red-600">Не удалось загрузить список</li>}
            {items !== null && list.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">Ничего не найдено</li>}
            {list.map((it, i) => (
              <li key={it.id} role="option" aria-selected={it.id === value}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(it)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm ${i === active ? "bg-gray-100" : ""} ${it.id === value ? "font-semibold text-accent-700" : ""}`}
                >
                  {it.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
