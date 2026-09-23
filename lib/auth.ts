import { createHash } from "crypto";
import { createSupabaseServer } from "./supabaseServer";

export type RolUsuario = "admin" | "asesor" | "oficina";

export interface SesionInfo {
  userId: string;
  email: string;
  rol: RolUsuario;
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

  return {
    userId: data.user.id,
    email,
    rol: normalizarRol(rolNombre)
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
