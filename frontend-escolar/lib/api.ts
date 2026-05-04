const DEFAULT_API_URL = "http://localhost:3001";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || DEFAULT_API_URL;

function getRuntimeApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:3001`;
  }

  return API_URL;
}

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getRuntimeApiUrl()}${normalizedPath}`;
}
