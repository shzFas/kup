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

export type ListingStatus = "active" | "archived" | "sold" | "expired" | "blocked";

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
  status: ListingStatus;
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
  expires_at: string | null;
  price_history: { price: number; at: string }[];
  moderation_reason: string | null;
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
  role: "user" | "moderator" | "admin";
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

// ---------- stage 2 ----------

export interface SavedSearch {
  id: string;
  name: string;
  request: Pick<SearchRequest, "category" | "query" | "filters">;
  notify: boolean;
  new_count: number;
  created_at: string;
}

export interface SavedSearchInput {
  name?: string;
  request: Pick<SearchRequest, "category" | "query" | "filters">;
  notify: boolean;
}

export interface Notification {
  id: string;
  type: "saved_search" | "price_drop";
  title: string;
  body: string;
  image: string | null;
  listing_id: string;
  saved_search_id?: string | null;
  created_at: string;
  read: boolean;
}

export interface Chat {
  id: string;
  listing: { id: string; title: string; photo: string | null; price: number; currency: string };
  peer: { id: string; name: string };
  role: "buyer" | "seller";
  last_message: { text: string; at: string; mine: boolean } | null;
  unread: number;
  peer_read_at: string | null;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  mine: boolean;
  text: string;
  created_at: string;
}

export type ServerEvent =
  | { type: "message"; chat_id: string; message: Message }
  | { type: "read"; chat_id: string; reader_id: string; at: string }
  | { type: "notification"; notification: Notification };

export type ReportReason = "fraud" | "wrong_price" | "sold" | "duplicate" | "wrong_category" | "offensive" | "other";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "fraud", label: "Мошенничество" },
  { value: "wrong_price", label: "Неверная цена" },
  { value: "sold", label: "Уже продано" },
  { value: "duplicate", label: "Дубликат" },
  { value: "wrong_category", label: "Неверная категория" },
  { value: "offensive", label: "Оскорбительное содержание" },
  { value: "other", label: "Другое" },
];

export interface Report {
  id: string;
  listing: ListingCard;
  reason: ReportReason;
  comment: string;
  reporter_id: string;
  status: "open" | "resolved";
  created_at: string;
  reports_for_listing: number;
}
