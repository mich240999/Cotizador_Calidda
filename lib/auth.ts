import { createHash } from "crypto";
import { createSupabaseServer, createSupabaseServiceRole } from "./supabaseServer";

export type RolUsuario = "admin" | "asesor" | "oficina";

export interface SesionInfo {
  userId: string;
  email: string;
  rol: RolUsuario;
  /** Alcance SGT (GLOBAL/EMPRESA/EQUIPO/PROPIO). Sin ficha SGT: admin→GLOBAL, resto→PROPIO. */
  alcance: string;
  /** Id en seg_usuarios (U00xxx) si existe. */
  segId?: string | null;
  /** Proveedor de su ficha (para alcance EMPRESA). */
  idProveedor?: string | null;
}

/**
 * Dominios permitidos vía AUTH_ALLOWED_DOMAINS="a.com,b.com".
 * Vacío = sin restricción.
 */
export function isEmailAllowed(email: string): boolean {
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

  // Rol desde profiles JOIN roles; si no existe, asesor por defecto (o admin si es primer usuario).
  const { data: perfil } = await supabase
    .from("profiles")
    .select("activo, oficina_id, roles!inner(nombre)")
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

  // SGT360: ficha por correo (Stephany y el equipo viven ahí).
  // ADMIN SGT ⇒ admin de la app con alcance de su rol (normalmente GLOBAL).
  // Usa service_role (solo lectura) para no depender del RLS.
  try {
    const svc = createSupabaseServiceRole();
    const { data: ficha } = await svc
      .from("seg_usuarios")
      .select("id,rol_codigo,estado,id_proveedor")
      .eq("correo", email)
      .maybeSingle();
    const f = ficha as { id?: string; rol_codigo?: string; estado?: string; id_proveedor?: string | null } | null;
    if (f) {
      if (String(f.estado ?? "").toUpperCase() !== "ACTIVO") return null; // inactivo SGT
      segId = f.id ?? null;
      idProveedor = f.id_proveedor ?? null;
      const rc = String(f.rol_codigo ?? "").toUpperCase();
      if (rc === "ADMIN") rol = "admin";
      const { data: r } = await svc.from("seg_roles").select("alcance").eq("codigo", rc).maybeSingle();
      const al = String((r as { alcance?: string } | null)?.alcance ?? "").toUpperCase();
      if (al) alcance = al;
    }
  } catch { /* sin tablas SGT: se mantiene el rol/alcance base */ }

  return {
    userId: data.user.id,
    email,
    rol,
    alcance,
    segId,
    idProveedor
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
