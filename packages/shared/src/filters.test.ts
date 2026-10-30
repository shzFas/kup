import { test } from "node:test";
import assert from "node:assert/strict";
import { filtersToQuery, queryToFilters, pruneFilters } from "./filters.ts";
import type { FilterDef } from "./types.ts";

const def = (key: string, widget: FilterDef["widget"], extra: Partial<FilterDef> = {}): FilterDef => ({
  key, label: key, widget, type: "int", group: "main", ref: null, parent: null, options: null,
  min: null, max: null, step: null, unit: null, presets: null, pinned: false, facet: false, depends_on: null, ...extra,
});

const defs = [
  def("year", "range"),
  def("make", "ref"),
  def("model", "ref", { parent: "make" }),
  def("options", "multi_all"),
  def("customs_cleared", "toggle"),
  def("posted_within", "select"),
  def("fuel", "multi"),
  def("range_km", "range", { depends_on: { key: "fuel", values: ["electric"] } }),
];

test("round trip", () => {
  const f = {
    year: { gte: 2015, lte: 2020 },
    make: { in: ["toyota", "bmw"] },
    options: { all: ["abs"] },
    customs_cleared: { eq: true },
    posted_within: { eq: "7" },
  };
  const q = filtersToQuery(f);
  assert.deepEqual(q, { year: "2015..2020", make: "toyota,bmw", options: "abs", customs_cleared: "1", posted_within: "7" });
  assert.deepEqual(queryToFilters(q, defs), f);
});

test("open ranges", () => {
  assert.deepEqual(queryToFilters({ year: "..2020" }, defs), { year: { lte: 2020 } });
  assert.deepEqual(queryToFilters({ year: "2015.." }, defs), { year: { gte: 2015 } });
  assert.deepEqual(queryToFilters({ year: "abc" }, defs), {});
});

test("prune removes children and unmet deps", () => {
  assert.deepEqual(
    pruneFilters({ model: { in: ["toyota-camry"] }, range_km: { gte: 100 }, fuel: { in: ["petrol"] } }, defs),
    { fuel: { in: ["petrol"] } },
  );
});

import { formatNumber } from "./filters.ts";
test("formatNumber keeps years ungrouped", () => {
  assert.equal(formatNumber(2015), "2015");
  assert.equal(formatNumber(85000), "85 000");
  assert.equal(formatNumber(2.5), "2,5");
});
