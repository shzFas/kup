import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { CategorySchema, SearchRequest, SearchResponse } from "@kup/shared";
import { getSchema, isNotFound, serverApi } from "@/lib/server-api";
import { parseSearchState, toSearchRequest, type RawQuery, type SearchState } from "@/lib/search";
import { inCity, listingsCount } from "@/lib/format";
import { SearchView } from "@/components/SearchView";
import { ErrorState } from "@/components/ListingCard";

type Props = { params: Promise<{ category: string }>; searchParams: Promise<RawQuery> };

const runSearch = cache(async (json: string): Promise<SearchResponse | null> => {
  try {
    return await serverApi().search(JSON.parse(json) as SearchRequest);
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
const loadRefNames = cache(async (slug: string, filtersJson: string): Promise<Record<string, string>> => {
  const schema = await getSchema(slug);
  const filters = JSON.parse(filtersJson) as SearchState["filters"];
  const api = serverApi();
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
  const [{ category }, query] = await Promise.all([props.params, props.searchParams]);
  const schema = await loadSchema(category);
  if (schema === "not_found") notFound();
  if (schema === "error") return { category, schema: null } as const;
  const state = parseSearchState(query, schema);
  const req = toSearchRequest(category, state);
  const [result, refNames] = await Promise.all([runSearch(JSON.stringify(req)), loadRefNames(category, JSON.stringify(state.filters))]);
  return { category, schema, state, result, refNames } as const;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const d = await load(props);
  if (!d.schema) return { title: "Поиск" };
  const { schema, state, result, refNames } = d;
  const refDefs = schema.filters.filter((f) => f.widget === "ref" && f.key !== "city");
  const nameParts: string[] = [];
  for (const def of refDefs) {
    const f = state.filters[def.key];
    if (f && "in" in f && f.in.length <= 2) nameParts.push(f.in.map((id) => refNames[id] ?? id).join(", "));
  }
  const cityF = state.filters.city;
  const cities = cityF && "in" in cityF ? cityF.in.map((id) => refNames[id] ?? id) : [];
  const verb = schema.category === "apartments" && JSON.stringify(state.filters).includes("rent") ? "снять" : "купить";
  const where = cities.length === 1 ? ` ${inCity(cities[0])}` : " в Казахстане";
  const what = [schema.name, ...nameParts].join(" ");
  const title = `${what} — ${verb}${where}${state.q ? ` · «${state.q}»` : ""}${state.page > 1 ? ` · страница ${state.page}` : ""}`;
  const count = result ? `${listingsCount(result.total)}. ` : "";
  return {
    title,
    description: `${count}${what}${where}: свежие объявления с фото и ценами на kup. Удобные фильтры по характеристикам.`,
  };
}

export default async function SearchPage(props: Props) {
  const d = await load(props);
  if (!d.schema) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ErrorState text="Не удалось загрузить категорию. Попробуйте обновить страницу." />
      </div>
    );
  }
  return <SearchView schema={d.schema} state={d.state} result={d.result} refNames={d.refNames} />;
}
