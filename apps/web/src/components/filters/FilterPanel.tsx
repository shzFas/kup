"use client";
import { useState } from "react";
import {
  filterValuesForDeps,
  isDependencyMet,
  pruneFilters,
  type CategorySchema,
  type FilterDef,
  type Filters,
  type FilterValue,
} from "@kup/shared";
import { groupFilters } from "@/lib/search";
import { CheckList, RangeFilter, RefFilter, Segmented, Switch } from "./widgets";
import { IconChevronDown } from "../icons";
import { HintButton } from "../Hint";
import { useI18n } from "@/i18n/client";

export interface FilterPanelProps {
  schema: CategorySchema;
  value: Filters;
  onChange: (next: Filters) => void;
  facets: Record<string, Record<string, number>>;
  onRefNames: (names: Record<string, string>) => void;
  idPrefix?: string;
  openAll?: boolean;
}

export function FilterPanel({ schema, value, onChange, facets, onRefNames, idPrefix = "filter-", openAll = false }: FilterPanelProps) {
  const deps = filterValuesForDeps(value);
  const visibleDefs = schema.filters.filter((d) => isDependencyMet(d.depends_on, deps));
  const { t } = useI18n();
  const groups = groupFilters(schema, visibleDefs, { common: t("filters.common"), other: t("filters.other") });

  const set = (key: string, v: FilterValue | undefined) => {
    const next = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(pruneFilters(next, schema.filters));
  };

  return (
    <div className="divide-y divide-gray-100">
      {groups.map((g, gi) => (
        <FilterGroup key={g.key} label={g.label} defaultOpen={openAll || gi < 3 || g.filters.some((f) => f.key in value)}>
          <div className="space-y-5">
            {g.filters.map((def) => (
              <div key={def.key} id={`${idPrefix}${def.key}`} className="scroll-mt-20">
                {def.widget !== "toggle" && (
                  <div className="relative mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-900">
                    {def.label}
                    {def.hint && <HintButton hint={def.hint} label={def.label} />}
                  </div>
                )}
                <FilterWidget def={def} schema={schema} value={value} facets={facets} set={set} onRefNames={onRefNames} anyLabel={t("common.any")} />
              </div>
            ))}
          </div>
        </FilterGroup>
      ))}
    </div>
  );
}

function FilterGroup({ label, defaultOpen, children }: { label: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="py-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between text-left" aria-expanded={open}>
        <h3 className="text-[15px] font-semibold">{label}</h3>
        <IconChevronDown size={18} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

function FilterWidget({
  def,
  schema,
  value,
  facets,
  set,
  onRefNames,
  anyLabel,
}: {
  def: FilterDef;
  schema: CategorySchema;
  value: Filters;
  facets: Record<string, Record<string, number>>;
  set: (key: string, v: FilterValue | undefined) => void;
  onRefNames: (names: Record<string, string>) => void;
  anyLabel: string;
}) {
  const cur = value[def.key];
  const counts = def.facet ? facets[def.key] : undefined;
  switch (def.widget) {
    case "range":
      return <RangeFilter def={def} value={cur && !("in" in cur) && !("all" in cur) && !("eq" in cur) ? cur : undefined} onChange={(v) => set(def.key, v)} />;
    case "multi": {
      const sel = cur && "in" in cur ? cur.in : [];
      return <CheckList options={def.options ?? []} selected={sel} counts={counts} onChange={(n) => set(def.key, n.length ? { in: n } : undefined)} />;
    }
    case "multi_all": {
      const sel = cur && "all" in cur ? cur.all : [];
      return <CheckList options={def.options ?? []} selected={sel} counts={counts} onChange={(n) => set(def.key, n.length ? { all: n } : undefined)} />;
    }
    case "toggle": {
      const on = !!cur && "eq" in cur && cur.eq === true;
      return <Switch label={def.label} hint={def.hint} checked={on} onChange={(v) => set(def.key, v ? { eq: true } : undefined)} />;
    }
    case "select": {
      const v = cur && "eq" in cur && typeof cur.eq === "string" ? cur.eq : undefined;
      return <Segmented options={def.options ?? []} value={v} anyLabel={anyLabel} onChange={(n) => set(def.key, n ? { eq: n } : undefined)} />;
    }
    case "ref": {
      const sel = cur && "in" in cur ? cur.in : [];
      let parentValues: string[] | null = null;
      let parentLabel: string | undefined;
      if (def.parent) {
        const p = value[def.parent];
        parentValues = p && "in" in p ? p.in : [];
        parentLabel = schema.filters.find((f) => f.key === def.parent)?.label.toLowerCase();
      }
      return (
        <RefFilter
          def={def}
          selected={sel}
          parentValues={parentValues}
          parentLabel={parentLabel}
          counts={counts}
          onChange={(ids, names) => {
            onRefNames(names);
            set(def.key, ids.length ? { in: ids } : undefined);
          }}
        />
      );
    }
    default:
      return null;
  }
}
