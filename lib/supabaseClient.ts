"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para browser / Client Components.
 * Usa SOLO anon key (NEXT_PUBLIC_*). Nunca service_role aquí.
 */
export function createSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
  return createBrowserClient(url, anon);
}

// Singleton para reutilizar en frontend (mirror google.script.run con fetch a /api/operacion)
let _browser: ReturnType<typeof createSupabaseBrowser> | null = null;

export function getSupabaseBrowser() {
  if (!_browser) _browser = createSupabaseBrowser();
  return _browser;
}
