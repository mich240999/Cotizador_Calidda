import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const RUTAS_PROTEGIDAS = ["/dashboard", "/cotizaciones", "/clientes", "/materiales", "/admin", "/ventas", "/instalaciones"];

type ConfigRemota = { duracion_min: number; inactividad_min: number; recordar_dias: number };

/**
 * Consulta a Supabase (service_role) si la sesión de este equipo sigue vigente.
 * Devuelve null si no se puede verificar (tabla ausente / sin claves): en ese
 * caso no se bloquea el acceso para no romper instalaciones sin migración.
 */
async function sesionRemotaVigente(sesionId: string, userId: string): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const [cfgRes, sesResFull] = await Promise.all([
      fetch(`${url}/rest/v1/cfg_sesiones?id=eq.true&select=duracion_min,inactividad_min,recordar_dias`, {
        headers,
        cache: "no-store"
      }),
      fetch(
        `${url}/rest/v1/sesiones_app?id=eq.${encodeURIComponent(sesionId)}&user_id=eq.${encodeURIComponent(userId)}&activa=eq.true&select=id,created_at,ultima_actividad,expira_en,recordarme`,
        { headers, cache: "no-store" }
      )
    ]);
    let sesRes = sesResFull;
    if (!sesRes.ok) {
      sesRes = await fetch(
        `${url}/rest/v1/sesiones_app?id=eq.${encodeURIComponent(sesionId)}&user_id=eq.${encodeURIComponent(userId)}&activa=eq.true&select=id,created_at,ultima_actividad`,
        { headers, cache: "no-store" }
      );
    }
    if (!sesRes.ok) return null;
    const filas = (await sesRes.json()) as unknown;
    const sesion = Array.isArray(filas) ? (filas[0] as Record<string, unknown> | undefined) : undefined;
    if (!sesion) return false;

    let config: ConfigRemota = { duracion_min: 480, inactividad_min: 30, recordar_dias: 180 };
    if (cfgRes.ok) {
      const cfgFilas = (await cfgRes.json()) as unknown;
      const cfg = Array.isArray(cfgFilas) ? (cfgFilas[0] as Partial<ConfigRemota> | undefined) : undefined;
      if (cfg) {
        config = {
          duracion_min: Number(cfg.duracion_min) || config.duracion_min,
          inactividad_min: Number(cfg.inactividad_min) || config.inactividad_min,
          recordar_dias: Number(cfg.recordar_dias) || config.recordar_dias
        };
      }
    }

    const ahora = Date.now();
    const actividad = Date.parse(String(sesion.ultima_actividad ?? ""));
    if (!Number.isFinite(actividad) || actividad + config.inactividad_min * 60_000 <= ahora) {
      return false;
    }
    if (sesion.expira_en) {
      const expira = Date.parse(String(sesion.expira_en));
      if (!Number.isFinite(expira) || expira <= ahora) return false;
      return true;
    }
    const creada = Date.parse(String(sesion.created_at ?? ""));
    const duracion = sesion.recordarme
      ? config.recordar_dias * 86_400_000
      : config.duracion_min * 60_000;
    return Number.isFinite(creada) && creada + duracion > ahora;
  } catch {
    return null;
  }
}

function limpiarCookiesSesion(req: NextRequest, res: NextResponse) {
  for (const c of req.cookies.getAll()) {
    if (c.name === "calidda_sesion" || /^sb-.*-auth-token/.test(c.name)) {
      res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }
}

/**
 * Protege /dashboard, /cotizaciones, /clientes, /materiales, /admin.
 * Si no hay sesión Supabase → redirect a / (login).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protegida = RUTAS_PROTEGIDAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  if (!protegida) return NextResponse.next();

  let res = NextResponse.next({ request: { headers: req.headers } });
  // "Recuérdame" desmarcado: al refrescar el token no re-crear cookies persistentes.
  const soloSesion = req.cookies.get("calidda_recordar")?.value === "0";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          const opciones = soloSesion
            ? { ...options, maxAge: undefined, expires: undefined }
            : options;
          res.cookies.set(name, value, opciones as never);
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
    url.searchParams.delete("next");
    if (req.cookies.get("calidda_sesion")?.value) {
      url.searchParams.set("motivo", "sesion_cerrada");
    } else {
      url.searchParams.set("next", pathname);
    }
    const redir = NextResponse.redirect(url);
    limpiarCookiesSesion(req, redir);
    return redir;
  }

  const sesionId = req.cookies.get("calidda_sesion")?.value;
  if (sesionId) {
    const vigente = await sesionRemotaVigente(sesionId, data.user.id);
    if (vigente === false) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.delete("next");
      url.searchParams.set("motivo", "sesion_cerrada");
      const redir = NextResponse.redirect(url);
      limpiarCookiesSesion(req, redir);
      return redir;
    }
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/cotizaciones/:path*", "/clientes/:path*", "/materiales/:path*", "/admin/:path*", "/ventas/:path*", "/instalaciones/:path*"]
};
