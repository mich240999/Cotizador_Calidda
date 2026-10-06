import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Callback de Supabase Auth (login, registro, recuperación).
 * Intercambia ?code= por sesión y redirige a ?next= (default /dashboard).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";
  // Supabase puede devolver el error aquí (ej. otp_expired): se reenvía al login.
  const errParam =
    url.searchParams.get("error_description") || url.searchParams.get("error") || "";

  if (!code) {
    const dest = new URL("/", url.origin);
    if (errParam) dest.searchParams.set("error", errParam);
    return NextResponse.redirect(dest);
  }

  const cookieStore = cookies();
  let res = NextResponse.redirect(new URL(next, url.origin));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          res.cookies.set(name, value, options as never);
        },
        remove(name: string, options: Record<string, unknown>) {
          res.cookies.set(name, "", options as never);
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const dest = new URL("/", url.origin);
    dest.searchParams.set("error", error.message || "recovery");
    return NextResponse.redirect(dest);
  }
  return res;
}
