/** Base URL the browser uses to reach the gateway (also used for /media links). */
export const PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8180").replace(/\/$/, "");

/** Base URL for server-side rendering (inside docker: http://gateway:8080). */
export function serverApiUrl(): string {
  return (process.env.API_INTERNAL_URL || PUBLIC_API_URL).replace(/\/$/, "");
}

export function mediaUrl(path: string): string {
  if (!path) return path;
  return /^https?:\/\//.test(path) ? path : `${PUBLIC_API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
