import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const RUTAS_PROTEGIDAS = ["/dashboard", "/cotizaciones", "/clientes", "/materiales", "/admin"];

/**
 * Protege /dashboard, /cotizaciones, /clientes, /materiales, /admin.
 * Si no hay sesión Supabase → redirect a / (login).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protegida = RUTAS_PROTEGIDAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  if (!protegida) return NextResponse.next();

  let res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          res.cookies.set(name, value, options as never);
        },
        remove(name: string, options: Record<string, unknown>) {
          res.cookies.set(name, "", options as never);
        }
      }
    }
  );

  const { data } = await supabase.auth.getUser();
  if (!data?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/cotizaciones/:path*", "/clientes/:path*", "/materiales/:path*", "/admin/:path*"]
};
