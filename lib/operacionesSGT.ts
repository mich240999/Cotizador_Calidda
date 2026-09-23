import { z } from "zod";
import type { RolUsuario } from "./auth";
import type { OperacionContext } from "./operaciones";
import { cuotaFrancesa, tablaSimulacion, temDesdeTea, PLAZOS_SIMULACION } from "./financiamiento";

/**
 * lib/operacionesSGT.ts — Operaciones Soluciones Hogar (prefijo SGT).
 * NO modifica lib/operaciones.ts; este mapa se fusiona en /api/operacion.
 * Todos los handlers usan service_role (ctx.service) y son tolerantes a
 * tablas SGT aún no migradas: si la tabla no existe, degradan a la tabla
 * base o retornan lista vacía en lugar de romper.
 */

type Handler = (args: any, ctx: OperacionContext) => Promise<unknown>;
interface DefOp { descripcion: string; roles: RolUsuario[]; schema: z.ZodTypeAny; handler: Handler; }

const TODOS: RolUsuario[] = ["admin", "asesor", "oficina"];
const OPERATIVO: RolUsuario[] = ["admin", "asesor"];
const SOLO_ADMIN: RolUsuario[] = ["admin"];

const zLimit = z.coerce.number().int().min(1).max(500).default(100);
const zFechaFlexible = z.string().trim().min(8).max(12); // dd.mm.yyyy o yyyy-mm-dd

// ---------------------------------------------------------------- utils

/** ¿El error es "tabla no existe"? (PostgREST / Postgres 42P01). */
function esTablaFaltante(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e ?? "");
  return /does not exist|Could not find the table|relation .* does not exist|42P01/i.test(m);
}

/** Intenta leer de la primera tabla existente de la lista. */
async function leerPrimeraTabla(ctx: OperacionContext, tablas: string[], select = "*", order?: { col: string; asc?: boolean }, limit = 200) {
  let ultimoError: unknown = null;
  const svc = ctx.service as unknown as { from(t: string): any };
  for (const t of tablas) {
    try {
      let q = svc.from(t).select(select).limit(limit);
      if (order) q = q.order(order.col, { ascending: order.asc ?? true });
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { tabla: t, data: (data ?? []) as unknown as Record<string, any>[] };
    } catch (e) {
      ultimoError = e;
      if (!esTablaFaltante(e)) throw e;
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error("Sin tabla disponible");
}

/** Convierte dd.mm.yyyy | dd/mm/yyyy | yyyy-mm-dd → yyyy-mm-dd. */
export function normalizarFecha(v: string): string {
  const s = v.trim();
  let m = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) throw new Error(`Fecha inválida: ${v}`);
    return `${yyyy}-${mm}-${dd}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  throw new Error(`Fecha inválida (use dd.mm.yyyy): ${v}`);
}

function diaAnterior(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function teaADecimal(tea: number): number {
  // Acepta 40 (=40%) o 0.40; >10 se rechaza.
  if (!Number.isFinite(tea) || tea < 0 || tea > 100) throw new Error("TEA fuera de rango");
  return tea > 1 ? tea / 100 : tea;
}

function siguienteCodigoAMCA(existentes: string[]): string {
  let max = 0;
  for (const c of existentes) {
    const m = /^COT-AMCA-(\d{1,8})$/.exec((c ?? "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `COT-AMCA-${String(max + 1).padStart(5, "0")}`;
}

/** Siguiente id con prefijo (OFV/GVE/POF + 4 dígitos), ej. OFV0002. */
function siguienteId(prefijo: string, existentes: (string | null | undefined)[], pad = 4): string {
  let max = 0;
  const re = new RegExp(`^${prefijo}(\\d{${pad}})$`);
  for (const c of existentes) {
    const m = re.exec(String(c ?? "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefijo}${String(max + 1).padStart(pad, "0")}`;
}

// ---------------------------------------------------------------- schemas

const EsquemaQ = z.object({ q: z.string().trim().max(120).optional().default(""), limit: zLimit });
const EsquemaProveedorSGT = z.object({
  nombre: z.string().trim().min(2).max(200),
  ruc: z.string().trim().regex(/^\d{11}$/, "RUC debe tener 11 dígitos"),
  interlocutor: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).default(""),
  telefono: z.string().trim().max(30).optional().default("")
});
const EsquemaVinculo = z.object({
  proveedor_id: z.string().trim().min(1).max(20),
  oficina_id: z.string().trim().min(1).max(20)
});
const EsquemaCrearOficina = z.object({
  codigo_sap: z.string().trim().min(2).max(30).transform((s) => s.toUpperCase()),
  nombre: z.string().trim().min(2).max(200),
  descripcion: z.string().trim().max(500).optional().default("")
});
const EsquemaActualizarOficina = z.object({
  id: z.string().trim().min(1).max(20),
  nombre: z.string().trim().min(2).max(200).optional(),
  descripcion: z.string().trim().max(500).optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]).optional()
});
const EsquemaCrearGrupo = z.object({
  vinculacion_id: z.string().trim().regex(/^POF[0-9]{4}$/, "vinculacion_id debe ser POFxxxx"),
  codigo_sap: z.string().trim().min(2).max(30).transform((s) => s.toUpperCase()),
  nombre: z.string().trim().min(2).max(200)
});
const EsquemaActualizarGrupo = z.object({
  id: z.string().trim().regex(/^GVE[0-9]{4}$/, "id debe ser GVExxxx"),
  nombre: z.string().trim().min(2).max(200).optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]).optional()
});
const EsquemaVacio = z.object({}).passthrough();
const EsquemaMaterialesSGT = z.object({
  q: z.string().trim().max(120).optional().default(""),
  fecha: zFechaFlexible.optional(),
  limit: zLimit
});
const EsquemaCrearTarifa = z.object({
  material_id: z.string().trim().min(1).max(120).optional(),
  codigo: z.string().trim().max(60).optional(),
  precio: z.coerce.number().min(0).max(10_000_000),
  vigente_desde: zFechaFlexible,
  vigente_hasta: zFechaFlexible.optional()
}).refine((v) => v.material_id || v.codigo, { message: "material_id o codigo requerido" });
const EsquemaCargaMasiva = z.object({ csv: z.string().min(1).max(500_000) });
const EsquemaSimular = z.object({
  capital: z.coerce.number().positive().max(100_000_000),
  tea: z.coerce.number().min(0).max(100),
  plazo: z.coerce.number().int().min(1).max(360).optional(),
  cuota_inicial: z.coerce.number().min(0).max(100_000_000).optional().default(0)
});
const EsquemaItemSGT = z.object({
  material_id: z.string().trim().min(1).max(120).optional(),
  codigo: z.string().trim().max(60).optional(),
  cantidad: z.coerce.number().min(0.01).max(100_000),
  precio_unit: z.coerce.number().min(0).max(10_000_000).optional(),
  descuento_pct: z.coerce.number().min(0).max(100).optional().default(0)
});
const EsquemaCrearCotSGT = z.object({
  cliente_id: z.string().uuid(),
  items: z.array(EsquemaItemSGT).min(1).max(200),
  cuota_inicial: z.coerce.number().min(0).max(100_000_000).optional().default(0),
  tea: z.coerce.number().min(0).max(100).optional().default(40),
  plazo: z.coerce.number().int().min(1).max(360).optional().default(9),
  proveedor: z.string().trim().max(200).optional().default(""),
  asesor: z.string().trim().max(200).optional().default(""),
  observaciones: z.string().trim().max(2000).optional().default(""),
  validez_dias: z.coerce.number().int().min(0).max(365).optional().default(15)
});
const EsquemaRegenerar = z.object({ cotizacion_id: z.string().uuid() });

// ---------------------------------------------------------------- handlers

async function hListarProveedoresSGT(args: z.infer<typeof EsquemaQ>, ctx: OperacionContext) {
  let q = ctx.service.from("proveedores").select("*").order("nombre").limit(args.limit);
  if (args.q) q = q.or(`nombre.ilike.%${args.q}%,ruc.ilike.%${args.q}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    interlocutor: p.interlocutor ?? p.contacto ?? null // alias SGT
  }));
}

async function hCrearProveedorSGT(args: z.infer<typeof EsquemaProveedorSGT>, ctx: OperacionContext) {
  // RUC 11 dígitos ya validado por zod; interlocutor texto min 2 ya validado.
  const { data, error } = await ctx.service.from("proveedores").insert({
    nombre: args.nombre,
    ruc: args.ruc,
    contacto: args.interlocutor, // columna base; interlocutor es alias SGT
    email: args.email || null,
    telefono: args.telefono || null
  }).select().single();
  if (error) {
    if (/duplicate|unique|ruc/i.test(error.message)) {
      const e = new Error(`RUC ya registrado: ${args.ruc}`) as Error & { status?: number };
      e.status = 409; throw e;
    }
    throw new Error(error.message);
  }
  return { ...(data as object), interlocutor: args.interlocutor };
}

async function hListarOficinasVentas(args: z.infer<typeof EsquemaQ>, ctx: OperacionContext) {
  // SGT real primero (mae_oficinas_ventas), fallback a tabla base.
  try {
    let q = ctx.service.from("mae_oficinas_ventas").select("*").order("nombre").limit(args.limit);
    if (args.q) q = q.or(`nombre.ilike.%${args.q}%,codigo_sap.ilike.%${args.q}%,id.ilike.%${args.q}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((o: Record<string, unknown>) => ({
      ...o,
      codigo: o.codigo_sap ?? o.codigo ?? null // alias para UI legacy
    }));
  } catch (e) {
    if (!esTablaFaltante(e)) throw e;
    const r = await leerPrimeraTabla(ctx, ["oficinas_ventas", "oficinas"], "*", { col: "nombre" }, args.limit);
    let rows = r.data as Record<string, unknown>[];
    if (args.q) {
      const s = args.q.toLowerCase();
      rows = rows.filter((o) => String(o.nombre ?? "").toLowerCase().includes(s));
    }
    return rows;
  }
}

async function hCrearOficina(args: z.infer<typeof EsquemaCrearOficina>, ctx: OperacionContext) {
  // ID correlativo OFVxxxx; codigo_sap único (409 si duplica).
  const { data: ex } = await ctx.service.from("mae_oficinas_ventas").select("id").limit(500);
  const id = siguienteId("OFV", ((ex ?? []) as { id?: string }[]).map((r) => r.id));
  const { data, error } = await ctx.service.from("mae_oficinas_ventas").insert({
    id,
    codigo_sap: args.codigo_sap,
    nombre: args.nombre,
    descripcion: args.descripcion || null,
    estado: "ACTIVO" // en creación siempre ACTIVO; el estado se cambia desde el listado
  }).select().single();
  if (error) {
    if (/duplicate|unique|llave duplicada/i.test(error.message)) {
      const e = new Error(`Código SAP ya registrado: ${args.codigo_sap}`) as Error & { status?: number };
      e.status = 409; throw e;
    }
    throw new Error(error.message);
  }
  return data;
}

async function hActualizarOficina(args: z.infer<typeof EsquemaActualizarOficina>, ctx: OperacionContext) {
  // codigo_sap inmutable: no se acepta en el patch.
  const patch: Record<string, unknown> = {};
  if (args.nombre !== undefined) patch.nombre = args.nombre;
  if (args.descripcion !== undefined) patch.descripcion = args.descripcion || null;
  if (args.estado !== undefined) patch.estado = args.estado;
  if (Object.keys(patch).length === 0) throw new Error("Nada que actualizar (nombre/descripcion/estado)");
  const { data, error } = await ctx.service.from("mae_oficinas_ventas").update(patch).eq("id", args.id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

const TABLAS_VINCULO = ["rel_proveedor_oficinas", "proveedor_oficina", "proveedor_oficinas", "oficina_proveedores", "proveedores_oficinas"];

async function hListarVinculaciones(args: z.infer<typeof EsquemaQ>, ctx: OperacionContext) {
  // SGT real con nombres de proveedor y oficina para la UI.
  try {
    let q = ctx.service.from("rel_proveedor_oficinas")
      .select("*, mae_proveedores(id,interlocutor,ruc,razon_social,nombre_comercial), mae_oficinas_ventas(id,codigo_sap,nombre)")
      .order("created_at", { ascending: false }).limit(args.limit);
    if (args.q) q = q.or(`id.ilike.%${args.q}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((v: Record<string, any>) => ({
      id: v.id,
      estado: v.estado,
      created_at: v.created_at,
      id_proveedor: v.id_proveedor,
      id_oficina: v.id_oficina,
      proveedor: v.mae_proveedores?.nombre_comercial || v.mae_proveedores?.razon_social || v.mae_proveedores?.interlocutor || v.id_proveedor,
      proveedor_ruc: v.mae_proveedores?.ruc ?? null,
      oficina: v.mae_oficinas_ventas?.nombre || v.id_oficina,
      oficina_sap: v.mae_oficinas_ventas?.codigo_sap ?? null
    }));
  } catch (e) {
    if (!esTablaFaltante(e)) throw e;
    // Fallback legacy: primera tabla vieja que exista.
    for (const t of TABLAS_VINCULO.slice(1)) {
      try {
        const { data, error } = await ctx.service.from(t).select("*").limit(args.limit);
        if (error) throw new Error(error.message);
        return data ?? [];
      } catch (e2) {
        if (!esTablaFaltante(e2)) throw e2;
      }
    }
    return [];
  }
}

async function hVincularProveedorOficina(args: z.infer<typeof EsquemaVinculo>, ctx: OperacionContext) {
  // SGT real: rel_proveedor_oficinas (POFxxxx, UNIQUE par). Inmutable: 409 si ya existe.
  try {
    const { data: ex, error: eSel } = await ctx.service.from("rel_proveedor_oficinas").select("id")
      .eq("id_proveedor", args.proveedor_id).eq("id_oficina", args.oficina_id).limit(1);
    if (eSel) throw new Error(eSel.message);
    if ((ex ?? []).length > 0) {
      const e = new Error(`Vínculo inmutable: ese proveedor ya está asignado a esa oficina`) as Error & { status?: number };
      e.status = 409; throw e;
    }
    const { data: ids } = await ctx.service.from("rel_proveedor_oficinas").select("id").limit(500);
    const id = siguienteId("POF", ((ids ?? []) as { id?: string }[]).map((r) => r.id));
    const { data, error: eIns } = await ctx.service.from("rel_proveedor_oficinas").insert({
      id, id_proveedor: args.proveedor_id, id_oficina: args.oficina_id, estado: "ACTIVO"
    }).select().single();
    if (eIns) {
      if (/duplicate|unique|llave duplicada/i.test(eIns.message)) {
        const e = new Error(`Vínculo inmutable: ese proveedor ya está asignado a esa oficina`) as Error & { status?: number };
        e.status = 409; throw e;
      }
      throw new Error(eIns.message);
    }
    return data;
  } catch (e) {
    if (!esTablaFaltante(e)) throw e;
    // Fallback legacy (ids numéricos).
    for (const t of TABLAS_VINCULO.slice(1)) {
      try {
        const num = (v: string) => { const n = parseInt(v, 10); if (!Number.isInteger(n)) throw new Error("IDs legacy deben ser numéricos"); return n; };
        const { data: ex, error: eSel } = await ctx.service.from(t).select("id")
          .eq("proveedor_id", num(args.proveedor_id)).eq("oficina_id", num(args.oficina_id)).limit(1);
        if (eSel) throw new Error(eSel.message);
        if ((ex ?? []).length > 0) {
          const e2 = new Error(`Vínculo inmutable: ese proveedor ya está asignado a esa oficina`) as Error & { status?: number };
          e2.status = 409; throw e2;
        }
        const { data, error: eIns } = await ctx.service.from(t).insert({
          proveedor_id: num(args.proveedor_id), oficina_id: num(args.oficina_id)
        }).select().single();
        if (eIns) throw new Error(eIns.message);
        return data;
      } catch (e2) {
        if (!esTablaFaltante(e2)) throw e2;
      }
    }
    throw new Error("Tabla de vínculo proveedor↔oficina no existe: ejecute supabase/schema_sgt360.sql");
  }
}

async function hListarGruposVendedores(args: z.infer<typeof EsquemaQ>, ctx: OperacionContext) {
  // SGT real con proveedor y oficina para la tabla.
  try {
    let q = ctx.service.from("mae_grupos_vendedores")
      .select("*, mae_proveedores(id,interlocutor,ruc,razon_social,nombre_comercial), mae_oficinas_ventas(id,codigo_sap,nombre)")
      .order("created_at", { ascending: false }).limit(args.limit);
    if (args.q) q = q.or(`nombre.ilike.%${args.q}%,codigo_sap.ilike.%${args.q}%,id.ilike.%${args.q}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((g: Record<string, any>) => ({
      id: g.id,
      codigo: g.codigo_sap,
      codigo_sap: g.codigo_sap,
      nombre: g.nombre,
      grupo: g.nombre,
      estado: g.estado,
      created_at: g.created_at,
      id_proveedor: g.id_proveedor,
      id_oficina: g.id_oficina,
      proveedor: g.mae_proveedores?.nombre_comercial || g.mae_proveedores?.razon_social || g.mae_proveedores?.interlocutor || g.id_proveedor,
      oficina: g.mae_oficinas_ventas?.nombre || g.id_oficina,
      oficina_sap: g.mae_oficinas_ventas?.codigo_sap ?? null
    }));
  } catch (e) {
    if (!esTablaFaltante(e)) throw e;
    const r = await leerPrimeraTabla(ctx, ["grupos_vendedores", "grupo_vendedores", "asesores"], "*", { col: "id" }, args.limit);
    return r.data;
  }
}

async function hCrearGrupoVendedores(args: z.infer<typeof EsquemaCrearGrupo>, ctx: OperacionContext) {
  // RESTRICCIÓN: la vinculación debe existir y estar ACTIVA. Proveedor+oficina inmutables tras guardar.
  const { data: vinc, error: eV } = await ctx.service.from("rel_proveedor_oficinas")
    .select("id_proveedor,id_oficina,estado").eq("id", args.vinculacion_id).single();
  if (eV || !vinc) {
    const e = new Error("Vinculación no encontrada") as Error & { status?: number };
    e.status = 404; throw e;
  }
  const v = vinc as { id_proveedor: string; id_oficina: string; estado: string };
  if (v.estado !== "ACTIVO") {
    const e = new Error("Debe existir al menos una vinculación activa entre proveedor y oficina antes de crear un grupo") as Error & { status?: number };
    e.status = 422; throw e;
  }
  const { data: ids } = await ctx.service.from("mae_grupos_vendedores").select("id").limit(500);
  const id = siguienteId("GVE", ((ids ?? []) as { id?: string }[]).map((r) => r.id));
  const { data, error } = await ctx.service.from("mae_grupos_vendedores").insert({
    id,
    codigo_sap: args.codigo_sap,
    nombre: args.nombre,
    id_proveedor: v.id_proveedor,
    id_oficina: v.id_oficina,
    estado: "ACTIVO"
  }).select().single();
  if (error) {
    if (/duplicate|unique|llave duplicada/i.test(error.message)) {
      const e = new Error(`Código SAP ya registrado: ${args.codigo_sap}`) as Error & { status?: number };
      e.status = 409; throw e;
    }
    throw new Error(error.message);
  }
  return data;
}

async function hActualizarGrupoVendedores(args: z.infer<typeof EsquemaActualizarGrupo>, ctx: OperacionContext) {
  // Proveedor y oficina inmutables: solo nombre y estado.
  const patch: Record<string, unknown> = {};
  if (args.nombre !== undefined) patch.nombre = args.nombre;
  if (args.estado !== undefined) patch.estado = args.estado;
  if (Object.keys(patch).length === 0) throw new Error("Nada que actualizar (nombre/estado)");
  const { data, error } = await ctx.service.from("mae_grupos_vendedores").update(patch).eq("id", args.id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function hListarAsignaciones(args: z.infer<typeof EsquemaVacio>, ctx: OperacionContext) {
  const limit = Number((args as { limit?: unknown }).limit ?? 200);
  try {
    const r = await leerPrimeraTabla(ctx, ["asignaciones", "vendedor_asignaciones"], "*", { col: "id" }, Math.min(Math.max(limit || 200, 1), 500));
    return r.data;
  } catch (e) {
    if (esTablaFaltante(e)) return []; // sin migración aún → lista vacía sin romper
    throw new Error((e as Error).message);
  }
}

async function hListarRolesSGT(_args: unknown, ctx: OperacionContext) {
  const { data, error } = await ctx.service.from("roles").select("*").order("nombre");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function hGetMatrizPermisos(_args: unknown, ctx: OperacionContext) {
  // 1) tabla dedicada si existe; 2) roles.permisos (seed.sql) como matriz.
  try {
    const r = await leerPrimeraTabla(ctx, ["matriz_permisos"], "*");
    return { fuente: r.tabla, matriz: r.data };
  } catch (e) {
    if (!esTablaFaltante(e)) throw new Error((e as Error).message);
  }
  const { data, error } = await ctx.service.from("roles").select("nombre,permisos");
  if (error) throw new Error(error.message);
  const matriz: Record<string, unknown> = {};
  for (const r of (data ?? []) as { nombre: string; permisos: unknown }[]) matriz[r.nombre] = r.permisos;
  return { fuente: "roles.permisos", matriz };
}

async function hListarMaterialesSGT(args: z.infer<typeof EsquemaMaterialesSGT>, ctx: OperacionContext) {
  const fecha = args.fecha ? normalizarFecha(args.fecha) : new Date().toISOString().slice(0, 10);
  let q = ctx.service.from("materiales").select("*, proveedores(id,nombre)").order("nombre").limit(args.limit);
  if (args.q) q = q.or(`nombre.ilike.%${args.q}%,codigo.ilike.%${args.q}%`);
  const { data: mats, error } = await q;
  if (error) throw new Error(error.message);
  // Tarifas vigentes por fecha (tablas opcionales).
  let tarifas: Record<string, unknown>[] = [];
  for (const t of ["tarifas", "material_tarifas", "tarifas_materiales"]) {
    const { data, error: eT } = await ctx.service.from(t).select("*").lte("vigente_desde", fecha).or(`vigente_hasta.is.null,vigente_hasta.gte.${fecha}`).limit(2000);
    if (!eT) { tarifas = ((data ?? []) as unknown) as Record<string, unknown>[]; break; }
    if (!esTablaFaltante(eT) && !/column|vigente_desde/i.test(eT.message)) throw new Error(eT.message);
    // si la tabla existe pero con otras columnas, se ignora y se usa precio base
    if (!esTablaFaltante(eT)) break;
  }
  const porMat = new Map<string, number>();
  for (const tf of tarifas) {
    const mid = String(tf.material_id ?? tf.material_codigo ?? tf.codigo ?? "");
    const p = Number(tf.precio ?? tf.precio_unit ?? tf.tarifa ?? NaN);
    if (mid && Number.isFinite(p)) porMat.set(mid, p);
  }
  return (mats ?? []).map((m: Record<string, unknown>) => {
    const keyId = String(m.id ?? "");
    const keyCod = String(m.codigo ?? "");
    const vigente = porMat.get(keyId) ?? porMat.get(keyCod);
    return { ...m, fecha_tarifa: fecha, precio_vigente: vigente ?? (m.precio_unit as number), tarifa_vigente: vigente != null };
  });
}

async function hCrearTarifa(args: z.infer<typeof EsquemaCrearTarifa>, ctx: OperacionContext) {
  const desde = normalizarFecha(args.vigente_desde);
  const hasta = args.vigente_hasta ? normalizarFecha(args.vigente_hasta) : null;
  if (hasta && hasta < desde) throw new Error("vigente_hasta anterior a vigente_desde");
  // Resolver material_id (acepta uuid o codigo).
  let materialId: string | null = null;
  if (args.material_id) {
    const { data } = await ctx.service.from("materiales").select("id,codigo").or(`id.eq.${args.material_id},codigo.eq.${args.material_id}`).maybeSingle();
    materialId = (data as { id?: string } | null)?.id ?? (/^[0-9a-f-]{36}$/i.test(args.material_id) ? args.material_id : null);
    if (!materialId) throw new Error(`Material no encontrado: ${args.material_id}`);
  } else if (args.codigo) {
    const { data, error } = await ctx.service.from("materiales").select("id").eq("codigo", args.codigo).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Material no encontrado: ${args.codigo}`);
    materialId = (data as { id: string }).id;
  }
  const tablas = ["tarifas", "material_tarifas"];
  let usada: string | null = null;
  for (const t of tablas) {
    try {
      // Cierra vigencia anterior solapada: filas abiertas o con fin >= desde.
      const { data: prev, error: eS } = await ctx.service.from(t).select("id,vigente_hasta").eq("material_id", materialId);
      if (eS) throw new Error(eS.message);
      for (const p of (prev ?? []) as { id: string; vigente_hasta: string | null }[]) {
        if (!p.vigente_hasta || p.vigente_hasta >= desde) {
          await ctx.service.from(t).update({ vigente_hasta: diaAnterior(desde) }).eq("id", p.id);
        }
      }
      const { data, error: eI } = await ctx.service.from(t).insert({
        material_id: materialId, precio: args.precio, vigente_desde: desde, vigente_hasta: hasta
      }).select().single();
      if (eI) throw new Error(eI.message);
      usada = t;
      return { tabla: usada, tarifa: data };
    } catch (e) {
      if (esTablaFaltante(e)) continue;
      throw e;
    }
  }
  throw new Error("Tabla de tarifas no existe: cree tarifas(id uuid, material_id uuid, precio numeric, vigente_desde date, vigente_hasta date null)");
}

async function hCargaMasivaTarifas(args: z.infer<typeof EsquemaCargaMasiva>, ctx: OperacionContext) {
  const lineas = args.csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lineas.length < 2) throw new Error("CSV vacío (se espera cabecera + filas)");
  const header = lineas[0].split(";").map((h) => h.trim().toLowerCase());
  const idxCod = header.findIndex((h) => ["codigo", "código", "material", "sku"].includes(h));
  const idxPre = header.findIndex((h) => ["precio", "tarifa", "precio_unit"].includes(h));
  const idxDes = header.findIndex((h) => ["vigente_desde", "desde", "inicio"].includes(h));
  const idxHas = header.findIndex((h) => ["vigente_hasta", "hasta", "fin"].includes(h));
  if (idxCod < 0 || idxPre < 0 || idxDes < 0) {
    throw new Error("Cabecera inválida. Use: codigo;precio;vigente_desde;vigente_hasta (fechas dd.mm.yyyy)");
  }
  const filas = lineas.slice(1);
  if (filas.length > 1000) {
    const e = new Error(`CSV supera el máximo de 1000 filas (${filas.length})`) as Error & { status?: number };
    e.status = 400; throw e;
  }
  const fechaRe = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  const validas: { codigo: string; precio: number; vigente_desde: string; vigente_hasta: string | null }[] = [];
  const errores: { fila: number; error: string }[] = [];
  filas.forEach((ln, i) => {
    const cols = ln.split(";");
    try {
      const codigo = (cols[idxCod] ?? "").trim();
      if (!codigo) throw new Error("codigo vacío");
      const precio = Number(String(cols[idxPre] ?? "").trim().replace(",", "."));
      if (!Number.isFinite(precio) || precio < 0) throw new Error(`precio inválido: ${cols[idxPre]}`);
      const fDes = (cols[idxDes] ?? "").trim();
      if (!fechaRe.test(fDes)) throw new Error(`vigente_desde debe ser dd.mm.yyyy: ${fDes}`);
      const fHas = idxHas >= 0 ? (cols[idxHas] ?? "").trim() : "";
      if (fHas && !fechaRe.test(fHas)) throw new Error(`vigente_hasta debe ser dd.mm.yyyy: ${fHas}`);
      validas.push({ codigo, precio, vigente_desde: normalizarFecha(fDes), vigente_hasta: fHas ? normalizarFecha(fHas) : null });
    } catch (e) {
      errores.push({ fila: i + 2, error: (e as Error).message });
    }
  });
  let insertadas = 0;
  const erroresInsercion: { fila: number; error: string }[] = [];
  for (const v of validas) {
    try {
      await hCrearTarifa({ codigo: v.codigo, precio: v.precio, vigente_desde: v.vigente_desde, vigente_hasta: v.vigente_hasta ?? undefined }, ctx);
      insertadas++;
    } catch (e) {
      erroresInsercion.push({ fila: 0, error: `${v.codigo}: ${(e as Error).message}` });
    }
  }
  return { total: filas.length, insertadas, errores_validacion: errores, errores_insercion: erroresInsercion };
}

async function hSimularFinanciamiento(args: z.infer<typeof EsquemaSimular>, _ctx: OperacionContext) {
  const tea = teaADecimal(args.tea);
  const capital = args.capital - (args.cuota_inicial ?? 0);
  if (capital <= 0) throw new Error("cuota_inicial debe ser menor que el total/capital");
  const tem = temDesdeTea(tea);
  const tabla = tablaSimulacion(capital, tea, PLAZOS_SIMULACION);
  const plazo = args.plazo ?? 9;
  const cuota = cuotaFrancesa(capital, tea, plazo);
  return { capital, cuota_inicial: args.cuota_inicial ?? 0, tea, tem, plazo, cuota_mensual: cuota, tabla };
}

async function hCrearCotizacionSGT(args: z.infer<typeof EsquemaCrearCotSGT>, ctx: OperacionContext) {
  const tea = teaADecimal(args.tea);
  // Resolver precios (si no viene precio_unit, usar catálogo).
  let subtotal = 0, descuento = 0;
  const itemsResueltos: { material_id: string | null; cantidad: number; precio_unit: number; descuento_pct: number; total_linea: number }[] = [];
  for (const it of args.items) {
    let precio = it.precio_unit;
    let materialId: string | null = null;
    if (precio == null || it.codigo || it.material_id) {
      const ref = it.material_id ?? it.codigo;
      if (ref) {
        const { data } = await ctx.service.from("materiales").select("id,precio_unit").or(`id.eq.${ref},codigo.eq.${ref}`).maybeSingle();
        if (data) {
          materialId = (data as { id: string }).id;
          precio ??= Number((data as { precio_unit: number }).precio_unit);
        } else if (/^[0-9a-f-]{36}$/i.test(String(ref))) {
          materialId = String(ref);
        }
      }
    }
    if (precio == null || !Number.isFinite(precio)) throw new Error(`Precio no resoluble para ítem ${it.codigo ?? it.material_id ?? "?"}`);
    const dscto = it.descuento_pct ?? 0;
    const bruto = it.cantidad * precio;
    const neto = Math.round(bruto * (1 - dscto / 100) * 100) / 100;
    subtotal += bruto; descuento += bruto - neto;
    itemsResueltos.push({ material_id: materialId, cantidad: it.cantidad, precio_unit: precio, descuento_pct: dscto, total_linea: neto });
  }
  subtotal = Math.round(subtotal * 100) / 100;
  descuento = Math.round(descuento * 100) / 100;
  const total = Math.round((subtotal - descuento) * 100) / 100;
  const capital = Math.round((total - (args.cuota_inicial ?? 0)) * 100) / 100;
  if (capital <= 0) throw new Error("cuota_inicial debe ser menor que el total");
  const cuota = cuotaFrancesa(capital, tea, args.plazo);
  const tabla = tablaSimulacion(capital, tea, PLAZOS_SIMULACION);

  // Correlativo COT-AMCA-xxxxx (tolerante a concurrencia media).
  const { data: prev } = await ctx.service.from("cotizaciones").select("codigo").like("codigo", "COT-AMCA-%").limit(5000);
  const numero = siguienteCodigoAMCA(((prev ?? []) as { codigo: string }[]).map((r) => r.codigo));

  // Insert cabecera: intenta con columnas SGT; si no existen, inserta base.
  const extra = {
    codigo: numero,
    cliente_id: args.cliente_id,
    estado: "BORRADOR",
    observaciones: args.observaciones ?? "",
    validez_dias: args.validez_dias ?? 15,
    created_by: ctx.sesion.userId,
    subtotal, total,
    cuota_inicial: args.cuota_inicial ?? 0,
    capital, tea, plazo: args.plazo,
    cuota_mensual: cuota,
    proveedor: args.proveedor || null,
    asesor: args.asesor || null,
    descuento
  };
  let cab: { id: string } | null = null;
  {
    const { data, error } = await ctx.service.from("cotizaciones").insert(extra).select("id").single();
    if (!error && data) {
      cab = data as { id: string };
    } else if (error && /column|schema cache/i.test(error.message)) {
      const base = { codigo: numero, cliente_id: extra.cliente_id, estado: "BORRADOR", observaciones: extra.observaciones, validez_dias: extra.validez_dias, created_by: extra.created_by };
      const r2 = await ctx.service.from("cotizaciones").insert(base).select("id").single();
      if (r2.error || !r2.data) throw new Error(r2.error?.message ?? "No se pudo crear cotización SGT");
      cab = r2.data as { id: string };
    } else if (error) {
      throw new Error(error.message);
    }
  }
  const cotId = cab!.id;
  const { error: eItems } = await ctx.service.from("cotizacion_items").insert(
    itemsResueltos.map((it) => ({ cotizacion_id: cotId, ...it }))
  );
  if (eItems) throw new Error(eItems.message);
  // Guarda simulación (best-effort, tablas opcionales).
  for (const t of ["cotizacion_simulaciones", "cotizacion_financiamiento"]) {
    try {
      const { error: eSim } = await ctx.service.from(t).insert({
        cotizacion_id: cotId, capital, tea, plazo: args.plazo, cuota_mensual: cuota, tabla
      });
      if (!eSim) break;
      if (!esTablaFaltante(eSim)) break;
    } catch {
      break;
    }
  }
  const [{ data: final }, { data: items }] = await Promise.all([
    ctx.service.from("cotizaciones").select("*, clientes(id,nombres,dni,email,telefono)").eq("id", cotId).single(),
    ctx.service.from("cotizacion_items").select("*, materiales(codigo,nombre,unidad)").eq("cotizacion_id", cotId)
  ]);
  return {
    ...(final as object), numero, subtotal, descuento, total, capital,
    financiamiento: { cuota_inicial: args.cuota_inicial ?? 0, capital, tea, tem: temDesdeTea(tea), plazo: args.plazo, cuota_mensual: cuota, tabla },
    items: items ?? []
  };
}

async function hRegenerarPDF(args: z.infer<typeof EsquemaRegenerar>, ctx: OperacionContext) {
  const { data: cot, error } = await ctx.service.from("cotizaciones").select("*, clientes(*)").eq("id", args.cotizacion_id).single();
  if (error || !cot) throw new Error("Cotización no encontrada");
  const { data: items } = await ctx.service.from("cotizacion_items")
    .select("*, materiales(codigo,nombre,unidad)").eq("cotizacion_id", args.cotizacion_id);
  const c = cot as Record<string, unknown>;
  const capital = Number(c.capital ?? c.total ?? 0);
  const teaRaw = Number(c.tea ?? 0.40);
  const tea = teaRaw > 1 ? teaRaw / 100 : teaRaw || 0.40;
  const plazo = Number(c.plazo ?? 9);
  let financiamiento: Record<string, unknown> | null = null;
  for (const t of ["cotizacion_simulaciones", "cotizacion_financiamiento"]) {
    const { data } = await ctx.service.from(t).select("*").eq("cotizacion_id", args.cotizacion_id).order("created_at", { ascending: false }).limit(1);
    if (data && data.length > 0) { financiamiento = data[0] as Record<string, unknown>; break; }
  }
  if (!financiamiento && capital > 0) {
    financiamiento = {
      capital, tea, plazo,
      cuota_mensual: cuotaFrancesa(capital, tea, plazo),
      tabla: tablaSimulacion(capital, tea, PLAZOS_SIMULACION)
    };
  }
  return {
    cotizacion: { ...c, items: items ?? [] },
    cliente: (c as { clientes?: unknown }).clientes ?? null,
    items: items ?? [],
    financiamiento,
    filename: `cotizacion-${String((c.codigo as string) ?? c.id).replace(/[^A-Za-z0-9.-]+/g, "-")}.pdf`
  };
}

// ---------------------------------------------------------------- clientes SGT (mae_clientes)

const EsquemaFiltrosClientesSGT = z.object({
  q: z.string().trim().max(200).optional().default(""),
  tipo_persona: z.string().trim().max(20).optional().default(""),
  tipo_doc: z.string().trim().max(20).optional().default(""),
  estado: z.string().trim().max(20).optional().default(""),
  revision: z.string().trim().max(20).optional().default(""), // Validado | Pendiente | ""
  limit: zLimit,
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25)
});

const EsquemaCrearClienteSGT = z.object({
  tipo_persona: z.enum(["NATURAL", "JURIDICA"]),
  tipo_doc: z.string().trim().min(1).max(20),
  nro_doc: z.string().trim().min(1).max(20),
  nombre_razon_social: z.string().trim().min(2).max(300),
  contacto: z.string().trim().max(300).optional().default(""),
  correo: z.string().trim().email().max(160).optional().or(z.literal("")).default(""),
  telefono: z.string().trim().max(30).optional().default(""),
  codigo_sap: z.string().trim().max(30).optional().default("")
});

const EsquemaActualizarClienteSGT = z.object({
  id: z.string().trim().min(1).max(20),
  nombre_razon_social: z.string().trim().min(2).max(300).optional(),
  contacto: z.string().trim().max(300).optional(),
  correo: z.string().trim().email().max(160).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional(),
  codigo_sap: z.string().trim().max(30).optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]).optional()
});

const EsquemaCargaClientes = z.object({
  csv: z.string().min(1).max(2_000_000),
  validar_sap: z.coerce.boolean().optional().default(true)
});
const EsquemaValidarClientes = z.object({ csv: z.string().min(1).max(2_000_000) });

/** Revisión comercial: con código SAP queda Validado, sin él queda Pendiente. */
export function revisionCliente(codigoSap: unknown): "Validado" | "Pendiente" {
  return String(codigoSap ?? "").trim() ? "Validado" : "Pendiente";
}

interface FilaClienteCSV {
  fila: number;
  tipo_persona: string;
  tipo_doc: string;
  nro_doc: string;
  nombre_razon_social: string;
  contacto: string;
  correo: string;
  telefono: string;
  codigo_sap: string;
}

function parseCSVClientes(csv: string): { filas: FilaClienteCSV[]; errores: string[] } {
  const lineas = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errores: string[] = [];
  if (lineas.length < 2) return { filas: [], errores: ["Archivo vacío o sin filas de datos"] };
  const sep = (lineas[0].match(/;/g) ?? []).length >= (lineas[0].match(/,/g) ?? []).length ? ";" : ",";
  const head = lineas[0].split(sep).map((h) => h.trim().toLowerCase());
  const idx = (nombres: string[]) => {
    for (const n of nombres) {
      const i = head.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iTip = idx(["tipo_persona", "tipopersona", "tipo"]);
  const iDoc = idx(["tipo_documento", "tipodocumento", "tipo_doc", "documento_tipo"]);
  const iNro = idx(["numero_documento", "numerodocumento", "nro_doc", "nrodoc", "documento", "dni"]);
  const iNom = idx(["nombre_razon_social", "nombre", "razon_social", "razonsocial", "cliente"]);
  const iCon = idx(["contacto", "nombre_contacto"]);
  const iCor = idx(["correo", "email", "mail"]);
  const iTel = idx(["telefono", "teléfono", "celular"]);
  const iSap = idx(["codigo_sap", "codigosap", "sap", "codigo_cliente_sap"]);
  if (iNro < 0 || iNom < 0) {
    return { filas: [], errores: ["Cabecera inválida: se requiere al menos numero_documento y nombre_razon_social (usa la plantilla oficial)"] };
  }
  if (lineas.length - 1 > 500) {
    return { filas: [], errores: ["Máximo 500 filas por archivo"] };
  }
  const filas: FilaClienteCSV[] = [];
  lineas.slice(1).forEach((ln, k) => {
    const c = ln.split(sep).map((x) => x.trim());
    const nro = c[iNro] ?? "";
    const nom = c[iNom] ?? "";
    if (!nro && !nom) return; // línea vacía
    const tip = (c[iTip] ?? "").toUpperCase() || "NATURAL";
    if (!["NATURAL", "JURIDICA"].includes(tip)) {
      errores.push(`Fila ${k + 2}: tipo_persona debe ser NATURAL o JURIDICA`);
      return;
    }
    if (!nro) { errores.push(`Fila ${k + 2}: numero_documento obligatorio`); return; }
    if (nom.length < 2) { errores.push(`Fila ${k + 2}: nombre_razon_social muy corto`); return; }
    const cor = c[iCor] ?? "";
    if (cor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cor)) { errores.push(`Fila ${k + 2}: correo inválido`); return; }
    filas.push({
      fila: k + 2,
      tipo_persona: tip,
      tipo_doc: c[iDoc] || "DNI",
      nro_doc: nro,
      nombre_razon_social: nom,
      contacto: c[iCon] ?? "",
      correo: cor,
      telefono: c[iTel] ?? "",
      codigo_sap: c[iSap] ?? ""
    });
  });
  return { filas, errores };
}

async function hListarClientesSGT(args: z.infer<typeof EsquemaFiltrosClientesSGT>, ctx: OperacionContext) {
  try {
    const desde = (args.page - 1) * args.pageSize;
    let q = ctx.service.from("mae_clientes").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (args.q) q = q.or(`nombre_razon_social.ilike.%${args.q}%,nro_doc.ilike.%${args.q}%,codigo_sap.ilike.%${args.q}%,contacto.ilike.%${args.q}%`);
    if (args.tipo_persona) q = q.eq("tipo_persona", args.tipo_persona.toUpperCase());
    if (args.tipo_doc) q = q.eq("tipo_doc", args.tipo_doc.toUpperCase());
    if (args.estado) q = q.eq("estado", args.estado.toUpperCase());
    if (args.revision === "Validado") q = q.not("codigo_sap", "is", null).neq("codigo_sap", "");
    if (args.revision === "Pendiente") q = q.or("codigo_sap.is.null,codigo_sap.eq.");
    const { data, error, count } = await q.range(desde, desde + args.pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      ...r,
      revision_label: revisionCliente(r.codigo_sap)
    }));
    return { rows, total: count ?? rows.length, page: args.page, pageSize: args.pageSize };
  } catch (e) {
    if (!esTablaFaltante(e)) throw e;
    // Fallback tabla base.
    const r = await leerPrimeraTabla(ctx, ["clientes"], "*", { col: "created_at" }, args.limit);
    const rows = (r.data as Record<string, unknown>[]).map((c) => ({
      id: c.id,
      tipo_persona: "NATURAL",
      tipo_doc: "DNI",
      nro_doc: c.dni ?? c.documento ?? "",
      nombre_razon_social: c.nombres ?? c.nombre ?? "",
      contacto: "",
      correo: c.email ?? "",
      telefono: c.telefono ?? "",
      codigo_sap: null,
      revision_label: "Pendiente" as const,
      estado: "ACTIVO"
    }));
    return { rows, total: rows.length, page: 1, pageSize: args.pageSize };
  }
}

async function hCrearClienteSGT(args: z.infer<typeof EsquemaCrearClienteSGT>, ctx: OperacionContext) {
  const { data: ex } = await ctx.service.from("mae_clientes").select("id").limit(500);
  const id = siguienteId("CLI", ((ex ?? []) as { id?: string }[]).map((r) => r.id), 6);
  const { data, error } = await ctx.service.from("mae_clientes").insert({
    id,
    tipo_persona: args.tipo_persona,
    tipo_doc: args.tipo_doc.toUpperCase(),
    nro_doc: args.nro_doc,
    nombre_razon_social: args.nombre_razon_social,
    contacto: args.contacto || null,
    correo: args.correo || null,
    telefono: args.telefono || null,
    codigo_sap: args.codigo_sap || null,
    estado: "ACTIVO"
  }).select().single();
  if (error) {
    if (/duplicate|unique|llave duplicada/i.test(error.message)) {
      const e = new Error(`Documento ya registrado: ${args.tipo_doc} ${args.nro_doc}`) as Error & { status?: number };
      e.status = 409; throw e;
    }
    throw new Error(error.message);
  }
  return data;
}

async function hActualizarClienteSGT(args: z.infer<typeof EsquemaActualizarClienteSGT>, ctx: OperacionContext) {
  const patch: Record<string, unknown> = {};
  if (args.nombre_razon_social !== undefined) patch.nombre_razon_social = args.nombre_razon_social;
  if (args.contacto !== undefined) patch.contacto = args.contacto || null;
  if (args.correo !== undefined) patch.correo = args.correo || null;
  if (args.telefono !== undefined) patch.telefono = args.telefono || null;
  if (args.codigo_sap !== undefined) patch.codigo_sap = args.codigo_sap || null;
  if (args.estado !== undefined) patch.estado = args.estado;
  if (Object.keys(patch).length === 0) throw new Error("Nada que actualizar");
  const { data, error } = await ctx.service.from("mae_clientes").update(patch).eq("id", args.id).select().single();
  if (error) {
    if (/duplicate|unique|llave duplicada/i.test(error.message)) {
      const e = new Error("Código SAP ya asignado a otro cliente") as Error & { status?: number };
      e.status = 409; throw e;
    }
    throw new Error(error.message);
  }
  return data;
}

async function hValidarArchivoClientes(args: z.infer<typeof EsquemaValidarClientes>) {
  const { filas, errores } = parseCSVClientes(args.csv);
  return { total: filas.length + errores.length, validas: filas.length, errores };
}

async function hCargaMasivaClientes(args: z.infer<typeof EsquemaCargaClientes>, ctx: OperacionContext) {
  const { filas, errores } = parseCSVClientes(args.csv);
  let insertadas = 0;
  const duenos: string[] = [...errores];
  const { data: ex } = await ctx.service.from("mae_clientes").select("id").limit(2000);
  let corr = ((ex ?? []) as { id?: string }[]).map((r) => r.id);
  for (const f of filas) {
    try {
      const id = siguienteId("CLI", corr, 6);
      const { error } = await ctx.service.from("mae_clientes").insert({
        id,
        tipo_persona: f.tipo_persona,
        tipo_doc: f.tipo_doc.toUpperCase(),
        nro_doc: f.nro_doc,
        nombre_razon_social: f.nombre_razon_social,
        contacto: f.contacto || null,
        correo: f.correo || null,
        telefono: f.telefono || null,
        codigo_sap: f.codigo_sap || null,
        estado: "ACTIVO"
      });
      if (error) throw new Error(error.message);
      corr = [...corr, id];
      insertadas++;
    } catch (e) {
      duenos.push(`Fila ${f.fila}: ${(e as Error).message}`);
    }
  }
  return {
    total: filas.length,
    insertadas,
    validacion_sap: args.validar_sap ? "auto" : "manual",
    errores: duenos
  };
}

// ---------------------------------------------------------------- mapa

export const OPERACIONES_SGT: Record<string, DefOp> = {
  listarProveedoresSGT: { descripcion: "SGT: lista proveedores (+interlocutor)", roles: TODOS, schema: EsquemaQ, handler: hListarProveedoresSGT },
  crearProveedorSGT: { descripcion: "SGT: crea proveedor (RUC 11 dígitos + interlocutor)", roles: OPERATIVO, schema: EsquemaProveedorSGT, handler: hCrearProveedorSGT },
  listarOficinasVentas: { descripcion: "SGT: lista oficinas de ventas", roles: TODOS, schema: EsquemaQ, handler: hListarOficinasVentas },
  crearOficina: { descripcion: "SGT: crea oficina de ventas (codigo_sap único)", roles: SOLO_ADMIN, schema: EsquemaCrearOficina, handler: hCrearOficina },
  actualizarOficina: { descripcion: "SGT: actualiza oficina (codigo_sap inmutable)", roles: SOLO_ADMIN, schema: EsquemaActualizarOficina, handler: hActualizarOficina },
  listarVinculaciones: { descripcion: "SGT: lista vinculaciones proveedor↔oficina", roles: TODOS, schema: EsquemaQ, handler: hListarVinculaciones },
  vincularProveedorOficina: { descripcion: "SGT: vincula proveedor↔oficina (inmutable)", roles: SOLO_ADMIN, schema: EsquemaVinculo, handler: hVincularProveedorOficina },
  listarGruposVendedores: { descripcion: "SGT: lista grupos de vendedores", roles: TODOS, schema: EsquemaQ, handler: hListarGruposVendedores },
  crearGrupoVendedores: { descripcion: "SGT: crea grupo (requiere vinculación activa)", roles: SOLO_ADMIN, schema: EsquemaCrearGrupo, handler: hCrearGrupoVendedores },
  actualizarGrupoVendedores: { descripcion: "SGT: actualiza grupo (proveedor/oficina inmutables)", roles: SOLO_ADMIN, schema: EsquemaActualizarGrupo, handler: hActualizarGrupoVendedores },
  listarClientesSGT: { descripcion: "SGT: lista clientes con filtros y paginación", roles: TODOS, schema: EsquemaFiltrosClientesSGT, handler: hListarClientesSGT },
  crearClienteSGT: { descripcion: "SGT: crea cliente (documento único, SAP opcional)", roles: OPERATIVO, schema: EsquemaCrearClienteSGT, handler: hCrearClienteSGT },
  actualizarClienteSGT: { descripcion: "SGT: actualiza cliente (estado/SAP/datos)", roles: OPERATIVO, schema: EsquemaActualizarClienteSGT, handler: hActualizarClienteSGT },
  validarArchivoClientes: { descripcion: "SGT: valida CSV/XLSX de clientes sin guardar", roles: OPERATIVO, schema: EsquemaValidarClientes, handler: hValidarArchivoClientes },
  cargaMasivaClientes: { descripcion: "SGT: carga masiva clientes (máx 500)", roles: OPERATIVO, schema: EsquemaCargaClientes, handler: hCargaMasivaClientes },
  listarAsignaciones: { descripcion: "SGT: lista asignaciones", roles: TODOS, schema: EsquemaVacio, handler: hListarAsignaciones },
  listarRolesSGT: { descripcion: "SGT: lista roles", roles: TODOS, schema: EsquemaVacio, handler: hListarRolesSGT },
  getMatrizPermisos: { descripcion: "SGT: matriz de permisos por rol", roles: TODOS, schema: EsquemaVacio, handler: hGetMatrizPermisos },
  listarMaterialesSGT: { descripcion: "SGT: materiales con tarifa vigente por fecha", roles: TODOS, schema: EsquemaMaterialesSGT, handler: hListarMaterialesSGT },
  crearTarifa: { descripcion: "SGT: crea tarifa (cierra vigencia solapada)", roles: OPERATIVO, schema: EsquemaCrearTarifa, handler: hCrearTarifa },
  cargaMasivaTarifas: { descripcion: "SGT: carga masiva CSV (dd.mm.yyyy, máx 1000)", roles: OPERATIVO, schema: EsquemaCargaMasiva, handler: hCargaMasivaTarifas },
  simularFinanciamiento: { descripcion: "SGT: simula financiamiento (francés)", roles: TODOS, schema: EsquemaSimular, handler: hSimularFinanciamiento },
  crearCotizacionSGT: { descripcion: "SGT: crea cotización COT-AMCA-xxxx + simulación", roles: OPERATIVO, schema: EsquemaCrearCotSGT, handler: hCrearCotizacionSGT },
  regenerarPDF: { descripcion: "SGT: payload para regenerar PDF", roles: TODOS, schema: EsquemaRegenerar, handler: hRegenerarPDF }
};

export function listarOperacionesSGTPermitidas(rol: RolUsuario): string[] {
  return Object.entries(OPERACIONES_SGT).filter(([, d]) => d.roles.includes(rol)).map(([k]) => k);
}

export async function ejecutarOperacionSeguraSGT(
  operacion: string, argumentos: unknown, ctx: OperacionContext
): Promise<{ ok: true; datos: unknown }> {
  const def = OPERACIONES_SGT[operacion];
  if (!def) {
    const e = new Error(`Operación desconocida: ${operacion}`) as Error & { status?: number };
    e.status = 404; throw e;
  }
  if (!def.roles.includes(ctx.sesion.rol)) {
    const e = new Error(`Rol '${ctx.sesion.rol}' sin permiso para '${operacion}'`) as Error & { status?: number };
    e.status = 403; throw e;
  }
  const parsed = def.schema.safeParse(argumentos ?? {});
  if (!parsed.success) {
    const e = new Error(`Argumentos inválidos: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`) as Error & { status?: number };
    e.status = 400; throw e;
  }
  const datos = await def.handler(parsed.data, ctx);
  return { ok: true, datos };
}
