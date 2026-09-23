import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createJsClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase SERVER con cookies (respeta RLS + sesión del usuario).
 * Usar en Route Handlers / Server Components / Server Actions.
 */
export function createSupabaseServer() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Route Handler con cookies readonly en ciertos contextos — se ignora
            // porque el middleware refresca la sesión.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // noop (ver comentario anterior)
          }
        }
      }
    }
  );
}

/**
 * Cliente privilegiado con service_role. SOLO SERVER.
 * Bypasea RLS — usar exclusivamente en API routes / cron tras validar sesión.
 *
 * NUNCA importarlo en "use client" ni exponer la key al browser.
 */
let _service: SupabaseClient | null = null;

export function createSupabaseServiceRole(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createSupabaseServiceRole solo puede usarse en el servidor.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  }
  if (!_service) {
    _service = createJsClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return _service;
}
