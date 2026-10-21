import type { SesionInfo } from "./auth";

/**
 * Alcance de datos por rol (seg_roles.alcance):
 *   GLOBAL    admin: todo.
 *   EMPRESA   proveedor: lo de su proveedor (id_proveedor) + lo propio.
 *   EQUIPO    supervisor: lo propio + lo de sus asesores (seg_asignaciones_asesores).
 *   PROPIO    asesor/otros: solo lo creado por él.
 */
export interface Alcance {
  todo: boolean;
  proveedor: string | null;
  userId: string;
  /** UUIDs de profiles visibles (uno mismo + equipo / staff del proveedor). */
  equipoUsers: string[];
  /** Ids seg_usuarios visibles (uno mismo + equipo / staff del proveedor). */
  equipoSeg: string[];
  /** Nombres normalizados visibles: se comparan con cotizaciones.asesor. */
  nombres: string[];
  /** Razón social / nombre comercial del proveedor, normalizados. */
  proveedorNombres: string[];
}

type Servicio = { from(tabla: string): any };

/** minúsculas, sin tildes ni espacios sobrantes (para comparar nombres). */
export function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function perfilesPorCorreo(service: Servicio, correos: string[]): Promise<string[]> {
  const lista = [...new Set(correos.map((c) => String(c ?? "").toLowerCase().trim()).filter(Boolean))];
  if (!lista.length) return [];
  try {
    const { data } = await service.from("profiles").select("id,email").in("email", lista);
    return ((data ?? []) as { id?: string }[]).map((p) => String(p.id ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Resuelve el alcance real del usuario en una sola pasada:
 * ficha seg_usuarios (por correo) → equipo (si EQUIPO) o staff del proveedor
 * (si EMPRESA) → UUIDs de profiles de esos correos.
 */
export async function resolverAlcance(service: Servicio, sesion: SesionInfo): Promise<Alcance> {
  const base: Alcance = {
    todo: false,
    proveedor: null,
    userId: String(sesion.userId ?? ""),
    equipoUsers: [String(sesion.userId ?? "")].filter(Boolean),
    equipoSeg: [],
    nombres: [],
    proveedorNombres: [],
  };
  if (sesion.rol === "admin" || sesion.alcance === "GLOBAL") return { ...base, todo: true };

  const email = String(sesion.email ?? "").toLowerCase().trim();
  let yo: { id: string; nombre: string } | null = null;
  try {
    const { data } = await service.from("seg_usuarios").select("id,nombre,correo").eq("correo", email).maybeSingle();
    if (data) yo = { id: String((data as { id: string }).id), nombre: String((data as { nombre?: string }).nombre ?? "") };
  } catch { /* sin ficha SGT */ }

  const segIds = new Set<string>();
  const nombres = new Set<string>();
  if (yo) {
    segIds.add(yo.id);
    if (yo.nombre) nombres.add(norm(yo.nombre));
  }

  // EMPRESA: todo el staff del proveedor (para cotizaciones y perfiles).
  if (sesion.alcance === "EMPRESA" && sesion.idProveedor) {
    base.proveedor = sesion.idProveedor;
    try {
      const { data: staff } = await service.from("seg_usuarios").select("id,nombre,correo").eq("id_proveedor", sesion.idProveedor);
      const correos: string[] = [];
      for (const s of ((staff ?? []) as { id?: string; nombre?: string; correo?: string }[])) {
        if (s.id) segIds.add(String(s.id));
        if (s.nombre) nombres.add(norm(s.nombre));
        if (s.correo) correos.push(String(s.correo));
      }
      base.equipoUsers = [...new Set([...base.equipoUsers, ...(await perfilesPorCorreo(service, correos))])];
    } catch { /* sin staff */ }
    try {
      const { data: prov } = await service.from("mae_proveedores").select("razon_social,nombre_comercial").eq("id", sesion.idProveedor).maybeSingle();
      const p = (prov ?? {}) as { razon_social?: string; nombre_comercial?: string };
      base.proveedorNombres = [norm(p.razon_social), norm(p.nombre_comercial)].filter(Boolean);
    } catch { /* sin maestro de proveedores */ }
  }

  // EQUIPO: asesores a cargo del supervisor (asignaciones vigentes o sin estado).
  if (sesion.alcance === "EQUIPO" && yo) {
    try {
      const { data: asg } = await service
        .from("seg_asignaciones_asesores")
        .select("id_asesor,estado")
        .eq("id_supervisor", yo.id);
      const ids = ((asg ?? []) as { id_asesor?: string; estado?: string }[])
        .filter((a) => !a.estado || String(a.estado).toUpperCase() === "VIGENTE")
        .map((a) => String(a.id_asesor ?? ""))
        .filter(Boolean);
      if (ids.length) {
        const { data: equipo } = await service.from("seg_usuarios").select("id,nombre,correo").in("id", ids);
        const correos: string[] = [];
        for (const s of ((equipo ?? []) as { id?: string; nombre?: string; correo?: string }[])) {
          if (s.id) segIds.add(String(s.id));
          if (s.nombre) nombres.add(norm(s.nombre));
          if (s.correo) correos.push(String(s.correo));
        }
        base.equipoUsers = [...new Set([...base.equipoUsers, ...(await perfilesPorCorreo(service, correos))])];
      }
    } catch { /* sin asignaciones */ }
  }

  base.equipoSeg = [...segIds];
  base.nombres = [...nombres];
  return base;
}

/** Filtra una consulta a vta_solicitudes_venta según el alcance. */
export function aplicarAlcanceVentas<T>(consulta: T, a: Alcance): T {
  if (a.todo) return consulta;
  const q = consulta as unknown as { or(filtro: string): T; eq(col: string, val: string): T };
  if (a.proveedor) {
    return q.or(`id_proveedor.eq.${a.proveedor},created_by.eq.${a.userId}`);
  }
  const partes: string[] = [];
  if (a.equipoUsers.length) partes.push(`created_by.in.(${a.equipoUsers.join(",")})`);
  if (a.equipoSeg.length) partes.push(`id_asesor.in.(${a.equipoSeg.join(",")})`);
  return partes.length ? q.or(partes.join(",")) : q.eq("created_by", a.userId);
}

/** ¿El usuario puede ver esta venta (vta_solicitudes_venta)? */
export function puedeVerVenta(a: Alcance, sol: Record<string, any>): boolean {
  if (a.todo) return true;
  const creador = String(sol.created_by ?? "");
  if (a.proveedor) {
    return String(sol.id_proveedor ?? "") === a.proveedor || (!!creador && creador === a.userId);
  }
  if (creador && a.equipoUsers.includes(creador)) return true;
  return a.equipoSeg.includes(String(sol.id_asesor ?? ""));
}

/** ¿El usuario puede ver esta cotización? */
export function puedeVerCotizacion(a: Alcance, cot: Record<string, any>): boolean {
  if (a.todo) return true;
  const creador = String(cot.created_by ?? "");
  if (creador && a.equipoUsers.includes(creador)) return true;
  const asesor = norm(cot.asesor);
  if (asesor && a.nombres.includes(asesor)) return true;
  const prov = norm(cot.proveedor);
  if (prov && a.proveedorNombres.includes(prov)) return true;
  return false;
}
