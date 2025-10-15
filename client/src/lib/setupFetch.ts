import { Capacitor } from "@capacitor/core";
import { getApiBase } from "./api";

// Preserve original fetch
const originalFetch: typeof fetch = (globalThis.fetch as any).bind(globalThis);

// Replace global fetch to prepend API base for relative '/api/' calls
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  try {
    if (typeof input === "string" && input.startsWith("/api/")) {
      const base = getApiBase();
      const url = base ? `${base}${input}` : input;

      if (Capacitor.isNativePlatform() && !base) {
        console.warn("Native platform: '/api/' call without VITE_API_BASE or API_BASE; request may fail.");
      }

      return originalFetch(url, init);
    }
  } catch (e) {
    // Fall through to original fetch on any wrapper error
  }

  return originalFetch(input as any, init);
};