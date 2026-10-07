import { z } from "zod";
import type { RolUsuario } from "./auth";
import type { OperacionContext } from "./operaciones";

/**
 * lib/operacionesVentas.ts — Operaciones del módulo Ventas (prefijo VTA-).
 * NO modifica route.ts ni otros lib; este mapa lo fusiona el coordinador en /api/operacion.
 * Todos los handlers usan service_role (ctx.service) y son tolerantes a la
 * ausencia de las tablas vta_*: si no existen, lanzan error claro
 * "ejecute supabase/schema_ventas.sql" en lugar de romper con 42P01.
 *
 * Tablas reales (supabase/schema_ventas.sql):
 *   vta_solicitudes_venta(id text PK 'VTA-000001', numero_pedido unique null,
 *     id_cliente text, id_proveedor text null, canal, es_microaliado bool,
 *     visita_estado, proyecto_financiado bool, pago_modo, tea numeric DEFAULT 40,
 *     observaciones, adjunto_cotizacion_url, adjunto_dni_url,
 *     estado IN (borrador,pendiente_aprobacion,observado,aprobada,en_instalacion,instalada,validada_proveedor,cerrada),
 *     observacion_admin null, created_by uuid, created_at/updated_at)
 *   vta_venta_items(id serial, solicitud_id FK CASCADE, id_material,
 *     cantidad, precio_unit, descuento_monto DEFAULT 0, modo, medio_pago,
 *     subtotal, numero_pedido_venta UNIQUE parcial, numero_pedido_abono null)
 *   vta_abonos(id serial, solicitud_id FK CASCADE, item_id null, monto>0,
 *     medio, comprobante_url, estado IN (pendiente,efectuado,validado),
 *     observacion (migración), created_by, created_at)
 *   vta_instalaciones(id serial, solicitud_id UNIQUE FK CASCADE, foto_antes_url,
 *     foto_despues_url, boleta_url, acta_url,
 *     estado IN (pendiente,registrada,validada_proveedor,observada,cerrada),
 *     observacion null)
 */

type Handler = (args: any, ctx: OperacionContext) => Promise<unknown>;
interface DefOp { descripcion: string; roles: RolUsuario[]; schema: z.ZodTypeAny; handler: Handler; }

const TODOS: RolUsuario[] = ["admin", "asesor", "oficina"];
const OPERATIVO: RolUsuario[] = ["admin", "asesor"];
const SOLO_ADMIN: RolUsuario[] = ["admin"];

const MSG_SCHEMA = "Tablas de ventas no existen: ejecute supabase/schema_ventas.sql";

const T_SOL = "vta_solicitudes_venta";
const T_ITEM = "vta_venta_items";
const T_ABO = "vta_abonos";
const T_INS = "vta_instalaciones";

/** Estados de solicitud (9, igual que SQL): borrador → pendiente_aprobacion → aprobada/observado → instalada → validada_proveedor → liquidada. */
export const ESTADOS_SOLICITUD = [
  "borrador",
  "pendiente_aprobacion",
  "observado",
  "aprobada",
  "en_instalacion",
  "instalada",
  "validada_proveedor",
  "cerrada",
  "liquidada",
] as const;

/** Estados de abono (3, igual que SQL). */
export const ESTADOS_ABONO = ["pendiente", "efectuado", "validado"] as const;

/** Estados de instalación (5, igual que SQL). */
export const ESTADOS_INSTALACION = [
  "pendiente",
  "registrada",
  "validada_proveedor",
  "observada",
  "cerrada",
] as const;

const zLimit = z.coerce.number().int().min(1).max(500).default(100);
const zPage = z.coerce.number().int().min(1).optional().default(1);
const zPageSize = z.coerce.number().int().min(1).max(200).optional().default(25);
const zUrlDoc = z.string().trim().min(8).max(2000);

// ---------------------------------------------------------------- utils

function lanzar(status: number, message: string): never {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  throw e;
}

/** ¿El error es "tabla no existe"? (PostgREST / Postgres 42P01). */
function esTablaFaltante(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e ?? "");
  return /does not exist|Could not find the table|relation .* does not exist|42P01/i.test(m);
}

/** Traduce error de tabla faltante al mensaje claro de ventas; re-lanza el resto. */
function exigirTabla(e: unknown): never {
  if (esTablaFaltante(e)) lanzar(500, MSG_SCHEMA);
  if (e instanceof Error && (e as Error & { status?: number }).status) throw e;
  throw new Error((e as Error)?.message ?? String(e));
}

/** Siguiente correlativo VTA-xxxxxx (6 dígitos), ej. VTA-000123. */
function siguienteVTA(existentes: (string | null | undefined)[], pad = 6): string {
  let max = 0;
  for (const c of existentes) {
    const m = /^VTA-(\d{1,10})$/.exec(String(c ?? "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `VTA-${String(max + 1).padStart(pad, "0")}`;
}

function red2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Siguiente id con prefijo (CLI/PRV/MAT- + dígitos), ej. CLI001449. */
function siguienteId(prefijo: string, existentes: (string | null | undefined)[], pad = 4): string {
  let max = 0;
  const re = new RegExp(`^${prefijo.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\d{${pad}})$`);
  for (const c of existentes) {
    const m = re.exec(String(c ?? "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefijo}${String(max + 1).padStart(pad, "0")}`;
}

/** Scope por rol: asesor/oficina solo ven lo creado por ellos (created_by propio). */
function esAdmin(ctx: OperacionContext): boolean {
  return ctx.sesion.rol === "admin";
}

type Fila = Record<string, any>;

/** Resuelve nombres de cliente/proveedor/asesor/creador best-effort (mae_* primero, base después). */
async function resolverNombres(
  ctx: OperacionContext,
  filas: Fila[]
): Promise<Map<string, { cliente: string | null; documento: string | null; proveedor: string | null; asesor: string | null; creado_por: string | null }>> {
  const idsCli = [...new Set(filas.map((r) => String(r.id_cliente ?? "")).filter(Boolean))];
  const idsProv = [...new Set(filas.map((r) => String(r.id_proveedor ?? "")).filter(Boolean))];
  const idsAse = [...new Set(filas.map((r) => String(r.id_asesor ?? "")).filter(Boolean))];
  const idsCreador = [...new Set(filas.map((r) => String(r.created_by ?? "")).filter(Boolean))];
  const out = new Map<string, { cliente: string | null; documento: string | null; proveedor: string | null; asesor: string | null; creado_por: string | null }>();
  const svc = ctx.service as unknown as { from(t: string): any };

  async function buscarEn(tablas: string[], ids: string[], cols: string): Promise<Fila[]> {
    for (const t of tablas) {
      try {
        const { data, error } = await svc.from(t).select(cols).in("id", ids.length ? ids : ["__ninguno__"]);
        if (error) throw new Error(error.message);
        return (data ?? []) as Fila[];
      } catch (e) {
        if (!esTablaFaltante(e)) throw e;
      }
    }
    return [];
  }

  const [cliMae, cliBase] = idsCli.length
    ? await Promise.all([
        buscarEn(["mae_clientes"], idsCli, "id,nombre_razon_social,nro_doc").catch(() => [] as Fila[]),
        buscarEn(["clientes"], idsCli, "id,nombres,dni").catch(() => [] as Fila[]),
      ])
    : [[], []];
  const [provMae, provBase] = idsProv.length
    ? await Promise.all([
        buscarEn(["mae_proveedores"], idsProv, "id,nombre_comercial,razon_social,interlocutor,ruc").catch(() => [] as Fila[]),
        buscarEn(["proveedores"], idsProv, "id,nombre,ruc").catch(() => [] as Fila[]),
      ])
    : [[], []];
  const mCli = new Map<string, Fila>([...cliMae, ...cliBase].map((c) => [String(c.id), c]));
  const mProv = new Map<string, Fila>([...provMae, ...provBase].map((p) => [String(p.id), p]));
  const mAse = new Map<string, Fila>();
  if (idsAse.length) {
    const { data } = await svc.from("seg_usuarios").select("id,nombre").in("id", idsAse).catch(() => ({ data: [] as Fila[] }));
    for (const u of ((data ?? []) as Fila[])) mAse.set(String(u.id), u);
  }
  const mCreador = new Map<string, Fila>();
  if (idsCreador.length) {
    const { data } = await svc.from("profiles").select("id,nombre").in("id", idsCreador).catch(() => ({ data: [] as Fila[] }));
    for (const u of ((data ?? []) as Fila[])) mCreador.set(String(u.id), u);
  }

  for (const r of filas) {
    const c = mCli.get(String(r.id_cliente ?? ""));
    const p = mProv.get(String(r.id_proveedor ?? ""));
    const a = mAse.get(String(r.id_asesor ?? ""));
    const cr = mCreador.get(String(r.created_by ?? ""));
    out.set(String(r.id), {
      cliente: (c?.nombre_razon_social ?? c?.nombres ?? null) as string | null,
      documento: (c?.nro_doc ?? c?.dni ?? null) as string | null,
      proveedor: (p?.nombre_comercial ?? p?.razon_social ?? p?.interlocutor ?? p?.nombre ?? null) as string | null,
      asesor: (a?.nombre ?? null) as string | null,
      creado_por: (cr?.nombre ?? null) as string | null,
    });
  }
  return out;
}

/** Aviso por correo a admin (best-effort: nunca rompe la operación). */
async function avisarAbonoAdmin(args: {
  solicitud_id: string;
  monto: number;
  medio: string;
  abono_id: string;
}): Promise<"enviado" | "omitido"> {
  try {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, VENTAS_ADMIN_EMAIL, ADMIN_EMAIL } = process.env;
    const destino = VENTAS_ADMIN_EMAIL || ADMIN_EMAIL || SMTP_FROM || SMTP_USER;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !destino) return "omitido";
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT || 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: destino,
      subject: `Nuevo abono pendiente — solicitud ${args.solicitud_id}`,
      text: `Se registró un abono pendiente de validación.\n\nSolicitud: ${args.solicitud_id}\nAbono: ${args.abono_id}\nMonto: ${args.monto}\nMedio: ${args.medio}`,
    });
    return "enviado";
  } catch {
    return "omitido";
  }
}

// ---------------------------------------------------------------- schemas

const EsquemaListarVentas = z.object({
  q: z.string().trim().max(120).optional().default(""),
  estado: z.string().trim().max(40).optional().default(""),
  canal: z.string().trim().max(40).optional().default(""),
  limit: zLimit,
  page: zPage,
  pageSize: zPageSize,
});

const EsquemaItemVenta = z.object({
  id_material: z.string().trim().min(1).max(120),
  cantidad: z.coerce.number().gt(0).max(100_000),
  precio_unit: z.coerce.number().min(0).max(10_000_000),
  descuento_monto: z.coerce.number().min(0).max(10_000_000).optional().default(0),
  modo: z.enum(["financiado", "contado"]),
  medio_pago: z.string().trim().min(1).max(60),
});

const EsquemaCrearSolicitud = z.object({
  id_cliente: z.string().trim().min(1).max(60),
  id_proveedor: z.string().trim().min(1).max(60).optional().nullable(),
  canal: z.enum(["proveedor", "microaliado", "contratista"]),
  es_microaliado: z.coerce.boolean().optional().default(false),
  visita_estado: z.enum(["visitado", "agendado"]),
  pago_modo: z.string().trim().min(1).max(60),
  proyecto_financiado: z.coerce.boolean().optional().default(true),
  id_asesor: z.string().trim().max(20).optional().nullable(),
  asesor_telefono: z.string().trim().max(30).optional().default(""),
  foto_espacio_url: z.string().trim().max(2000).optional().default(""),
  tea: z.coerce.number().min(0).max(100).optional().default(40),
  observaciones: z.string().trim().max(2000).optional().default(""),
  adjunto_cotizacion_url: zUrlDoc,
  adjunto_dni_url: zUrlDoc,
  items: z.array(EsquemaItemVenta).min(1).max(200),
});

const EsquemaRegistrarAbono = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  item_id: z.string().trim().min(1).max(60).optional().nullable(),
  monto: z.coerce.number().gt(0).max(100_000_000),
  medio: z.enum(["efectivo", "tarjeta"]),
  comprobante_url: zUrlDoc,
});

const EsquemaValidarAbono = z.object({
  abono_id: z.string().trim().min(1).max(60),
  accion: z.enum(["validar", "observar"]),
  observacion: z.string().trim().max(2000).optional().default(""),
});

const EsquemaPedidoItem = z.object({
  item_id: z.string().trim().min(1).max(60),
  numero_pedido_venta: z.string().trim().max(60).optional().default(""),
  numero_pedido_abono: z.string().trim().max(60).optional().default(""),
});

const EsquemaAprobar = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  pedidos: z.array(EsquemaPedidoItem).min(1).max(500),
  observacion: z.string().trim().max(2000).optional().default(""),
});

const EsquemaObservarSolicitud = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  observacion: z.string().trim().min(2).max(2000),
});

const EsquemaInstalacion = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  foto_antes_url: zUrlDoc,
  foto_despues_url: zUrlDoc,
  boleta_url: zUrlDoc,
  acta_url: zUrlDoc,
  observacion: z.string().trim().max(2000).optional().default(""),
  foto_extra_url: z.string().trim().max(2000).optional().default(""),
});

const EsquemaSoloSolicitud = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
});

const EsquemaObservarInstalacion = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  observacion: z.string().trim().min(2).max(2000),
});

const EsquemaExportar = z.object({
  estado: z.string().trim().max(40).optional().default(""),
  canal: z.string().trim().max(40).optional().default(""),
});

const EsquemaGetVenta = z.object({
  id: z.string().trim().min(1).max(20),
});

const EsquemaTea = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  tea: z.coerce.number().min(0).max(100),
});

// ---------------------------------------------------------------- handlers

async function hListarVentas(args: z.infer<typeof EsquemaListarVentas>, ctx: OperacionContext) {
  try {
    const desde = (args.page - 1) * args.pageSize;
    let q = ctx.service.from(T_SOL).select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (!esAdmin(ctx)) q = q.eq("created_by", ctx.sesion.userId); // scope por rol
    if (args.estado) q = q.eq("estado", args.estado.toLowerCase());
    if (args.canal) q = q.eq("canal", args.canal.toLowerCase());
    if (args.q) {
      const s = args.q.replace(/[%(),]/g, "");
      q = q.or(`id.ilike.%${s}%,id_cliente.ilike.%${s}%,id_proveedor.ilike.%${s}%,observaciones.ilike.%${s}%`);
    }
    const { data, error, count } = await q.range(desde, desde + args.pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as Fila[]);
    const nombres = await resolverNombres(ctx, rows);
    const enriquecidas = rows.map((r) => {
      const n = nombres.get(String(r.id)) ?? { cliente: null, documento: null, proveedor: null, asesor: null, creado_por: null };
      return { ...r, cliente_nombre: n.cliente, cliente_documento: n.documento, proveedor_nombre: n.proveedor, asesor_nombre: n.asesor, creado_por_nombre: n.creado_por };
    });
    return { rows: enriquecidas, total: count ?? rows.length, page: args.page, pageSize: args.pageSize };
  } catch (e) {
    exigirTabla(e);
  }
}

/** Resuelve un cliente a mae_clientes. Si viene de la tabla base, lo migra solo. */
async function resolverClienteSGT(ctx: OperacionContext, id: string): Promise<string> {
  const { data: ex } = await ctx.service.from("mae_clientes").select("id").eq("id", id).maybeSingle();
  if (ex) return id;
  const { data: base } = await ctx.service.from("clientes").select("*").eq("id", id).maybeSingle();
  if (!base) lanzar(422, "El cliente no existe en mae_clientes: créalo en Clientes primero");
  const b = base as Record<string, any>;
  const { data: ids } = await ctx.service.from("mae_clientes").select("id").limit(5000);
  const nuevo = siguienteId("CLI", ((ids ?? []) as { id?: string }[]).map((r) => r.id), 6);
  const { error } = await ctx.service.from("mae_clientes").insert({
    id: nuevo,
    tipo_persona: "NATURAL",
    tipo_doc: "DNI",
    nro_doc: String(b.dni ?? b.documento ?? `MIG-${String(id).slice(0, 8)}`),
    nombre_razon_social: String(b.nombres ?? b.nombre ?? "Cliente migrado"),
    contacto: null,
    correo: b.email ?? null,
    telefono: b.telefono ?? null,
    codigo_sap: null,
    estado: "ACTIVO",
  });
  if (error) lanzar(422, `No se pudo migrar el cliente al maestro SGT: ${error.message}`);
  return nuevo;
}

/** Resuelve un proveedor a mae_proveedores. Si viene de la tabla base, lo migra solo. */
async function resolverProveedorSGT(ctx: OperacionContext, id: string): Promise<string> {
  const { data: ex } = await ctx.service.from("mae_proveedores").select("id").eq("id", id).maybeSingle();
  if (ex) return id;
  const { data: base } = await ctx.service.from("proveedores").select("*").eq("id", id).maybeSingle();
  if (!base) lanzar(422, "El proveedor no existe en mae_proveedores: créalo en Administración > Proveedores");
  const b = base as Record<string, any>;
  if (!b.ruc) lanzar(422, "El proveedor base no tiene RUC: complétalo en Administración > Proveedores antes de vender");
  const { data: ids } = await ctx.service.from("mae_proveedores").select("id").limit(5000);
  const nuevo = siguienteId("PRV", ((ids ?? []) as { id?: string }[]).map((r) => r.id));
  const { error } = await ctx.service.from("mae_proveedores").insert({
    id: nuevo,
    interlocutor: String(b.contacto ?? b.nombre ?? nuevo),
    ruc: String(b.ruc),
    razon_social: String(b.nombre ?? nuevo),
    nombre_comercial: String(b.nombre ?? nuevo),
    correo: b.email ?? null,
    telefono: b.telefono ?? null,
    estado: "ACTIVO",
  });
  if (error) lanzar(422, `No se pudo migrar el proveedor al maestro SGT: ${error.message}`);
  return nuevo;
}

/** Resuelve un material a mae_materiales. Si viene de la tabla base, lo migra solo. */
async function resolverMaterialSGT(ctx: OperacionContext, id: string): Promise<string> {
  const { data: ex } = await ctx.service.from("mae_materiales").select("id").eq("id", id).maybeSingle();
  if (ex) return id;
  const { data: base } = await ctx.service.from("materiales").select("*").eq("id", id).maybeSingle();
  if (!base) lanzar(422, `El material ${id} no existe en el maestro: créalo en Materiales primero`);
  const b = base as Record<string, any>;
  const { data: ids } = await ctx.service.from("mae_materiales").select("id").limit(5000);
  const nuevo = siguienteId("MAT-", ((ids ?? []) as { id?: string }[]).map((r) => r.id), 5);
  const { error } = await ctx.service.from("mae_materiales").insert({
    id: nuevo,
    codigo_tmp: null,
    nombre: String(b.nombre ?? nuevo),
    descripcion: b.descripcion ?? null,
    unidad: String(b.unidad ?? "UND"),
    tipo_medida: "LONGITUD",
    decimales: 2,
    estado: "ACTIVO",
  });
  if (error) lanzar(422, `No se pudo migrar el material al maestro SGT: ${error.message}`);
  return nuevo;
}

async function hCrearSolicitud(args: z.infer<typeof EsquemaCrearSolicitud>, ctx: OperacionContext) {
  // Solo admin puede usar TEA distinta de 40.
  if (!esAdmin(ctx) && Number(args.tea) !== 40) lanzar(403, "Solo el rol admin puede registrar una TEA distinta de 40");
  // Adjuntos obligatorios (zod ya exige min 8; doble chequeo para mensaje claro).
  if (!args.adjunto_cotizacion_url || !args.adjunto_dni_url) lanzar(400, "adjunto_cotizacion_url y adjunto_dni_url son obligatorios");
  // Subtotal por ítem = cant*precio − dscto.
  const items = args.items.map((it) => {
    const bruto = red2(it.cantidad * it.precio_unit);
    if (it.descuento_monto > bruto) lanzar(422, `descuento_monto supera el bruto de la línea (material ${it.id_material})`);
    return { ...it, subtotal: red2(bruto - it.descuento_monto) };
  });
  const total = red2(items.reduce((a, it) => a + it.subtotal, 0));
  // FKs: resuelven al maestro SGT (migran desde tablas base si hace falta).
  const idClienteSGT = await resolverClienteSGT(ctx, args.id_cliente);
  const idProveedorSGT = args.id_proveedor ? await resolverProveedorSGT(ctx, args.id_proveedor) : null;
  if (args.id_asesor) {
    const { data: ase } = await ctx.service.from("seg_usuarios").select("id").eq("id", args.id_asesor).maybeSingle();
    if (!ase) lanzar(422, `Asesor no encontrado: ${args.id_asesor}`);
  }
  for (const it of items) {
    it.id_material = await resolverMaterialSGT(ctx, it.id_material);
  }
  try {
    const { data: prev, error: ePrev } = await ctx.service.from(T_SOL).select("id").limit(5000);
    if (ePrev) throw new Error(ePrev.message);
    const id = siguienteVTA(((prev ?? []) as { id?: string }[]).map((r) => r.id));
    const { data: cab, error: eCab } = await ctx.service
      .from(T_SOL)
      .insert({
        id,
        id_cliente: idClienteSGT,
        id_proveedor: idProveedorSGT,
        canal: args.canal,
        es_microaliado: args.es_microaliado ?? false,
        visita_estado: args.visita_estado,
        pago_modo: args.pago_modo,
        proyecto_financiado: args.proyecto_financiado ?? true,
        id_asesor: args.id_asesor || null,
        asesor_telefono: args.asesor_telefono || null,
        foto_espacio_url: args.foto_espacio_url || null,
        tea: args.tea ?? 40,
        observaciones: args.observaciones || "",
        adjunto_cotizacion_url: args.adjunto_cotizacion_url,
        adjunto_dni_url: args.adjunto_dni_url,
        estado: "borrador",
        created_by: ctx.sesion.userId,
      })
      .select()
      .single();
    if (eCab || !cab) {
      const m = eCab?.message ?? "No se pudo crear la solicitud de venta";
      if (/foreign key|llave foránea|violates foreign/i.test(m)) {
        lanzar(422, "El cliente, proveedor o material ya no existe en el maestro: recarga los catálogos e intenta de nuevo");
      }
      throw new Error(m);
    }
    const { data: det, error: eDet } = await ctx.service
      .from(T_ITEM)
      .insert(
        items.map((it) => ({
          solicitud_id: id,
          id_material: it.id_material,
          cantidad: it.cantidad,
          precio_unit: it.precio_unit,
          descuento_monto: it.descuento_monto,
          modo: it.modo,
          medio_pago: it.medio_pago,
          subtotal: it.subtotal,
        }))
      )
      .select();
    if (eDet) {
      try { await ctx.service.from(T_SOL).delete().eq("id", id); } catch { /* limpieza best-effort */ }
      throw new Error(eDet.message);
    }
    return { solicitud: cab, items: det ?? [], id, numero: id, total, estado: "borrador" };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hRegistrarAbono(args: z.infer<typeof EsquemaRegistrarAbono>, ctx: OperacionContext) {
  try {
    const { data: sol, error: eSol } = await ctx.service.from(T_SOL).select("id").eq("id", args.solicitud_id).maybeSingle();
    if (eSol) throw new Error(eSol.message);
    if (!sol) lanzar(404, `Solicitud no encontrada: ${args.solicitud_id}`);
    if (args.item_id) {
      const { data: it, error: eIt } = await ctx.service
        .from(T_ITEM)
        .select("id")
        .eq("id", args.item_id)
        .eq("solicitud_id", args.solicitud_id)
        .maybeSingle();
      if (eIt) throw new Error(eIt.message);
      if (!it) lanzar(404, `Ítem no pertenece a la solicitud: ${args.item_id}`);
    }
    const { data, error } = await ctx.service
      .from(T_ABO)
      .insert({
        solicitud_id: args.solicitud_id,
        item_id: args.item_id || null,
        monto: args.monto,
        medio: args.medio,
        comprobante_url: args.comprobante_url,
        estado: "pendiente",
        created_by: ctx.sesion.userId,
      })
      .select()
      .single();
    if (error || !data) throw new Error(error?.message ?? "No se pudo registrar el abono");
    const abono = data as Fila;
    const aviso_email = await avisarAbonoAdmin({
      solicitud_id: args.solicitud_id,
      monto: args.monto,
      medio: args.medio,
      abono_id: String(abono.id ?? ""),
    });
    return { ...abono, aviso_email };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hValidarAbono(args: z.infer<typeof EsquemaValidarAbono>, ctx: OperacionContext) {
  if (args.accion === "observar" && !args.observacion) lanzar(422, "observacion requerida para observar un abono");
  try {
    const patch =
      args.accion === "validar"
        ? { estado: "validado", observacion: args.observacion || null }
        : { estado: "pendiente", observacion: args.observacion };
    const { data, error } = await ctx.service.from(T_ABO).update(patch).eq("id", args.abono_id).select().single();
    if (error || !data) throw new Error(error?.message ?? `Abono no encontrado: ${args.abono_id}`);
    return data;
  } catch (e) {
    exigirTabla(e);
  }
}

async function hAprobarSolicitud(args: z.infer<typeof EsquemaAprobar>, ctx: OperacionContext) {
  try {
    const { data: items, error: eItems } = await ctx.service.from(T_ITEM).select("id").eq("solicitud_id", args.solicitud_id);
    if (eItems) throw new Error(eItems.message);
    const lista = ((items ?? []) as { id: string }[]);
    if (lista.length === 0) lanzar(422, "La solicitud no tiene ítems para aprobar");
    const porItem = new Map(args.pedidos.map((p) => [String(p.item_id), p]));
    const sinNumero: string[] = [];
    for (const it of lista) {
      const p = porItem.get(String(it.id));
      const v = String(p?.numero_pedido_venta ?? "").trim();
      const a = String(p?.numero_pedido_abono ?? "").trim();
      if (!p || (!v && !a)) sinNumero.push(String(it.id));
    }
    if (sinNumero.length > 0) {
      lanzar(422, `No se aprueba: cada ítem exige al menos un número (venta/abono). Faltan: ${sinNumero.join(", ")}`);
    }
    for (const [itemId, p] of porItem) {
      if (!lista.some((it) => String(it.id) === String(itemId))) {
        lanzar(422, `item_id no pertenece a la solicitud: ${itemId}`);
      }
      const patch: Fila = {};
      if (String(p.numero_pedido_venta ?? "").trim()) patch.numero_pedido_venta = p.numero_pedido_venta!.trim();
      if (String(p.numero_pedido_abono ?? "").trim()) patch.numero_pedido_abono = p.numero_pedido_abono!.trim();
      if (Object.keys(patch).length > 0) {
        const { error } = await ctx.service.from(T_ITEM).update(patch).eq("id", itemId);
        if (error) throw new Error(error.message);
      }
    }
    const { data, error } = await ctx.service
      .from(T_SOL)
      .update({ estado: "aprobada", observacion_admin: args.observacion || null })
      .eq("id", args.solicitud_id)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message ?? `Solicitud no encontrada: ${args.solicitud_id}`);
    return data;
  } catch (e) {
    exigirTabla(e);
  }
}

async function hActualizarNumerosPedido(args: z.infer<typeof EsquemaAprobar>, ctx: OperacionContext) {
  // Misma validación que aprobar, pero NO toca el estado (edición posterior).
  try {
    const { data: items, error: eItems } = await ctx.service.from(T_ITEM).select("id").eq("solicitud_id", args.solicitud_id);
    if (eItems) throw new Error(eItems.message);
    const lista = ((items ?? []) as { id: string }[]);
    if (lista.length === 0) lanzar(422, "La solicitud no tiene ítems");
    const porItem = new Map(args.pedidos.map((p) => [String(p.item_id), p]));
    const sinNumero: string[] = [];
    for (const it of lista) {
      const p = porItem.get(String(it.id));
      const v = String(p?.numero_pedido_venta ?? "").trim();
      const a = String(p?.numero_pedido_abono ?? "").trim();
      if (!p || (!v && !a)) sinNumero.push(String(it.id));
    }
    if (sinNumero.length > 0) {
      lanzar(422, `Cada ítem exige al menos un número (venta/abono). Faltan: ${sinNumero.join(", ")}`);
    }
    for (const [itemId, p] of porItem) {
      if (!lista.some((it) => String(it.id) === String(itemId))) {
        lanzar(422, `item_id no pertenece a la solicitud: ${itemId}`);
      }
      const patch: Fila = {};
      if (String(p.numero_pedido_venta ?? "").trim()) patch.numero_pedido_venta = p.numero_pedido_venta!.trim();
      if (String(p.numero_pedido_abono ?? "").trim()) patch.numero_pedido_abono = p.numero_pedido_abono!.trim();
      if (Object.keys(patch).length > 0) {
        const { error } = await ctx.service.from(T_ITEM).update(patch).eq("id", itemId);
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true, actualizados: porItem.size };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hObservarSolicitud(args: z.infer<typeof EsquemaObservarSolicitud>, ctx: OperacionContext) {
  try {
    const { data, error } = await ctx.service
      .from(T_SOL)
      .update({ estado: "observado", observacion_admin: args.observacion })
      .eq("id", args.solicitud_id)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message ?? `Solicitud no encontrada: ${args.solicitud_id}`);
    return data;
  } catch (e) {
    exigirTabla(e);
  }
}

async function hRegistrarInstalacion(args: z.infer<typeof EsquemaInstalacion>, ctx: OperacionContext) {
  try {
    const { data: sol, error: eSol } = await ctx.service.from(T_SOL).select("id").eq("id", args.solicitud_id).maybeSingle();
    if (eSol) throw new Error(eSol.message);
    if (!sol) lanzar(404, `Solicitud no encontrada: ${args.solicitud_id}`);
    const { data: previa, error: ePrev } = await ctx.service
      .from(T_INS)
      .select("id")
      .eq("solicitud_id", args.solicitud_id)
      .maybeSingle();
    if (ePrev) throw new Error(ePrev.message);
    let instalacion: unknown;
    const extra = {
      foto_antes_url: args.foto_antes_url,
      foto_despues_url: args.foto_despues_url,
      boleta_url: args.boleta_url,
      acta_url: args.acta_url,
      foto_extra_url: args.foto_extra_url || null,
      estado: "registrada",
      observacion: args.observacion || null,
    };
    if (previa) {
      const { data, error } = await ctx.service
        .from(T_INS)
        .update(extra)
        .eq("solicitud_id", args.solicitud_id)
        .select()
        .single();
      if (error) {
        if (/column|foto_extra_url/i.test(error.message)) {
          const e = new Error("Falta la columna foto_extra_url: ejecute supabase/migracion_ventas_03.sql") as Error & { status?: number };
          e.status = 422; throw e;
        }
        throw new Error(error.message);
      }
      instalacion = data;
    } else {
      const { data, error } = await ctx.service
        .from(T_INS)
        .insert({
          solicitud_id: args.solicitud_id,
          ...extra,
        })
        .select()
        .single();
      if (error) {
        if (/column|foto_extra_url/i.test(error.message)) {
          const e = new Error("Falta la columna foto_extra_url: ejecute supabase/migracion_ventas_03.sql") as Error & { status?: number };
          e.status = 422; throw e;
        }
        throw new Error(error.message);
      }
      instalacion = data;
    }
    // Con las 4 fotos el proveedor deja la venta INSTALADA (ya no en_instalacion).
    const { data: cab, error: eCab } = await ctx.service
      .from(T_SOL)
      .update({ estado: "instalada" })
      .eq("id", args.solicitud_id)
      .select()
      .single();
    if (eCab) throw new Error(eCab.message);
    return { solicitud: cab, instalacion, estado: "instalada" };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hValidarInstalacionProveedor(args: z.infer<typeof EsquemaSoloSolicitud>, ctx: OperacionContext) {
  try {
    const { data: ins, error: eIns } = await ctx.service
      .from(T_INS)
      .select("id")
      .eq("solicitud_id", args.solicitud_id)
      .maybeSingle();
    if (eIns) throw new Error(eIns.message);
    if (!ins) lanzar(404, `Instalación no registrada para: ${args.solicitud_id}`);
    const { data: instOk, error: eUpd } = await ctx.service
      .from(T_INS)
      .update({ estado: "validada_proveedor" })
      .eq("solicitud_id", args.solicitud_id)
      .select()
      .single();
    if (eUpd) throw new Error(eUpd.message);
    const { data: cab, error: eCab } = await ctx.service
      .from(T_SOL)
      .update({ estado: "validada_proveedor" })
      .eq("id", args.solicitud_id)
      .select()
      .single();
    if (eCab) throw new Error(eCab.message);
    return { solicitud: cab, instalacion: instOk, estado: "validada_proveedor" };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hValidacionFinal(args: z.infer<typeof EsquemaSoloSolicitud>, ctx: OperacionContext) {
  try {
    const { data: ins, error: eIns } = await ctx.service
      .from(T_INS)
      .select("id,estado")
      .eq("solicitud_id", args.solicitud_id)
      .maybeSingle();
    if (eIns) throw new Error(eIns.message);
    if (!ins) lanzar(404, `Instalación no registrada para: ${args.solicitud_id}`);
    if ((ins as Fila).estado !== "validada_proveedor") {
      lanzar(422, `Solo se cierra con instalación en 'validada_proveedor' (actual: ${(ins as Fila).estado})`);
    }
    const { data: instOk, error: eUpd } = await ctx.service
      .from(T_INS)
      .update({ estado: "cerrada" })
      .eq("solicitud_id", args.solicitud_id)
      .select()
      .single();
    if (eUpd) throw new Error(eUpd.message);
    // Stephany valida y cierra la venta como LIQUIDADA.
    const { data: cab, error: eCab } = await ctx.service
      .from(T_SOL)
      .update({ estado: "liquidada" })
      .eq("id", args.solicitud_id)
      .select()
      .single();
    if (eCab) {
      if (/check|constraint|CHECK|estado/i.test(eCab.message)) {
        const e = new Error("Falta el estado liquidada: ejecute supabase/migracion_ventas_03.sql") as Error & { status?: number };
        e.status = 422; throw e;
      }
      throw new Error(eCab.message);
    }
    return { solicitud: cab, instalacion: instOk, estado: "liquidada" };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hObservarInstalacion(args: z.infer<typeof EsquemaObservarInstalacion>, ctx: OperacionContext) {
  try {
    const { data: ins, error: eIns } = await ctx.service
      .from(T_INS)
      .select("id")
      .eq("solicitud_id", args.solicitud_id)
      .maybeSingle();
    if (eIns) throw new Error(eIns.message);
    if (!ins) lanzar(404, `Instalación no registrada para: ${args.solicitud_id}`);
    const { data: instOk, error: eUpd } = await ctx.service
      .from(T_INS)
      .update({ estado: "observada", observacion: args.observacion })
      .eq("solicitud_id", args.solicitud_id)
      .select()
      .single();
    if (eUpd) throw new Error(eUpd.message);
    const { data: cab, error: eCab } = await ctx.service
      .from(T_SOL)
      .update({ estado: "observada" })
      .eq("id", args.solicitud_id)
      .select()
      .single();
    if (eCab) throw new Error(eCab.message);
    return { solicitud: cab, instalacion: instOk, estado: "observada" };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hExportarVentas(args: z.infer<typeof EsquemaExportar>, ctx: OperacionContext) {
  const columnas = ["numero", "cliente", "documento", "proveedor", "canal", "estado", "total", "cuotas", "fecha"];
  try {
    let q = ctx.service.from(T_SOL).select("id,id_cliente,id_proveedor,canal,estado,created_at").order("created_at", { ascending: false }).limit(5000);
    if (!esAdmin(ctx)) q = q.eq("created_by", ctx.sesion.userId); // scope por rol
    if (args.estado) q = q.eq("estado", args.estado.toLowerCase());
    if (args.canal) q = q.eq("canal", args.canal.toLowerCase());
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as Fila[]);
    const nombres = await resolverNombres(ctx, rows);
    // cuotas = n.º de ítems en modo financiado; total = suma de subtotales (best-effort).
    let cuotasPorSol = new Map<string, number>();
    let totalPorSol = new Map<string, number>();
    try {
      const { data: items, error: eIt } = await ctx.service
        .from(T_ITEM)
        .select("solicitud_id,modo,subtotal")
        .in("solicitud_id", rows.map((r) => String(r.id)).slice(0, 5000));
      if (!eIt) {
        for (const it of ((items ?? []) as Fila[])) {
          const sid = String(it.solicitud_id);
          if (String(it.modo) === "financiado") {
            cuotasPorSol.set(sid, (cuotasPorSol.get(sid) ?? 0) + 1);
          }
          totalPorSol.set(sid, (totalPorSol.get(sid) ?? 0) + Number(it.subtotal ?? 0));
        }
      }
    } catch (e) {
      if (!esTablaFaltante(e)) throw e;
    }
    const filas = rows.map((r) => {
      const n = nombres.get(String(r.id)) ?? { cliente: null, documento: null, proveedor: null };
      return [
        String(r.id ?? ""),
        n.cliente ?? "",
        n.documento ?? "",
        n.proveedor ?? "",
        String(r.canal ?? ""),
        String(r.estado ?? ""),
        totalPorSol.get(String(r.id)) ?? 0,
        cuotasPorSol.get(String(r.id)) ?? 0,
        String(r.created_at ?? "").slice(0, 10),
      ];
    });
    return { columnas, filas };
  } catch (e) {
    exigirTabla(e);
  }
}

const EsquemaQInstalaciones = z.object({
  estado: z.string().trim().max(40).optional().default(""),
  limit: zLimit,
});

async function hListarInstalacionesPendientes(args: z.infer<typeof EsquemaQInstalaciones>, ctx: OperacionContext) {
  // Vista del proveedor: TODAS sus ventas con info de instalación (no solo pendientes).
  // Admin ve todo. Otros roles: vacío.
  let idProveedor: string | null = null;
  if (!esAdmin(ctx)) {
    const { data: ficha } = await ctx.service.from("seg_usuarios").select("id_proveedor").eq("correo", (ctx.sesion.email ?? "").toLowerCase()).maybeSingle();
    idProveedor = (ficha as { id_proveedor?: string } | null)?.id_proveedor ?? null;
    if (!idProveedor) return { rows: [], total: 0, proveedor: null };
  }
  let q = ctx.service.from(T_SOL)
    .select("id,id_cliente,id_proveedor,canal,estado,created_at,updated_at", { count: "exact" })
    .order("updated_at", { ascending: false }).limit(args.limit);
  if (idProveedor) q = q.eq("id_proveedor", idProveedor);
  if (args.estado) q = q.eq("estado", args.estado.toLowerCase());
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Record<string, any>[]);
  const ids = rows.map((r) => String(r.id));
  const [cli, prv, ins] = await Promise.all([
    ctx.service.from("mae_clientes").select("id,nombre_razon_social,nro_doc").in("id", ids.length ? rows.map((r) => String(r.id_cliente)) : ["—"]),
    ctx.service.from("mae_proveedores").select("id,razon_social").in("id", ids.length ? rows.map((r) => String(r.id_proveedor)) : ["—"]),
    ctx.service.from(T_INS).select("solicitud_id,estado").in("solicitud_id", ids.length ? ids : ["—"]),
  ]);
  const mCli = new Map(((cli.data ?? []) as any[]).map((c) => [String(c.id), c]));
  const mPrv = new Map(((prv.data ?? []) as any[]).map((p) => [String(p.id), p]));
  const mIns = new Map(((ins.data ?? []) as any[]).map((x) => [String(x.solicitud_id), x]));
  return {
    rows: rows.map((r) => ({
      ...r,
      cliente: (mCli.get(String(r.id_cliente)) as any)?.nombre_razon_social ?? r.id_cliente,
      cliente_doc: (mCli.get(String(r.id_cliente)) as any)?.nro_doc ?? null,
      proveedor: (mPrv.get(String(r.id_proveedor)) as any)?.razon_social ?? r.id_proveedor,
      instalacion_estado: (mIns.get(String(r.id)) as any)?.estado ?? "pendiente",
    })),
    total: count ?? rows.length,
    proveedor: idProveedor,
  };
}

async function hGetVenta(args: z.infer<typeof EsquemaGetVenta>, ctx: OperacionContext) {
  try {
    const { data: cab, error: eCab } = await ctx.service.from(T_SOL).select("*").eq("id", args.id).single();
    if (eCab || !cab) {
      if (eCab && esTablaFaltante(new Error(eCab.message))) exigirTabla(eCab);
      lanzar(404, `Venta no encontrada: ${args.id}`);
    }
    const sol = cab as Fila;
    if (!esAdmin(ctx) && String(sol.created_by ?? "") !== ctx.sesion.userId) {
      lanzar(403, "Sin permiso: la venta pertenece a otro usuario");
    }
    const [rItems, rAbonos, rIns] = await Promise.all([
      ctx.service.from(T_ITEM).select("*").eq("solicitud_id", args.id),
      ctx.service.from(T_ABO).select("*").eq("solicitud_id", args.id).order("created_at", { ascending: false }),
      ctx.service.from(T_INS).select("*").eq("solicitud_id", args.id).maybeSingle(),
    ]);
    if (rItems.error) throw new Error(rItems.error.message);
    if (rAbonos.error) throw new Error(rAbonos.error.message);
    if (rIns.error) throw new Error(rIns.error.message);
    const nombres = await resolverNombres(ctx, [sol]);
    const n = nombres.get(String(sol.id)) ?? { asesor: null, creado_por: null } as { asesor: string | null; creado_por: string | null };
    return {
      solicitud: { ...sol, asesor_nombre: n.asesor, creado_por_nombre: n.creado_por },
      items: rItems.data ?? [],
      abonos: rAbonos.data ?? [],
      instalacion: rIns.data ?? null,
    };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hActualizarTea(args: z.infer<typeof EsquemaTea>, ctx: OperacionContext) {
  try {
    const { data, error } = await ctx.service
      .from(T_SOL)
      .update({ tea: args.tea })
      .eq("id", args.solicitud_id)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message ?? `Solicitud no encontrada: ${args.solicitud_id}`);
    return data;
  } catch (e) {
    exigirTabla(e);
  }
}

// ---------------------------------------------------------------- mapa

export const OPERACIONES_VENTAS: Record<string, DefOp> = {
  listarVentas: { descripcion: "Ventas: lista solicitudes con cliente/proveedor (scope por rol)", roles: TODOS, schema: EsquemaListarVentas, handler: hListarVentas },
  crearSolicitudVenta: { descripcion: "Ventas: crea solicitud VTA-xxxxxx en borrador (adjuntos obligatorios, TEA 40 salvo admin)", roles: OPERATIVO, schema: EsquemaCrearSolicitud, handler: hCrearSolicitud },
  registrarAbono: { descripcion: "Ventas: registra abono pendiente + aviso email a admin (best-effort)", roles: OPERATIVO, schema: EsquemaRegistrarAbono, handler: hRegistrarAbono },
  validarAbono: { descripcion: "Ventas: valida u observa un abono", roles: SOLO_ADMIN, schema: EsquemaValidarAbono, handler: hValidarAbono },
  aprobarSolicitud: { descripcion: "Ventas: aprueba solicitud exigiendo n.º de pedido por cada ítem", roles: SOLO_ADMIN, schema: EsquemaAprobar, handler: hAprobarSolicitud },
  actualizarNumerosPedido: { descripcion: "Ventas: edita n.º de pedido por ítem sin cambiar estado", roles: SOLO_ADMIN, schema: EsquemaAprobar, handler: hActualizarNumerosPedido },
  observarSolicitud: { descripcion: "Ventas: observa solicitud", roles: SOLO_ADMIN, schema: EsquemaObservarSolicitud, handler: hObservarSolicitud },
  registrarInstalacion: { descripcion: "Ventas: registra instalación (4 evidencias) → en_instalacion", roles: OPERATIVO, schema: EsquemaInstalacion, handler: hRegistrarInstalacion },
  validarInstalacionProveedor: { descripcion: "Ventas: validación operativa de instalación → validada_proveedor", roles: OPERATIVO, schema: EsquemaSoloSolicitud, handler: hValidarInstalacionProveedor },
  validacionFinal: { descripcion: "Ventas: Stephany valida y cierra → liquidada (exige validada_proveedor)", roles: SOLO_ADMIN, schema: EsquemaSoloSolicitud, handler: hValidacionFinal },
  observarInstalacion: { descripcion: "Ventas: observa instalación → observada", roles: OPERATIVO, schema: EsquemaObservarInstalacion, handler: hObservarInstalacion },
  exportarVentas: { descripcion: "Ventas: {columnas, filas} planos listos para XLSX", roles: TODOS, schema: EsquemaExportar, handler: hExportarVentas },
  getVenta: { descripcion: "Ventas: cabecera + items + abonos + instalación", roles: TODOS, schema: EsquemaGetVenta, handler: hGetVenta },
  listarInstalacionesPendientes: { descripcion: "Ventas: historial de instalaciones del proveedor", roles: TODOS, schema: EsquemaQInstalaciones, handler: hListarInstalacionesPendientes },
  actualizarTeaVenta: { descripcion: "Ventas: actualiza TEA de la solicitud", roles: SOLO_ADMIN, schema: EsquemaTea, handler: hActualizarTea },
};

/** Reglas del módulo (para el coordinador/UI): roles, TEA, adjuntos, aprobaciones y alcance. */
export const REGLAS_VENTAS = {
  tablas: [T_SOL, T_ITEM, T_ABO, T_INS],
  schema_sql: "supabase/schema_ventas.sql",
  scope_por_rol: "asesor/oficina solo ven sus propias ventas (created_by = sesion.userId) en listarVentas, exportarVentas y getVenta; admin ve todo",
  tea: "default 40; solo admin puede crear con TEA ≠ 40 (403) y solo admin puede actualizarla",
  adjuntos: "adjunto_cotizacion_url y adjunto_dni_url obligatorios al crear (400 sin ellos)",
  subtotal_item: "cantidad * precio_unit − descuento_monto (422 si el descuento supera el bruto)",
  correlativo: "id VTA-xxxxxx (6 dígitos)",
  abonos: "registrarAbono deja estado 'pendiente' y avisa a admin por SMTP best-effort (aviso_email: enviado|omitido); validarAbono: validar → 'validado', observar → 'pendiente' + observacion (observacion obligatoria al observar)",
  aprobacion: "aprobarSolicitud exige al menos un número (venta o abono) por CADA ítem, sino 422; observarSolicitud → 'observado'",
  instalacion: "registrarInstalacion exige las 4 evidencias (+observación y foto extra opcionales) → solicitud 'instalada' + instalación 'registrada'; validarInstalacionProveedor → 'validada_proveedor'; validacionFinal (Stephany) solo desde 'validada_proveedor' sino 422 → 'liquidada'; observarInstalacion → 'observada'",
  exportar: "columnas fijas: numero, cliente, documento, proveedor, canal, estado, total, cuotas (n.º ítems financiados), fecha",
} as const;

export function listarOperacionesVentasPermitidas(rol: RolUsuario): string[] {
  return Object.entries(OPERACIONES_VENTAS).filter(([, d]) => d.roles.includes(rol)).map(([k]) => k);
}

export async function ejecutarOperacionSeguraVentas(
  operacion: string, argumentos: unknown, ctx: OperacionContext
): Promise<{ ok: true; datos: unknown }> {
  const def = OPERACIONES_VENTAS[operacion];
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
