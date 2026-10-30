// Types mirror docs/API.md. Keep them in sync with the Go services.

export type AttrType = "int" | "decimal" | "enum" | "multi_enum" | "bool" | "ref" | "text";
export type FilterWidget = "range" | "multi" | "multi_all" | "toggle" | "select" | "ref";

export interface Option {
  value: string;
  label: string;
}

export interface DependsOn {
  key: string;
  values: string[];
}

export interface Attribute {
  key: string;
  type: AttrType;
  label: string;
  group: string;
  required: boolean;
  ref: string | null;
  parent: string | null;
  options: Option[] | null;
  min: number | null;
  max: number | null;
  step: number | null;
  unit: string | null;
  depends_on: DependsOn | null;
  computed: boolean;
}

export interface FilterDef {
  key: string;
  label: string;
  widget: FilterWidget;
  type: AttrType;
  group: string;
  ref: string | null;
  parent: string | null;
  options: Option[] | null;
  min: number | null;
  max: number | null;
  step: number | null;
  unit: string | null;
  presets: number[] | null;
  pinned: boolean;
  facet: boolean;
  depends_on: DependsOn | null;
}

export interface CategorySchema {
  category: string;
  name: string;
  groups: { key: string; label: string }[];
  attributes: Attribute[];
  filters: FilterDef[];
  sorts: Option[];
}

export interface Category {
  slug: string;
  name: string;
  icon: string;
}

export interface RefItem {
  id: string;
  name: string;
  parent: string | null;
}

export type AttrValue = string | number | boolean | string[];

export interface ListingCard {
  id: string;
  category: string;
  title: string;
  price: number;
  currency: string;
  price_suffix: string;
  city: { id: string; name: string };
  photos: string[];
  attributes: Record<string, AttrValue>;
  attribute_labels: Record<string, string>;
  highlights: string[];
  status: "active" | "archived" | "sold";
  published_at: string;
  is_favorite?: boolean;
}

export interface Listing extends ListingCard {
  description: string;
  /** Photo ids in the same order as `photos` — send these back in PATCH. */
  photo_ids: string[];
  location: { lat: number; lng: number } | null;
  seller: { id: string; name: string; member_since: string };
  views: number;
  is_owner: boolean;
  updated_at: string;
}

export interface ListingInput {
  category: string;
  price: number;
  currency: string;
  city: string;
  description: string;
  location?: { lat: number; lng: number } | null;
  photos: string[];
  attributes: Record<string, AttrValue>;
}

export interface User {
  id: string;
  phone: string;
  name: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export type FilterValue =
  | { in: string[] }
  | { all: string[] }
  | { gte?: number; lte?: number }
  | { eq: boolean | string };

export type Filters = Record<string, FilterValue>;

export interface SearchRequest {
  category: string;
  query?: string;
  filters?: Filters;
  geo?: { lat: number; lng: number; radius_km: number };
  sort?: string;
  page?: number;
  limit?: number;
  facets?: string[];
}

export interface SearchResponse {
  total: number;
  page: number;
  limit: number;
  items: ListingCard[];
  facets: Record<string, Record<string, number>>;
}

export interface ApiErrorBody {
  error: string;
  message: string;
  fields?: Record<string, string>;
}
