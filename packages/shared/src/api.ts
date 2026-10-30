import type {
  ApiErrorBody,
  AuthResponse,
  Category,
  CategorySchema,
  Listing,
  ListingCard,
  ListingInput,
  RefItem,
  SearchRequest,
  SearchResponse,
  User,
} from "./types.ts";

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message || body.error);
    this.status = status;
    this.code = body.error;
    this.fields = body.fields;
  }
}

export interface TokenStore {
  get(): Promise<{ access: string; refresh: string } | null> | { access: string; refresh: string } | null;
  set(tokens: { access: string; refresh: string } | null): Promise<void> | void;
}

export interface ApiOptions {
  baseUrl: string; // e.g. http://localhost:8180
  tokens: TokenStore;
  onLogout?: () => void;
}

/** Typed client for the gateway. Works in browsers, Node (SSR) and React Native. */
export function createApi(opts: ApiOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");
  let refreshing: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    const t = await opts.tokens.get();
    if (!t) return false;
    const res = await fetch(`${base}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: t.refresh }),
    });
    if (!res.ok) {
      await opts.tokens.set(null);
      opts.onLogout?.();
      return false;
    }
    const body = (await res.json()) as AuthResponse;
    await opts.tokens.set({ access: body.access_token, refresh: body.refresh_token });
    return true;
  }

  async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
    const t = await opts.tokens.get();
    const headers: Record<string, string> = {};
    if (t) headers.Authorization = `Bearer ${t.access}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${base}${path}`, { method, headers, body: payload });
    if (res.status === 401 && t && retry) {
      refreshing ??= refresh().finally(() => (refreshing = null));
      if (await refreshing) return request<T>(method, path, body, false);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new ApiError(res.status, json ?? { error: "http_" + res.status, message: res.statusText });
    return json as T;
  }

  const saveAuth = async (r: AuthResponse) => {
    await opts.tokens.set({ access: r.access_token, refresh: r.refresh_token });
    return r;
  };

  return {
    baseUrl: base,
    /** Absolute URL for a /media/... path. */
    mediaUrl: (path: string) => (path.startsWith("http") ? path : `${base}${path}`),

    requestOtp: (phone: string) =>
      request<{ sent: boolean; retry_after_sec: number; dev_code?: string }>("POST", "/v1/auth/otp/request", { phone }),
    verifyOtp: (phone: string, code: string) =>
      request<AuthResponse>("POST", "/v1/auth/otp/verify", { phone, code }).then(saveAuth),
    logout: async () => {
      const t = await opts.tokens.get();
      if (t) await request<void>("POST", "/v1/auth/logout", { refresh_token: t.refresh }).catch(() => {});
      await opts.tokens.set(null);
    },
    me: () => request<User>("GET", "/v1/me"),
    updateMe: (patch: { name: string }) => request<User>("PATCH", "/v1/me", patch),

    categories: () => request<{ items: Category[] }>("GET", "/v1/categories").then((r) => r.items),
    schema: (slug: string) => request<CategorySchema>("GET", `/v1/categories/${slug}/schema`),
    refs: (ref: string, params: { parent?: string[]; q?: string } = {}) => {
      const qs = new URLSearchParams();
      if (params.parent?.length) qs.set("parent", params.parent.join(","));
      if (params.q) qs.set("q", params.q);
      const s = qs.toString();
      return request<{ items: RefItem[] }>("GET", `/v1/refs/${ref}${s ? "?" + s : ""}`).then((r) => r.items);
    },

    search: (req: SearchRequest) => request<SearchResponse>("POST", "/v1/search", req),
    count: (req: SearchRequest) => request<{ total: number }>("POST", "/v1/search/count", req).then((r) => r.total),

    listing: (id: string) => request<Listing>("GET", `/v1/listings/${id}`),
    listingPhone: (id: string) => request<{ phone: string }>("GET", `/v1/listings/${id}/phone`).then((r) => r.phone),
    createListing: (input: ListingInput) => request<Listing>("POST", "/v1/listings", input),
    updateListing: (id: string, patch: Partial<ListingInput>) => request<Listing>("PATCH", `/v1/listings/${id}`, patch),
    setListingStatus: (id: string, status: "active" | "archived" | "sold") =>
      request<Listing>("POST", `/v1/listings/${id}/status`, { status }),
    deleteListing: (id: string) => request<void>("DELETE", `/v1/listings/${id}`),
    myListings: (status?: string) =>
      request<{ items: ListingCard[] }>("GET", `/v1/me/listings${status ? "?status=" + status : ""}`).then((r) => r.items),

    /** file: a browser File/Blob, or in React Native `{ uri, name, type }`. */
    uploadPhoto: (file: Blob | { uri: string; name: string; type: string }) => {
      const fd = new FormData();
      fd.append("file", file as Blob);
      return request<{ id: string; url: string }>("POST", "/v1/media/photos", fd);
    },

    favorites: () => request<{ items: ListingCard[] }>("GET", "/v1/me/favorites").then((r) => r.items),
    addFavorite: (id: string) => request<void>("PUT", `/v1/me/favorites/${id}`),
    removeFavorite: (id: string) => request<void>("DELETE", `/v1/me/favorites/${id}`),
  };
}

export type Api = ReturnType<typeof createApi>;
