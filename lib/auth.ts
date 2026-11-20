import { createHash } from "crypto";
import { cookies } from "next/headers";
import { createSupabaseServer, createSupabaseServiceRole } from "./supabaseServer";
import { leerConfigSesiones, validarSesionApp } from "./sesiones";

export type RolUsuario = "admin" | "asesor" | "oficina";

export interface SesionInfo {
  userId: string;
  email: string;
  rol: RolUsuario;
  /** Código del rol SGT usado por la matriz de permisos. */
  rolCodigo?: string;
  /** Alcance SGT (GLOBAL/EMPRESA/EQUIPO/PROPIO). Sin ficha SGT: admin→GLOBAL, resto→PROPIO. */
  alcance: string;
  /** Id en seg_usuarios (U00xxx) si existe. */
  segId?: string | null;
  /** Proveedor de su ficha (para alcance EMPRESA). */
  idProveedor?: string | null;
  /** Lista de proveedores asociados al usuario. */
  idProveedores?: string[];
}

/**
 * Crea el perfil app que algunos usuarios SGT antiguos/nuevos no tienen.
 * cotizaciones.created_by referencia profiles.id (que es el mismo UUID de
 * Supabase Auth), por lo que el perfil debe existir antes de guardar datos.
 */
export async function asegurarPerfilUsuario(
  service: ReturnType<typeof createSupabaseServiceRole>,
  usuario: { id: string; email: string; nombre?: string | null; rol: RolUsuario }
): Promise<void> {
  const { data: existente, error: eBuscar } = await service
    .from("profiles")
    .select("id")
    .eq("id", usuario.id)
    .maybeSingle();
  if (eBuscar) throw new Error(`No se pudo validar el perfil del usuario: ${eBuscar.message}`);
  if (existente) return;

  const { data: rol } = await service.from("roles").select("id").eq("nombre", usuario.rol).maybeSingle();
  const { error } = await service.from("profiles").insert({
    id: usuario.id,
    email: usuario.email.toLowerCase(),
    nombre: String(usuario.nombre ?? "").trim() || usuario.email,
    rol_id: (rol as { id?: number } | null)?.id ?? null,
    activo: true,
  });

  // Dos peticiones simultáneas pueden intentar crear el mismo perfil. En ese
  // caso la segunda confirma que ya existe y continúa sin alterar sus datos.
  if (error?.code === "23505") {
    const { data: creado } = await service.from("profiles").select("id").eq("id", usuario.id).maybeSingle();
    if (creado) return;
  }
  if (error) throw new Error(`No se pudo crear el perfil del usuario: ${error.message}`);
}

/**
 * Dominios permitidos vía AUTH_ALLOWED_DOMAINS="a.com,b.com".
 * Vacío = sin restricción.
 */
export function isEmailAllowed(email: string): boolean {
  // Las cuentas demo se provisionan exclusivamente desde Administración.
  // No existe registro público; el login sigue exigiendo una cuenta Auth y clave válida.
  if ((email.split("@")[1] ?? "").toLowerCase() === "demo.calidda.com.pe") return true;
  const raw = (process.env.AUTH_ALLOWED_DOMAINS ?? "").trim();
  if (!raw) return true;
  const allowed = raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const domain = (email.split("@")[1] ?? "").toLowerCase();
  return allowed.includes(domain);
}

/** hash SHA-256 hex (para tokens de sesión / auditoría). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizarRol(v: unknown): RolUsuario {
  if (v === "admin" || v === "asesor" || v === "oficina") return v;
  return "asesor";
}

/**
 * Obtiene la sesión actual: auth.getUser() + rol desde public.profiles JOIN roles.
 * Retorna null si no hay sesión o el dominio no está permitido.
 *
 * Tablas esperadas (supabase/schema.sql):
 *   public.profiles(id uuid = auth.users.id, email, nombre, rol_id, oficina_id, activo)
 *   public.roles(id, nombre admin|asesor|oficina)
 */
export async function getSession(): Promise<SesionInfo | null> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.email) return null;

  const email = data.user.email.toLowerCase();
  if (!isEmailAllowed(email)) return null;

  // Control de sesión por equipo: si la cookie existe, debe seguir activa.
  // Sin cookie se permite (sesiones anteriores a esta función) hasta que venzan.
  const sesionId = cookies().get("calidda_sesion")?.value;
  if (sesionId) {
    try {
      const svc = createSupabaseServiceRole();
      const { config } = await leerConfigSesiones(svc);
      const vigente = await validarSesionApp(svc, sesionId, data.user.id, config);
      if (!vigente) return null;
    } catch {
      /* Tabla de sesiones no disponible: no se bloquea el acceso. */
    }
  }

  // Rol desde profiles JOIN roles; si no existe, asesor por defecto (o admin si es primer usuario).
  const { data: perfil } = await supabase
    .from("profiles")
    .select("activo, oficina_id, roles(nombre)")
    .eq("id", data.user.id)
    .maybeSingle();

  if (perfil && (perfil as { activo?: boolean }).activo === false) {
    return null; // usuario desactivado
  }

  const rolRaw = (perfil as unknown as { roles?: { nombre?: unknown } | { nombre?: unknown }[] })?.roles;
  const rolNombre = Array.isArray(rolRaw) ? rolRaw[0]?.nombre : rolRaw?.nombre;
  let rol = normalizarRol(rolNombre);
  let alcance = rol === "admin" ? "GLOBAL" : "PROPIO";
  let segId: string | null = null;
  let idProveedor: string | null = null;
  let idProveedores: string[] = [];
  let nombreSgt: string | null = null;
  let rolSgt = "";

  // SGT360: ficha por correo (Stephany y el equipo viven ahí).
  // ADMIN SGT ⇒ admin de la app con alcance de su rol (normalmente GLOBAL).
  // Usa service_role (solo lectura) para no depender del RLS.
  try {
    const svc = createSupabaseServiceRole();
    const consultaFicha = await svc
      .from("seg_usuarios")
      .select("id,nombre,rol_codigo,estado,id_proveedor")
      .eq("correo", email)
      .maybeSingle();
    const f = consultaFicha.data as { id?: string; nombre?: string; rol_codigo?: string; estado?: string; id_proveedor?: string | null } | null;
    if (f) {
      if (String(f.estado ?? "").toUpperCase() !== "ACTIVO") return null; // inactivo SGT
      segId = f.id ?? null;
      nombreSgt = f.nombre ?? null;
      rolSgt = String(f.rol_codigo ?? "").toUpperCase();
      idProveedor = f.id_proveedor ?? null;
      if (f.id) {
        const { data: enlaces, error: eEnlaces } = await svc
          .from("seg_usuario_proveedores")
          .select("id_proveedor")
          .eq("id_usuario", f.id);
        if (!eEnlaces) {
          idProveedores = [...new Set(((enlaces ?? []) as { id_proveedor?: string }[])
            .map((r) => String(r.id_proveedor ?? "")).filter(Boolean))];
        }
      }
      if (!idProveedores.length && idProveedor) idProveedores = [idProveedor];
      if (!idProveedor && idProveedores.length) idProveedor = idProveedores[0];
      if (rolSgt === "ADMIN") rol = "admin";
      const { data: r } = await svc.from("seg_roles").select("alcance").eq("codigo", rolSgt).maybeSingle();
      const al = String((r as { alcance?: string } | null)?.alcance ?? "").toUpperCase();
      if (al) alcance = al;
    }
  } catch { /* sin tablas SGT: se mantiene el rol/alcance base */ }

  // Usuarios creados desde Administración > Usuarios SGT pueden tener Auth y
  // seg_usuarios, pero no profiles. Provisionarlo aquí repara cuentas ya
  // existentes y evita la violación de cotizaciones_created_by_fkey al guardar.
  if (!perfil) {
    const nombreAuth = data.user.user_metadata?.nombre ?? data.user.user_metadata?.name;
    await asegurarPerfilUsuario(createSupabaseServiceRole(), {
      id: data.user.id,
      email,
      nombre: String(nombreSgt ?? nombreAuth ?? "").trim() || email,
      rol,
    });
  }

  return {
    userId: data.user.id,
    email,
    rol,
    rolCodigo: rolSgt || (rol === "admin" ? "ADMIN" : rol === "oficina" ? "SUPERVISOR" : "ASESOR"),
    alcance,
    segId,
    idProveedor,
    idProveedores
  };
}

/**
 * Exige uno de los roles indicados. Lanza Error con `status` si falla.
 * Úsalo en API routes: try { await requireRole(["admin"]) } catch ...
 */
export async function requireRole(roles: RolUsuario[]): Promise<SesionInfo> {
  const sesion = await getSession();
  if (!sesion) {
    const e = new Error("No autenticado") as Error & { status?: number };
    e.status = 401;
    throw e;
  }
  if (!roles.includes(sesion.rol)) {
    const e = new Error("Sin permiso para esta operación") as Error & { status?: number };
    e.status = 403;
    throw e;
  }
  return sesion;
}
