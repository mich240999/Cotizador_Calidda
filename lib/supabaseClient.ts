"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { CookieOptions, SetAllCookies } from "@supabase/ssr";

/**
 * Cliente Supabase para browser / Client Components.
 * Usa SOLO anon key (NEXT_PUBLIC_*). Nunca service_role aquí.
 *
 * La escritura de cookies respeta "Recuérdame" (cookie `calidda_recordar`):
 * - "1" o ausente → cookies persistentes (comportamiento histórico).
 * - "0" → cookies de sesión: se borran al cerrar el navegador.
 */
function leerCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined") return [];
  return document.cookie
    .split("; ")
    .filter(Boolean)
    .map((parte) => {
      const i = parte.indexOf("=");
      const name = i >= 0 ? parte.slice(0, i) : parte;
      const raw = i >= 0 ? parte.slice(i + 1) : "";
      let value = raw;
      try {
        value = decodeURIComponent(raw);
      } catch {
        /* valor no codificado */
      }
      return { name, value };
    });
}

function recuerdaSesion(): boolean {
  return !leerCookies().some((c) => c.name === "calidda_recordar" && c.value === "0");
}

function escribirCookie(name: string, value: string, options: CookieOptions, persistente: boolean) {
  if (typeof document === "undefined") return;
  const seguro = typeof location !== "undefined" && location.protocol === "https:";
  let cookie = `${name}=${value}; Path=/; SameSite=Lax`;
  if (seguro) cookie += "; Secure";
  if (!value) {
    cookie += "; Max-Age=0";
  } else if (persistente) {
    if (typeof options.maxAge === "number") cookie += `; Max-Age=${options.maxAge}`;
    else if (options.expires) cookie += `; Expires=${new Date(options.expires as string | number | Date).toUTCString()}`;
  }
  document.cookie = cookie;
}

export function createSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
  const setAll: SetAllCookies = (lista) => {
    const persistente = recuerdaSesion();
    for (const { name, value, options } of lista) {
      escribirCookie(name, value, options, persistente);
    }
  };
  return createBrowserClient(url, anon, {
    cookies: {
      getAll: () => leerCookies(),
      setAll
    }
  });
}

// Singleton para reutilizar en frontend (mirror google.script.run con fetch a /api/operacion)
let _browser: ReturnType<typeof createSupabaseBrowser> | null = null;

export function getSupabaseBrowser() {
  if (!_browser) _browser = createSupabaseBrowser();
  return _browser;
}
