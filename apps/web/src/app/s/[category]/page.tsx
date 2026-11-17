import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { CategorySchema, Lang, SearchRequest, SearchResponse } from "@kup/shared";
import { getSchema, isNotFound, serverApi } from "@/lib/server-api";
import { parseSearchState, toSearchRequest, type RawQuery, type SearchState } from "@/lib/search";
import { inCity, listingsCount } from "@/lib/format";
import { SearchView } from "@/components/SearchView";
import { ErrorState } from "@/components/ListingCard";
import { getI18n, getLang } from "@/i18n/server";

type Props = { params: Promise<{ category: string }>; searchParams: Promise<RawQuery> };

const runSearch = cache(async (json: string, lang: Lang): Promise<SearchResponse | null> => {
  try {
    return await serverApi(lang).search(JSON.parse(json) as SearchRequest);
  } catch {
    return null;
  }
});

async function loadSchema(slug: string): Promise<CategorySchema | "not_found" | "error"> {
  try {
    return await getSchema(slug);
  } catch (e) {
    return isNotFound(e) ? "not_found" : "error";
  }
}

/** Names for selected ref values (chips + SEO title). */
const loadRefNames = cache(async (slug: string, filtersJson: string, lang: Lang): Promise<Record<string, string>> => {
  const schema = await getSchema(slug);
  const filters = JSON.parse(filtersJson) as SearchState["filters"];
  const api = serverApi(lang);
  const out: Record<string, string> = {};
  await Promise.all(
    schema.filters
      .filter((d) => d.widget === "ref" && d.ref && filters[d.key] && "in" in filters[d.key])
      .map(async (d) => {
        const f = filters[d.key] as { in: string[] };
        const parent = d.parent && filters[d.parent] && "in" in filters[d.parent] ? (filters[d.parent] as { in: string[] }).in : undefined;
        try {
          const items = await api.refs(d.ref!, { parent });
          for (const it of items) if (f.in.includes(it.id)) out[it.id] = it.name;
        } catch {
          /* names are cosmetic */
        }
      }),
  );
  return out;
});

async function load(props: Props) {
  const [{ category }, query, lang] = await Promise.all([props.params, props.searchParams, getLang()]);
  const schema = await loadSchema(category);
  if (schema === "not_found") notFound();
  if (schema === "error") return { category, schema: null } as const;
  const state = parseSearchState(query, schema);
  const req = toSearchRequest(category, state);
  const [result, refNames] = await Promise.all([runSearch(JSON.stringify(req), lang), loadRefNames(category, JSON.stringify(state.filters), lang)]);
  const saved = typeof query.saved === "string" ? query.saved : undefined;
  return { category, schema, state, result, refNames, saved } as const;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [d, { t, lang }] = await Promise.all([load(props), getI18n()]);
  if (!d.schema) return { title: t("common.search") };
  const { schema, state, result, refNames } = d;
  const refDefs = schema.filters.filter((f) => f.widget === "ref" && f.key !== "city");
  const nameParts: string[] = [];
  for (const def of refDefs) {
    const f = state.filters[def.key];
    if (f && "in" in f && f.in.length <= 2) nameParts.push(f.in.map((id) => refNames[id] ?? id).join(", "));
  }
  const cityF = state.filters.city;
  const cities = cityF && "in" in cityF ? cityF.in : [];
  const rent = schema.category === "apartments" && JSON.stringify(state.filters).includes("rent");
  const verb = t(rent ? "seo.rent" : "seo.buy");
  const where = cities.length === 1 ? inCity({ id: cities[0], name: refNames[cities[0]] ?? cities[0] }, lang) : t("seo.inCountry");
  // "Škoda Octavia — купить в Праге", "Škoda Octavia — prodej Praha"
  const what = nameParts.length ? nameParts.join(" ") : schema.name;
  const extra = `${state.q ? ` · «${state.q}»` : ""}${state.page > 1 ? ` · ${t("seo.page", { n: state.page })}` : ""}`;
  const title = `${what} — ${verb}${where ? " " + where : ""}${extra}`;
  const count = result ? `${listingsCount(result.total, lang)}. ` : "";
  return {
    title,
    description: t("seo.searchDescription", { count, what: nameParts.length ? `${schema.name} ${what}` : what, where }),
  };
}

export default async function SearchPage(props: Props) {
  const d = await load(props);
  if (!d.schema) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ErrorState text={(await getI18n()).t("search.categoryFailed")} />
      </div>
    );
  }
  return <SearchView schema={d.schema} state={d.state} result={d.result} refNames={d.refNames} savedId={d.saved} />;
}
