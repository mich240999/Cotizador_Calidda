import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerClient, type CookieOptions, type SetAllCookies } from "@supabase/ssr";
import { isEmailAllowed } from "@/lib/auth";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";
import {
  CONFIG_SESIONES_DEFAULT,
  crearSesionApp,
  leerConfigSesiones,
  listarSesionesActivas,
  revocarOtrasSesiones,
  type SesionApp
} from "@/lib/sesiones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EsquemaLogin = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(1).max(200),
  recordarme: z.boolean().optional().default(true),
  cerrarOtras: z.boolean().optional().default(false)
});

type CookiePendiente = { name: string; value: string; options: CookieOptions };
type PerfilLogin = {
  id: string;
  nombre?: string | null;
  activo?: boolean | null;
  roles?: { nombre?: string | null } | { nombre?: string | null }[] | null;
};

function ipDe(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim();
  return ip || null;
}

function esHttps(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return new URL(req.url).protocol === "https:";
}

function mensajeLogin(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(msg)) return "Debes confirmar tu correo antes de ingresar.";
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(msg)) {
    return "Demasiados intentos. Espera unos minutos e inténtalo otra vez.";
  }
  return "No se pudo iniciar sesión. Inténtalo nuevamente.";
}

function rolDePerfil(perfil: PerfilLogin | null): string | null {
  const r = perfil?.roles;
  const nombre = Array.isArray(r) ? r[0]?.nombre : r?.nombre;
  return nombre ? String(nombre) : null;
}

async function auditar(operacion: string, userId: string | null, args: Record<string, unknown>) {
  try {
    const service = createSupabaseServiceRole();
    await service.from("audit_log").insert({
      user_id: userId,
      operacion,
      modulo: "auth",
      argumentos: args
    });
  } catch {
    /* La auditoría nunca debe bloquear el inicio de sesión. */
  }
}

/** Revoca la sesión recién creada cuando el acceso se rechaza (cuenta inactiva, equipo ocupado, etc.). */
async function revocarSesionNueva(accessToken: string | null | undefined) {
  if (!accessToken) return;
  try {
    const service = createSupabaseServiceRole();
    await service.auth.admin.signOut(accessToken, "local");
  } catch {
    /* best-effort: las cookies no se emiten y la sesión expira sola. */
  }
}

/**
 * Login server-side (email + contraseña) para poder:
 *  - aplicar "Recuérdame" (cookie persistente) o sesión de navegador,
 *  - auditar inicios de sesión exitosos, fallidos y denegados,
 *  - bloquear cuentas desactivadas antes de emitir la sesión.
 * Las cookies de Supabase se emiten en la respuesta con la expiración elegida.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof EsquemaLogin>;
  try {
    body = EsquemaLogin.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Datos de acceso inválidos." }, { status: 400 });
  }

  const email = body.email.toLowerCase();
  const ip = ipDe(req);
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300) || null;
  const base = { email, ip, user_agent: userAgent, recordarme: body.recordarme, origen: "web" };

  if (!isEmailAllowed(email)) {
    await auditar("INICIO_SESION_DENEGADO", null, { ...base, motivo: "dominio_no_autorizado" });
    return NextResponse.json({ ok: false, error: "Tu correo no pertenece a un dominio autorizado." }, { status: 403 });
  }

  const pendientes: CookiePendiente[] = [];
  const setAll: SetAllCookies = (lista) => {
    for (const c of lista) {
      pendientes.push({ name: c.name, value: c.value, options: c.options });
    }
  };
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll
      }
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: body.password
  });

  if (error || !data.user) {
    const mensaje = mensajeLogin(error?.message ?? "");
    await auditar("INICIO_SESION_FALLIDO", null, { ...base, motivo: mensaje });
    return NextResponse.json({ ok: false, error: mensaje }, { status: 401 });
  }

  const service = createSupabaseServiceRole();
  const accessToken = data.session?.access_token ?? null;
  let perfil: PerfilLogin | null = null;
  try {
    const { data: p } = await service
      .from("profiles")
      .select("id,nombre,activo,roles(nombre)")
      .eq("id", data.user.id)
      .maybeSingle();
    perfil = (p as PerfilLogin | null) ?? null;
  } catch {
    /* Sin ficha en profiles se permite el acceso, igual que getSession(). */
  }

  if (perfil && perfil.activo === false) {
    await revocarSesionNueva(accessToken);
    await auditar("INICIO_SESION_DENEGADO", perfil.id, {
      ...base,
      motivo: "cuenta_desactivada",
      nombre: perfil.nombre ?? null
    });
    return NextResponse.json(
      { ok: false, error: "Tu cuenta está desactivada. Contacta al administrador." },
      { status: 403 }
    );
  }

  let rolSgt: string | null = null;
  try {
    const { data: ficha } = await service
      .from("seg_usuarios")
      .select("estado,rol_codigo,nombre")
      .eq("correo", email)
      .maybeSingle();
    const f = ficha as { estado?: string; rol_codigo?: string; nombre?: string } | null;
    if (f) {
      if (String(f.estado ?? "").toUpperCase() !== "ACTIVO") {
        await revocarSesionNueva(accessToken);
        await auditar("INICIO_SESION_DENEGADO", perfil?.id ?? null, {
          ...base,
          motivo: "usuario_sgt_inactivo",
          nombre: f.nombre ?? perfil?.nombre ?? null,
          rol: f.rol_codigo ?? null
        });
        return NextResponse.json(
          { ok: false, error: "Tu usuario está inactivo en SGT. Contacta al administrador." },
          { status: 403 }
        );
      }
      rolSgt = f.rol_codigo ?? null;
    }
  } catch {
    /* Tabla SGT opcional: se mantiene el rol de profiles. */
  }

  const cookiesSesion = pendientes.filter((c) => c.name.includes("-auth-token"));
  if (cookiesSesion.length === 0 || cookiesSesion.every((c) => !c.value)) {
    await revocarSesionNueva(accessToken);
    await auditar("INICIO_SESION_FALLIDO", perfil?.id ?? null, { ...base, motivo: "cookie_sesion_no_emitida" });
    return NextResponse.json(
      { ok: false, error: "No se pudo establecer la sesión. Inténtalo nuevamente." },
      { status: 500 }
    );
  }

  let config = CONFIG_SESIONES_DEFAULT;
  try {
    ({ config } = await leerConfigSesiones(service));
  } catch {
    /* Si falla la lectura se usan los valores por defecto. */
  }

  let sesionesActivas: SesionApp[] = [];
  if (perfil?.id) {
    try {
      sesionesActivas = await listarSesionesActivas(service, perfil.id, config);
    } catch {
      /* Sin registro de sesiones no se bloquea el acceso. */
    }
  }

  if (perfil?.id && config.unaSesion && sesionesActivas.length > 0) {
    const actual = sesionesActivas[0];
    if (!body.cerrarOtras) {
      await revocarSesionNueva(accessToken);
      await auditar("INICIO_SESION_BLOQUEADO", perfil.id, {
        ...base,
        motivo: "sesion_activa",
        sesiones_activas: sesionesActivas.length
      });
      return NextResponse.json(
        {
          ok: false,
          codigo: "SESION_ACTIVA",
          error: "Tu cuenta ya tiene una sesión activa en otro equipo.",
          sesion: {
            user_agent: actual.user_agent ?? null,
            ip: actual.ip ?? null,
            created_at: actual.created_at,
            ultima_actividad: actual.ultima_actividad
          },
          total: sesionesActivas.length
        },
        { status: 409 }
      );
    }

    if (accessToken) {
      try {
        await service.auth.admin.signOut(accessToken, "others");
      } catch {
        /* La marca local de sesiones sigue bloqueando al equipo anterior. */
      }
    }
    try {
      await revocarOtrasSesiones(service, perfil.id);
    } catch {
      /* best-effort */
    }
    await auditar("SESION_REEMPLAZADA", perfil.id, {
      ...base,
      motivo: "cerrar_otras",
      sesiones_activas: sesionesActivas.length
    });
  }

  let sesionCreada: { id: string; expiraEn: string } | null = null;
  if (perfil?.id) {
    try {
      sesionCreada = await crearSesionApp(service, {
        userId: perfil.id,
        userAgent,
        ip,
        recordarme: body.recordarme,
        config
      });
    } catch {
      /* No se bloquea el login si falla el registro de sesión. */
    }
  }

  const rol = rolSgt ?? rolDePerfil(perfil);
  const res = NextResponse.json({ ok: true, usuario: { email, nombre: perfil?.nombre ?? null, rol } });
  const secure = esHttps(req);

  for (const c of pendientes) {
    if (!c.value) {
      res.cookies.set(c.name, "", { ...c.options, maxAge: 0 } as never);
      continue;
    }
    const opciones: CookieOptions = { ...c.options, secure: secure || c.options.secure };
    if (!body.recordarme) {
      delete opciones.maxAge;
      delete opciones.expires;
    }
    res.cookies.set(c.name, c.value, opciones as never);
  }

  res.cookies.set("calidda_recordar", body.recordarme ? "1" : "0", {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure,
    ...(body.recordarme ? { maxAge: 60 * 60 * 24 * config.recordarDias } : {})
  });

  if (sesionCreada) {
    res.cookies.set("calidda_sesion", sesionCreada.id, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure,
      ...(body.recordarme ? { maxAge: 60 * 60 * 24 * config.recordarDias } : {})
    });
  }

  await auditar("INICIO_SESION", perfil?.id ?? null, {
    ...base,
    nombre: perfil?.nombre ?? null,
    rol,
    sesion_id: sesionCreada?.id ?? null
  });
  return res;
}
