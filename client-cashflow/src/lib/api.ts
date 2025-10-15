import { Capacitor } from "@capacitor/core";

// Returns the base URL for API requests.
// Priority: localStorage override > VITE_API_BASE > '' (relative)
export function getApiBase(): string {
  const override = (typeof window !== 'undefined') ? localStorage.getItem('API_BASE') || undefined : undefined;
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  const base = override || envBase || '';

  if (Capacitor.isNativePlatform() && !base) {
    console.warn("API base not set for native platform. Set 'API_BASE' in localStorage or 'VITE_API_BASE' at build time.");
  }

  return base;
}

// Wrapper around fetch that prepends the API base when present
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBase();
  const url = base ? `${base}${path}` : path;
  return fetch(url, init);
}