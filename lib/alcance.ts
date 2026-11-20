import type { SesionInfo } from "./auth";

/**
 * Alcance de datos por rol (seg_roles.alcance):
 *   GLOBAL    admin: todo.
 *   EMPRESA   proveedor: solo registros de su proveedor (id_proveedor).
 *   EQUIPO    supervisor: solo sus asesores asignados de la misma empresa.
 *   PROPIO    asesor/otros: solo lo creado por él.
 */
export interface Alcance {
  todo: boolean;
  /** Empresa SGT del usuario, para evitar cruces entre proveedores. */
  empresa: string | null;
  /** Todos los proveedores asignados a la cuenta. */
  proveedores: string[];
  /** El usuario opera como proveedor: accede a toda su empresa. */
  empresaScope: boolean;
  /** Solo asesores asignados al supervisor; no incluye al propio supervisor. */
  equipo: boolean;
  proveedor: string | null;
  userId: string;
  /** UUIDs de profiles del equipo o staff del proveedor. */
  equipoUsers: string[];
  /** Ids seg_usuarios visibles (equipo / staff del proveedor; o propio). */
  equipoSeg: string[];
  /** Razón social / nombre comercial del proveedor, normalizados. */
  proveedorNombres: string[];
}

type Servicio = { from(tabla: string): any };

/** Normalización de nombres de proveedor para comparar cotizaciones legadas. */
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
  const esEmpresa = sesion.alcance === "EMPRESA";
  const esEquipo = sesion.alcance === "EQUIPO";
  const proveedores = [...new Set([...(sesion.idProveedores ?? []), ...(sesion.idProveedor ? [sesion.idProveedor] : [])])];
  const base: Alcance = {
    todo: false,
    empresa: proveedores[0] ?? null,
    proveedores,
    empresaScope: esEmpresa,
    equipo: esEquipo,
    proveedor: esEmpresa ? (proveedores[0] ?? null) : null,
    userId: String(sesion.userId ?? ""),
    equipoUsers: esEquipo ? [] : [String(sesion.userId ?? "")].filter(Boolean),
    equipoSeg: [],
    proveedorNombres: [],
  };
  if (sesion.rol === "admin" || sesion.alcance === "GLOBAL") return { ...base, todo: true };

  const email = String(sesion.email ?? "").toLowerCase().trim();
  let yo: { id: string } | null = null;
  try {
    const { data } = await service.from("seg_usuarios").select("id").eq("correo", email).maybeSingle();
    if (data) yo = { id: String((data as { id: string }).id) };
  } catch { /* sin ficha SGT */ }

  const segIds = new Set<string>();
  if (yo && !esEquipo) {
    segIds.add(yo.id);
  }

  if (proveedores.length) {
    try {
      const { data: prov } = await service.from("mae_proveedores")
        .select("razon_social,nombre_comercial").in("id", proveedores);
      base.proveedorNombres = ((prov ?? []) as { razon_social?: string; nombre_comercial?: string }[])
        .flatMap((p) => [norm(p.razon_social), norm(p.nombre_comercial)]).filter(Boolean);
    } catch { /* sin maestro de proveedores */ }
  }

  // EMPRESA: todo el staff del proveedor (para cotizaciones y perfiles).
  if (sesion.alcance === "EMPRESA" && proveedores.length) {
    try {
      const { data: links, error: eLinks } = await service.from("seg_usuario_proveedores")
        .select("id_usuario").in("id_proveedor", proveedores);
      const staffQuery = service.from("seg_usuarios").select("id,correo");
      const idsStaff = [...new Set([
        ...(links ?? []).map((r: { id_usuario?: string }) => String(r.id_usuario ?? "")).filter(Boolean),
        ...(yo?.id ? [yo.id] : []),
      ])];
      const { data: staff } = !eLinks && idsStaff.length
        ? await staffQuery.in("id", idsStaff)
        : await staffQuery.in("id_proveedor", proveedores);
      const correos: string[] = [];
      for (const s of ((staff ?? []) as { id?: string; correo?: string }[])) {
        if (s.id) segIds.add(String(s.id));
        if (s.correo) correos.push(String(s.correo));
      }
      base.equipoUsers = [...new Set([...base.equipoUsers, ...(await perfilesPorCorreo(service, correos))])];
    } catch { /* sin staff */ }
  }

  // EQUIPO: asesores a cargo del supervisor (asignaciones vigentes o sin estado).
  if (esEquipo && yo && proveedores.length) {
    try {
      const { data: asg } = await service
        .from("seg_asignaciones_asesores")
        .select("id_asesor,estado,id_proveedor")
        .eq("id_supervisor", yo.id)
        .in("id_proveedor", proveedores);
      const ids = ((asg ?? []) as { id_asesor?: string; estado?: string; id_proveedor?: string | null }[])
        .filter((a) => !a.estado || String(a.estado).toUpperCase() === "VIGENTE")
        .filter((a) => !a.id_proveedor || proveedores.includes(String(a.id_proveedor)))
        .map((a) => String(a.id_asesor ?? ""))
        .filter(Boolean);
      if (ids.length) {
        const { data: equipo } = await service.from("seg_usuarios")
          .select("id,correo,id_proveedor").in("id", ids);
        const { data: relaciones } = await service.from("seg_usuario_proveedores")
          .select("id_usuario,id_proveedor").in("id_usuario", ids);
        const proveedoresPorUsuario = new Map<string, string[]>();
        for (const rel of (relaciones ?? []) as { id_usuario?: string; id_proveedor?: string }[]) {
          const key = String(rel.id_usuario ?? "");
          proveedoresPorUsuario.set(key, [...(proveedoresPorUsuario.get(key) ?? []), String(rel.id_proveedor ?? "")]);
        }
        const correos: string[] = [];
        for (const s of ((equipo ?? []) as { id?: string; correo?: string; id_proveedor?: string | null }[])) {
          // Aunque una asignación se haya cargado mal, nunca mezclar empresas.
          const deUsuario = proveedoresPorUsuario.get(String(s.id ?? "")) ?? (s.id_proveedor ? [String(s.id_proveedor)] : []);
          if (!deUsuario.some((id) => proveedores.includes(id))) continue;
          if (s.id) segIds.add(String(s.id));
          if (s.correo) correos.push(String(s.correo));
        }
        base.equipoUsers = [...new Set([...base.equipoUsers, ...(await perfilesPorCorreo(service, correos))])];
      }
    } catch { /* sin asignaciones */ }
  }

  base.equipoSeg = [...segIds];
  return base;
}

/** Filtra una consulta a vta_solicitudes_venta según el alcance. */
export function aplicarAlcanceVentas<T>(consulta: T, a: Alcance): T {
  if (a.todo) return consulta;
  const q = consulta as unknown as { or(filtro: string): T; eq(col: string, val: string): T };
  if (a.empresaScope) {
    // La vista de proveedor nunca se amplía por ser creador de una venta de
    // otra empresa. Sin proveedor asignado, falla cerrada.
    const multi = consulta as unknown as { in(col: string, values: string[]): T };
    return a.proveedores.length ? multi.in("id_proveedor", a.proveedores) : q.eq("id", "__sin_proveedor__");
  }
  const multi = consulta as unknown as { in(col: string, values: string[]): T };
  let filtrada = a.proveedores.length ? multi.in("id_proveedor", a.proveedores) : consulta;
  const qFiltrada = filtrada as unknown as { or(filtro: string): T; eq(col: string, val: string): T };
  const partes: string[] = [];
  if (a.equipo) {
    if (a.equipoUsers.length) partes.push(`created_by.in.(${a.equipoUsers.join(",")})`);
    if (a.equipoSeg.length) partes.push(`id_asesor.in.(${a.equipoSeg.join(",")})`);
  } else {
    if (a.userId) partes.push(`created_by.eq.${a.userId}`);
    if (a.equipoSeg.length) partes.push(`id_asesor.in.(${a.equipoSeg.join(",")})`);
  }
  return partes.length ? qFiltrada.or(partes.join(",")) : qFiltrada.eq("id", "__sin_alcance__");
}

/** ¿El usuario puede ver esta venta (vta_solicitudes_venta)? */
export function puedeVerVenta(a: Alcance, sol: Record<string, any>): boolean {
  if (a.todo) return true;
  const creador = String(sol.created_by ?? "");
  const proveedor = String(sol.id_proveedor ?? "");
  if (a.empresaScope) {
    return a.proveedores.includes(proveedor);
  }
  if (a.proveedores.length && !a.proveedores.includes(proveedor)) return false;
  const esAsesorEquipo = a.equipoSeg.includes(String(sol.id_asesor ?? ""));
  const esCreadorPermitido = Boolean(creador && a.equipoUsers.includes(creador));
  return a.equipo ? esAsesorEquipo || esCreadorPermitido : creador === a.userId || esAsesorEquipo;
}

/** ¿El usuario puede ver esta cotización? */
export function puedeVerCotizacion(a: Alcance, cot: Record<string, any>): boolean {
  if (a.todo) return true;
  const creador = String(cot.created_by ?? "");
  const prov = norm(cot.proveedor);
  const idProveedor = String(cot.id_proveedor ?? "");
  const perteneceEmpresa = Boolean(
    (idProveedor && a.proveedores.includes(idProveedor))
    || (prov && (prov === norm(a.empresa) || a.proveedorNombres.includes(prov)))
  );
  if (a.empresaScope) return a.proveedores.length > 0 && perteneceEmpresa;
  // En permisos por asesor/equipo usamos UUID de Auth. El texto del nombre no
  // es identidad (dos empresas pueden tener asesores homónimos).
  if (a.proveedores.length && !perteneceEmpresa) return false;
  return Boolean(creador && a.equipoUsers.includes(creador));
}
