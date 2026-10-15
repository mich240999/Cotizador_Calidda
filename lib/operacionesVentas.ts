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

/** Estados de solicitud (10): borrador → generada (PV) → instalada → validada_proveedor → liquidada. */
export const ESTADOS_SOLICITUD = [
  "borrador",
  "pendiente_aprobacion",
  "observado",
  "aprobada",
  "generada",
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

/**
 * Alcance de lectura de ventas según seg_roles:
 * - GLOBAL (admin): todo.
 * - EMPRESA (proveedor): ventas de su proveedor, o propias si no tiene.
 * - EQUIPO/PROPIO: solo propias (EQUIPO completo requiere matriz de equipos).
 */
function alcanceVentas(ctx: OperacionContext): { todo: boolean; proveedor: string | null } {
  if (esAdmin(ctx) || ctx.sesion.alcance === "GLOBAL") return { todo: true, proveedor: null };
  if (ctx.sesion.alcance === "EMPRESA" && ctx.sesion.idProveedor) {
    return { todo: false, proveedor: ctx.sesion.idProveedor };
  }
  return { todo: false, proveedor: null };
}

type Fila = Record<string, any>;

/** Resuelve nombres de cliente/proveedor/asesor/creador best-effort (mae_* primero, base después). */
async function resolverNombres(
  ctx: OperacionContext,
  filas: Fila[]
): Promise<Map<string, { cliente: string | null; documento: string | null; proveedor: string | null; asesor: string | null; creado_por: string | null; cuenta_contrato: string | null; ambiente: string | null; nse: string | null }>> {
  const idsCli = [...new Set(filas.map((r) => String(r.id_cliente ?? "")).filter(Boolean))];
  const idsProv = [...new Set(filas.map((r) => String(r.id_proveedor ?? "")).filter(Boolean))];
  const idsAse = [...new Set(filas.map((r) => String(r.id_asesor ?? "")).filter(Boolean))];
  const idsCreador = [...new Set(filas.map((r) => String(r.created_by ?? "")).filter(Boolean))];
  const out = new Map<string, { cliente: string | null; documento: string | null; proveedor: string | null; asesor: string | null; creado_por: string | null; cuenta_contrato: string | null; ambiente: string | null; nse: string | null }>();
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

  const buscarMaeCli = async (): Promise<Fila[]> => {
    if (!idsCli.length) return [];
    const cols = (extra: string) => `id,nombre_razon_social,nro_doc,cuenta_contrato,ambiente,telefono,correo${extra}`;
    try {
      return await buscarEn(["mae_clientes"], idsCli, cols(",nse"));
    } catch (e) {
      if (/column|schema cache/i.test(String((e as { message?: string })?.message ?? ""))) {
        return buscarEn(["mae_clientes"], idsCli, cols("")).catch(() => [] as Fila[]);
      }
      throw e;
    }
  };
  const [cliMae, cliBase] = idsCli.length
    ? await Promise.all([
        buscarMaeCli().catch(() => [] as Fila[]),
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
    try {
      const { data } = await svc.from("seg_usuarios").select("id,nombre").in("id", idsAse);
      for (const u of ((data ?? []) as Fila[])) mAse.set(String(u.id), u);
    } catch { /* sin tabla: IDs crudos */ }
  }
  const mCreador = new Map<string, Fila>();
  if (idsCreador.length) {
    try {
      const { data } = await svc.from("profiles").select("id,nombre").in("id", idsCreador);
      for (const u of ((data ?? []) as Fila[])) mCreador.set(String(u.id), u);
    } catch { /* sin tabla: IDs crudos */ }
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
      cuenta_contrato: (c?.cuenta_contrato ?? null) as string | null,
      ambiente: (c?.ambiente ?? null) as string | null,
      nse: (c?.nse ?? null) as string | null,
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

/** Aviso al solicitante cuando Stephany observa algo (best-effort: nunca rompe). */
async function avisarObservacion(
  ctx: OperacionContext,
  solicitudId: string,
  etapa: string,
  motivo: string
): Promise<"enviado" | "omitido"> {
  try {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return "omitido";
    const { data: sol } = await ctx.service.from(T_SOL).select("created_by").eq("id", solicitudId).maybeSingle();
    const uid = (sol as { created_by?: string } | null)?.created_by;
    if (!uid) return "omitido";
    const { data: usr } = await ctx.service.auth.admin.getUserById(uid);
    const destino = usr?.user?.email;
    if (!destino) return "omitido";
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
      subject: `Subsanar ${etapa} — solicitud ${solicitudId}`,
      text: `Stephany observó ${etapa} de tu solicitud ${solicitudId} y hay algo por subsanar.\n\nMotivo: ${motivo}\n\nCorrige y vuelve a subir los sustentos correctos desde el detalle de la venta; el proceso continúa desde donde quedó.`,
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
  visita_estado: z.enum(["visitado", "agendado"]).optional().default("visitado"),
  pago_modo: z.string().trim().min(1).max(60),
  proyecto_financiado: z.coerce.boolean().optional().default(true),
  id_asesor: z.string().trim().max(20).optional().nullable(),
  asesor: z.string().trim().max(200).optional().default(""),
  asesor_telefono: z.string().trim().max(30).optional().default(""),
  foto_espacio_url: z.string().trim().max(2000).optional().default(""),
  tea: z.coerce.number().min(0).max(100).optional().default(40),
  observaciones: z.string().trim().max(2000).optional().default(""),
  // Sin .default(""): zod ≥3.24 valida el default contra min() y rechaza
  // aunque la clave venga omitida. Con .optional() solo, omitir pasa y un
  // valor presente corto sigue rechazado.
  adjunto_cotizacion_url: zUrlDoc.optional(),
  adjunto_dni_url: zUrlDoc.optional(),
  // Etapa 3 — solicitud nacida de una cotización (PDF se regenera, no se sube).
  cotizacion_id: z.string().trim().uuid().optional().nullable(),
  anticipo: z.coerce.number().min(0).max(100_000_000).optional().default(0),
  ambiente: z.string().trim().max(120).optional().default(""),
  nro_cuotas: z.coerce.number().int().min(1).max(360).optional().nullable(),
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

// Etapa 4 — Stephany registra PV: pedido único + código de llamada.
// El PV de abono solo se exige si hubo anticipo (abono inicial).
const EsquemaRegistrarPV = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  codigo_llamada: z.string().trim().min(1).max(60),
  numero_pedido_venta: z.string().trim().min(1).max(60),
  numero_pedido_abono: z.string().trim().max(60).optional().default(""),
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

const EsquemaBuscarCotizaciones = z.object({
  q: z.string().trim().max(120).optional().default(""),
  estado: z.string().trim().max(40).optional().default(""),
  desde: z.string().trim().max(10).optional().default(""),
  hasta: z.string().trim().max(10).optional().default(""),
  limit: zLimit,
});

const EsquemaCotizacionParaVenta = z.object({
  cotizacion_id: z.string().trim().uuid(),
});

// ---------------------------------------------------------------- handlers

async function hListarVentas(args: z.infer<typeof EsquemaListarVentas>, ctx: OperacionContext) {
  try {
    const desde = (args.page - 1) * args.pageSize;
    let q = ctx.service.from(T_SOL).select("*", { count: "exact" }).order("created_at", { ascending: false });
    const sc = alcanceVentas(ctx);
    if (!sc.todo) {
      if (sc.proveedor) q = q.or(`id_proveedor.eq.${sc.proveedor},created_by.eq.${ctx.sesion.userId}`);
      else q = q.eq("created_by", ctx.sesion.userId); // PROPIO (y EQUIPO por ahora)
    }
    if (args.estado) q = q.eq("estado", args.estado.toLowerCase());
    if (args.canal) q = q.eq("canal", args.canal.toLowerCase());
    if (args.q) {
      // Búsqueda exacta o por coincidencia (ilike): incluye PV normal y de
      // abono, a nivel cabecera y de ítems.
      const s = args.q.replace(/[%(),]/g, "");
      let idsPorPV: string[] = [];
      try {
        const { data: its } = await ctx.service.from(T_ITEM).select("solicitud_id")
          .or(`numero_pedido_venta.ilike.%${s}%,numero_pedido_abono.ilike.%${s}%`).limit(500);
        idsPorPV = [...new Set(((its ?? []) as Fila[]).map((it) => String(it.solicitud_id)))];
      } catch { /* sin columnas de pedido */ }
      const base = `id.ilike.%${s}%,id_cliente.ilike.%${s}%,id_proveedor.ilike.%${s}%,observaciones.ilike.%${s}%`;
      const conPV = `${base},numero_pedido.ilike.%${s}%,pv_abono.ilike.%${s}%`
        + (idsPorPV.length ? `,id.in.(${idsPorPV.map((x) => `"${x}"`).join(",")})` : "");
      q = q.or(conPV);
      const { data, error, count } = await q.range(desde, desde + args.pageSize - 1);
      if (error && /column|schema cache/i.test(error.message)) {
        // BD sin migración 03-04: reintenta sin columnas nuevas.
        let q2 = ctx.service.from(T_SOL).select("*", { count: "exact" }).order("created_at", { ascending: false });
        if (!sc.todo) {
          if (sc.proveedor) q2 = q2.or(`id_proveedor.eq.${sc.proveedor},created_by.eq.${ctx.sesion.userId}`);
          else q2 = q2.eq("created_by", ctx.sesion.userId);
        }
        if (args.estado) q2 = q2.eq("estado", args.estado.toLowerCase());
        if (args.canal) q2 = q2.eq("canal", args.canal.toLowerCase());
        q2 = q2.or(base);
        const r2 = await q2.range(desde, desde + args.pageSize - 1);
        if (r2.error) throw new Error(r2.error.message);
        const rows2 = ((r2.data ?? []) as Fila[]);
        const enr2 = await enriquecerSolicitudes(ctx, rows2);
        return { rows: enr2, total: r2.count ?? rows2.length, page: args.page, pageSize: args.pageSize };
      }
      if (error) throw new Error(error.message);
      const rows = ((data ?? []) as Fila[]);
      const enriquecidas = await enriquecerSolicitudes(ctx, rows);
      return { rows: enriquecidas, total: count ?? rows.length, page: args.page, pageSize: args.pageSize };
    }
    const { data, error, count } = await q.range(desde, desde + args.pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as Fila[]);
    const enriquecidas = await enriquecerSolicitudes(ctx, rows);
    return { rows: enriquecidas, total: count ?? rows.length, page: args.page, pageSize: args.pageSize };
  } catch (e) {
    exigirTabla(e);
  }
}

/** Enriquece filas de solicitudes para las tablas (mismos 13 campos en
 *  solicitudes e instalaciones): nombres, cotización, montos, material.
 */
async function enriquecerSolicitudes(ctx: OperacionContext, rows: Fila[]): Promise<Fila[]> {
  const nombres = await resolverNombres(ctx, rows);
  const idsCot = [...new Set(rows.map((r) => String(r.cotizacion_id ?? "")).filter(Boolean))];
  const mCot = new Map<string, { codigo: string; cuenta_contrato: string | null; proveedor: string | null; asesor: string | null }>();
  if (idsCot.length) {
    try {
      const { data: cots } = await ctx.service.from("cotizaciones").select("id,codigo,cuenta_contrato,proveedor,asesor").in("id", idsCot);
      for (const c of ((cots ?? []) as Fila[])) {
        mCot.set(String(c.id), {
          codigo: String(c.codigo ?? ""),
          cuenta_contrato: (c.cuenta_contrato ?? null) as string | null,
          proveedor: (c.proveedor ?? null) as string | null,
          asesor: (c.asesor ?? null) as string | null,
        });
      }
    } catch { /* sin cotizaciones vinculadas */ }
  }
  const idsSol = rows.map((r) => String(r.id));
  const mTot = new Map<string, number>();
  const mMat = new Map<string, string>();
  if (idsSol.length) {
    try {
      const { data: its } = await ctx.service.from(T_ITEM).select("solicitud_id,subtotal,id_material").in("solicitud_id", idsSol).order("id", { ascending: true }).limit(2000);
      const porSol = new Map<string, Fila[]>();
      for (const it of ((its ?? []) as Fila[])) {
        const k = String(it.solicitud_id);
        if (!porSol.has(k)) porSol.set(k, []);
        porSol.get(k)!.push(it);
      }
      const idsMat = [...new Set([...porSol.values()].flat().map((it) => String(it.id_material ?? "")).filter(Boolean))];
      const mNom = new Map<string, string>();
      if (idsMat.length) {
        try {
          const { data: mats } = await ctx.service.from("mae_materiales").select("id,nombre").in("id", idsMat);
          for (const m of ((mats ?? []) as Fila[])) mNom.set(String(m.id), String(m.nombre ?? ""));
        } catch { /* sin maestro */ }
      }
      for (const [k, lista] of porSol) {
        mTot.set(k, Math.round(lista.reduce((a, it) => a + (Number(it.subtotal ?? 0) || 0), 0) * 100) / 100);
        const primero = lista[0];
        const nMat = mNom.get(String(primero?.id_material ?? ""));
        mMat.set(k, nMat || (lista.length > 1 ? `${lista.length} materiales` : "—"));
      }
    } catch { /* sin ítems */ }
  }
  return rows.map((r) => {
    const n = nombres.get(String(r.id)) ?? { cliente: null, documento: null, proveedor: null, asesor: null, creado_por: null, cuenta_contrato: null, ambiente: null, nse: null };
    const cot = mCot.get(String(r.cotizacion_id ?? ""));
    const totalItems = mTot.get(String(r.id)) ?? 0;
    const anticipo = Math.max(Number(r.anticipo ?? 0) || 0, 0);
    return {
      ...r,
        cliente_nombre: n.cliente,
        cliente_documento: n.documento,
        proveedor_nombre: n.proveedor || cot?.proveedor,
        asesor_nombre: (r.asesor_nombre ?? null) || n.asesor || cot?.asesor,
      creado_por_nombre: n.creado_por,
      cuenta_contrato: (r.cuenta_contrato ?? null) || cot?.cuenta_contrato || n.cuenta_contrato,
      ambiente: (r.ambiente ?? null) || n.ambiente,
      nse: n.nse,
      cotizacion_codigo: cot?.codigo || null,
      monto_total: totalItems,
      monto_financiado: r.monto_financiado != null && Number(r.monto_financiado) > 0
        ? Number(r.monto_financiado)
        : Math.max(Math.round((totalItems - anticipo) * 100) / 100, 0),
      material_nombre: mMat.get(String(r.id)) ?? "—",
    };
  });
}

/** Resuelve un cliente a mae_clientes. Si viene de la tabla base, lo migra solo.
 *  Busca por id y, si no, por (tipo_doc, nro_doc) para no duplicar: un cliente
 *  puede tener múltiples solicitudes de venta.
 */
async function resolverClienteSGT(ctx: OperacionContext, id: string): Promise<string> {
  const { data: ex } = await ctx.service.from("mae_clientes").select("id").eq("id", id).maybeSingle();
  if (ex) return id;
  const { data: base } = await ctx.service.from("clientes").select("*").eq("id", id).maybeSingle();
  if (!base) lanzar(422, "El cliente no existe en mae_clientes: créalo en Clientes primero");
  const b = base as Record<string, any>;
  const dni = String(b.dni ?? b.documento ?? "");
  // ¿Ya migrado antes con otro id? (mismo documento) → reusar.
  if (dni) {
    const { data: previo } = await ctx.service.from("mae_clientes").select("id").eq("nro_doc", dni).limit(1).maybeSingle();
    if (previo) return (previo as { id: string }).id;
  }
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
  if (b.ruc) {
    const { data: previo } = await ctx.service.from("mae_proveedores").select("id").eq("ruc", String(b.ruc)).limit(1).maybeSingle();
    if (previo) return (previo as { id: string }).id;
  }
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
  if (b.codigo) {
    const { data: previo } = await ctx.service.from("mae_materiales").select("id").eq("codigo_sap", String(b.codigo)).limit(1).maybeSingle();
    if (previo) return (previo as { id: string }).id;
  }
  if (b.nombre) {
    const { data: previoN } = await ctx.service.from("mae_materiales").select("id").eq("nombre", String(b.nombre)).limit(1).maybeSingle();
    if (previoN) return (previoN as { id: string }).id;
  }
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

/** Columnas Etapa 3 en vta_solicitudes_venta (migracion_03). */
const COLUMNAS_VTA_ETAPA3 = [
  "cotizacion_id", "asesor_nombre", "anticipo",
  "monto_financiado", "nro_cuotas", "ambiente",
] as const;

/** Resuelve id de asesor en seg_usuarios por nombre (asesor de la cotización). */
async function resolverAsesorPorNombre(ctx: OperacionContext, nombre: string): Promise<string | null> {
  const n = String(nombre ?? "").trim();
  if (!n) return null;
  try {
    const { data } = await ctx.service.from("seg_usuarios").select("id,nombre").ilike("nombre", `%${n}%`).limit(5);
    const lista = ((data ?? []) as { id: string; nombre?: string }[]);
    const exacto = lista.find((u) => String(u.nombre ?? "").trim().toLowerCase() === n.toLowerCase());
    return String((exacto ?? lista[0])?.id ?? "") || null;
  } catch {
    return null;
  }
}

async function hCrearSolicitud(args: z.infer<typeof EsquemaCrearSolicitud>, ctx: OperacionContext) {
  // Solo admin puede usar TEA distinta de 40.
  if (!esAdmin(ctx) && Number(args.tea) !== 40) lanzar(403, "Solo el rol admin puede registrar una TEA distinta de 40");
  // Adjuntos obligatorios solo en flujo manual; con cotización el PDF se regenera.
  if (!args.cotizacion_id && (!args.adjunto_cotizacion_url || !args.adjunto_dni_url)) {
    lanzar(400, "adjunto_cotizacion_url y adjunto_dni_url son obligatorios");
  }
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
  let idAsesor: string | null = args.id_asesor || null;
  let asesorNombre = String(args.asesor ?? "").trim();
  if (idAsesor) {
    const { data: ase } = await ctx.service.from("seg_usuarios").select("id,nombre").eq("id", idAsesor).maybeSingle();
    if (!ase) lanzar(422, `Asesor no encontrado: ${args.id_asesor}`);
    if (!asesorNombre) asesorNombre = String((ase as { nombre?: string })?.nombre ?? "");
  } else if (asesorNombre) {
    // Mismo asesor de la cotización: se busca su ficha por nombre.
    idAsesor = await resolverAsesorPorNombre(ctx, asesorNombre);
  }
  const anticipo = Math.max(Number(args.anticipo ?? 0) || 0, 0);
  const montoFinanciado = Math.max(red2(total - anticipo), 0);
  for (const it of items) {
    it.id_material = await resolverMaterialSGT(ctx, it.id_material);
  }
  try {
    const { data: prev, error: ePrev } = await ctx.service.from(T_SOL).select("id").limit(5000);
    if (ePrev) throw new Error(ePrev.message);
    const id = siguienteVTA(((prev ?? []) as { id?: string }[]).map((r) => r.id));
    const baseSol: Record<string, unknown> = {
      id,
      id_cliente: idClienteSGT,
      id_proveedor: idProveedorSGT,
      canal: args.canal,
      es_microaliado: args.es_microaliado ?? false,
      visita_estado: args.visita_estado ?? "visitado",
      pago_modo: args.pago_modo,
      proyecto_financiado: args.proyecto_financiado ?? true,
      id_asesor: idAsesor,
      asesor_telefono: args.asesor_telefono || null,
      foto_espacio_url: args.foto_espacio_url || null,
      tea: args.tea ?? 40,
      observaciones: args.observaciones || "",
      adjunto_cotizacion_url: args.adjunto_cotizacion_url || null,
      adjunto_dni_url: args.adjunto_dni_url || null,
      estado: "borrador",
      created_by: ctx.sesion.userId,
    };
    const filaSol: Record<string, unknown> = {
      ...baseSol,
      cotizacion_id: args.cotizacion_id || null,
      asesor_nombre: asesorNombre || null,
      anticipo,
      monto_financiado: montoFinanciado,
      nro_cuotas: args.nro_cuotas ?? null,
      ambiente: args.ambiente || null,
    };
    let insCab = await ctx.service.from(T_SOL).insert(filaSol).select().single();
    if (insCab.error && /column|schema cache/i.test(insCab.error.message)) {
      // BD sin migración 03: reintenta sin las columnas nuevas.
      insCab = await ctx.service.from(T_SOL).insert(baseSol).select().single();
    }
    const { data: cab, error: eCab } = insCab;
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
    if (args.accion === "observar") {
      const sid = String((data as { solicitud_id?: string }).solicitud_id ?? "");
      if (sid) {
        const aviso = await avisarObservacion(ctx, sid, "tu abono", args.observacion || "");
        return { ...(data as object), aviso_email: aviso };
      }
    }
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
    const aviso = await avisarObservacion(ctx, args.solicitud_id, "tu solicitud", args.observacion);
    return { ...(data as object), aviso_email: aviso };
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
    const aviso = await avisarObservacion(ctx, args.solicitud_id, "la instalación", args.observacion);
    return { solicitud: cab, instalacion: instOk, estado: "observada", aviso_email: aviso };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hExportarVentas(args: z.infer<typeof EsquemaExportar>, ctx: OperacionContext) {
  const columnas = ["numero", "cliente", "documento", "proveedor", "canal", "estado", "total", "cuotas", "fecha"];
  try {
    let q = ctx.service.from(T_SOL).select("id,id_cliente,id_proveedor,canal,estado,created_at").order("created_at", { ascending: false }).limit(5000);
    const scExp = alcanceVentas(ctx);
    if (!scExp.todo) {
      if (scExp.proveedor) q = q.or(`id_proveedor.eq.${scExp.proveedor},created_by.eq.${ctx.sesion.userId}`);
      else q = q.eq("created_by", ctx.sesion.userId);
    }
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
    const scOne = alcanceVentas(ctx);
    const mismaEmpresa = !!scOne.proveedor && String(sol.id_proveedor ?? "") === scOne.proveedor;
    if (!scOne.todo && !mismaEmpresa && String(sol.created_by ?? "") !== ctx.sesion.userId) {
      lanzar(403, "Sin permiso: la venta pertenece a otro usuario o empresa");
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
    const n = nombres.get(String(sol.id)) ?? { cliente: null, documento: null, proveedor: null, asesor: null, creado_por: null, cuenta_contrato: null, ambiente: null, nse: null };
    // Nombres de materiales (código + descripción) para los ítems.
    const itemsRaw = ((rItems.data ?? []) as Fila[]);
    const idsMat = [...new Set(itemsRaw.map((it) => String(it.id_material ?? "")).filter(Boolean))];
    const mMat = new Map<string, Fila>();
    if (idsMat.length) {
      try {
        const { data: mats } = await ctx.service.from("mae_materiales").select("id,nombre,descripcion,codigo_tmp,codigo_sap").in("id", idsMat);
        for (const m of ((mats ?? []) as Fila[])) mMat.set(String(m.id), m);
      } catch { /* sin maestro: se muestra el id */ }
    }
    const items = itemsRaw.map((it) => {
      const m = mMat.get(String(it.id_material ?? ""));
      const codigo = String(m?.codigo_tmp ?? m?.codigo_sap ?? "");
      const nombre = String(m?.nombre ?? "");
      const desc = String(m?.descripcion ?? "");
      return {
        ...it,
        material_codigo: codigo,
        material_nombre: nombre || String(it.id_material ?? ""),
        material_descripcion: desc || nombre || String(it.id_material ?? ""),
      };
    });
    return {
      solicitud: {
        ...sol,
        cliente_nombre: n.cliente,
        cliente_documento: n.documento,
        proveedor_nombre: n.proveedor,
        asesor_nombre: (sol.asesor_nombre ?? null) || n.asesor,
        creado_por_nombre: n.creado_por,
        cuenta_contrato: (sol.cuenta_contrato ?? null) || n.cuenta_contrato,
        ambiente: (sol.ambiente ?? null) || n.ambiente,
      },
      items,
      abonos: rAbonos.data ?? [],
      instalacion: rIns.data ?? null,
    };
  } catch (e) {
    exigirTabla(e);
  }
}

/** Buscador de cotizaciones para generar solicitudes (DNI, nombre, cuenta contrato o código; exacta o parcial). */
async function hBuscarCotizacionesParaVenta(args: z.infer<typeof EsquemaBuscarCotizaciones>, ctx: OperacionContext) {
  try {
    const s = String(args.q ?? "").replace(/[%(),]/g, "").trim();
    // Clientes legacy que coinciden (nombre o documento).
    let idsCli: string[] = [];
    if (s) {
      try {
        const { data: clis } = await ctx.service.from("clientes").select("id")
          .or(`nombres.ilike.%${s}%,dni.ilike.%${s}%`).limit(200);
        idsCli = ((clis ?? []) as { id: string }[]).map((c) => String(c.id));
      } catch { /* sin tabla base */ }
    }
    let q = ctx.service.from("cotizaciones").select("*, clientes(id,nombres,dni,email,telefono)").order("created_at", { ascending: false }).limit(args.limit || 100);
    if (args.estado) q = q.eq("estado", String(args.estado).toUpperCase());
    if (args.desde) q = q.gte("created_at", `${args.desde}T00:00:00`);
    if (args.hasta) q = q.lte("created_at", `${args.hasta}T23:59:59`);
    if (s) {
      const partes = [`codigo.ilike.%${s}%`, `cuenta_contrato.ilike.%${s}%`, `asesor.ilike.%${s}%`];
      if (idsCli.length) partes.push(`cliente_id.in.(${idsCli.map((x) => `"${x}"`).join(",")})`);
      q = q.or(partes.join(","));
    }
    const { data, error } = await q;
    if (error) {
      // BD sin columna cuenta_contrato/asesor: reintenta búsqueda básica.
      if (s && /column|schema cache/i.test(error.message)) {
        let q2 = ctx.service.from("cotizaciones").select("*, clientes(id,nombres,dni,email,telefono)").order("created_at", { ascending: false }).limit(args.limit || 100);
        if (args.estado) q2 = q2.eq("estado", String(args.estado).toUpperCase());
        if (args.desde) q2 = q2.gte("created_at", `${args.desde}T00:00:00`);
        if (args.hasta) q2 = q2.lte("created_at", `${args.hasta}T23:59:59`);
        const partes2 = [`codigo.ilike.%${s}%`];
        if (idsCli.length) partes2.push(`cliente_id.in.(${idsCli.map((x) => `"${x}"`).join(",")})`);
        q2 = q2.or(partes2.join(","));
        const r2 = await q2;
        if (r2.error) throw new Error(r2.error.message);
        return anotarConSolicitud(ctx, ((r2.data ?? []) as Fila[]));
      }
      throw new Error(error.message);
    }
    return anotarConSolicitud(ctx, ((data ?? []) as Fila[]));
  } catch (e) {
    exigirTabla(e);
  }
}

/** Visibilidad en solicitudes: la cotización de un proveedor solo la ven su
 *  asesor de venta, su jefe directo (supervisor) y los admin. Devuelve null
 *  = sin filtro (admin o alcance GLOBAL).
 */
async function filtroVisibilidadCotizacion(
  ctx: OperacionContext
): Promise<null | ((c: Fila) => boolean)> {
  if (esAdmin(ctx) || ctx.sesion.alcance === "GLOBAL") return null;
  const userId = String(ctx.sesion.userId ?? "");
  const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  try {
    const email = String(ctx.sesion.email ?? "").toLowerCase().trim();
    let yo: { id: string; nombre: string } | null = null;
    const segPorNombre = new Map<string, string>();
    try {
      const { data: usuarios } = await ctx.service.from("seg_usuarios").select("id,nombre,correo").limit(2000);
      for (const u of ((usuarios ?? []) as Record<string, any>[])) {
        segPorNombre.set(norm(u.nombre), String(u.id));
        if (email && String(u.correo ?? "").toLowerCase().trim() === email) {
          yo = { id: String(u.id), nombre: String(u.nombre ?? "") };
        }
      }
    } catch { /* sin maestro de usuarios */ }
    const supervisados = new Set<string>();
    if (yo) {
      try {
        const { data: asg } = await ctx.service.from("seg_asignaciones_asesores").select("id_asesor").eq("id_supervisor", yo.id);
        for (const a of ((asg ?? []) as Record<string, any>[])) {
          if (a.id_asesor) supervisados.add(String(a.id_asesor));
        }
      } catch { /* sin asignaciones */ }
    }
    const miNombre = yo ? norm(yo.nombre) : "";
    return (c: Fila) => {
      if (userId && String(c.created_by ?? "") === userId) return true; // propia
      const idAsesorCot = segPorNombre.get(norm(c.asesor));
      if (miNombre && norm(c.asesor) === miNombre) return true; // soy su asesor
      if (idAsesorCot && supervisados.has(idAsesorCot)) return true; // soy su supervisor
      return false;
    };
  } catch {
    // Sin datos para filtrar: solo lo propio.
    return (c: Fila) => (userId ? String(c.created_by ?? "") === userId : false);
  }
}

async function anotarConSolicitud(ctx: OperacionContext, cots: Fila[]): Promise<Fila[]> {
  const ver = await filtroVisibilidadCotizacion(ctx);
  const visibles = ver ? cots.filter(ver) : cots;
  const ids = visibles.map((c) => String(c.id)).filter(Boolean);
  const mSol = new Map<string, string>();
  if (ids.length) {
    try {
      const { data } = await ctx.service.from(T_SOL).select("id,cotizacion_id").in("cotizacion_id", ids);
      for (const s of ((data ?? []) as Fila[])) {
        if (s.cotizacion_id) mSol.set(String(s.cotizacion_id), String(s.id));
      }
    } catch { /* sin columna/tabla: ninguna marcada */ }
  }
  // Solo cotizaciones SIN solicitud: las que ya tienen no vuelven a salir
  // ni permiten crear otra.
  return visibles.filter((c) => !mSol.has(String(c.id))).map((c) => {
    const cli = (c.clientes ?? {}) as Record<string, any>;
    return {
      id: c.id,
      codigo: c.codigo,
      created_at: c.created_at,
      estado: c.estado,
      total: c.total,
      subtotal: c.subtotal,
      asesor: c.asesor ?? null,
      asesor_telefono: c.asesor_telefono ?? null,
      proveedor: c.proveedor ?? null,
      cuenta_contrato: c.cuenta_contrato ?? null,
      cliente_nombre: cli.nombres ?? null,
      cliente_doc: cli.dni ?? null,
      cliente_email: cli.email ?? null,
      cliente_telefono: cli.telefono ?? null,
      solicitud_id: null,
    };
  });
}

/** Payload completo de una cotización para prellenar la solicitud de venta. */
async function hObtenerCotizacionParaVenta(args: z.infer<typeof EsquemaCotizacionParaVenta>, ctx: OperacionContext) {
  try {
    const { data: cot, error } = await ctx.service.from("cotizaciones").select("*, clientes(*)").eq("id", args.cotizacion_id).single();
    if (error || !cot) lanzar(404, "Cotización no encontrada");
    const c = cot as Record<string, any>;
    const ver = await filtroVisibilidadCotizacion(ctx);
    if (ver && !ver(c)) lanzar(403, "Sin permiso: la cotización pertenece a otro asesor");
    const cli = ((c as { clientes?: unknown }).clientes ?? {}) as Record<string, any>;
    // Cuenta contrato y ambiente: de la cotización o del maestro por documento.
    let cuentaContrato = String(c.cuenta_contrato ?? "").trim();
    let ambiente = "";
    if (!cuentaContrato || !ambiente) {
      try {
        const dni = String(cli.dni ?? cli.documento ?? "").trim();
        if (dni) {
          const { data: mae } = await ctx.service.from("mae_clientes").select("cuenta_contrato,ambiente").eq("nro_doc", dni).limit(1).maybeSingle();
          const m = (mae ?? {}) as Record<string, any>;
          if (!cuentaContrato) cuentaContrato = String(m.cuenta_contrato ?? "");
          ambiente = String(m.ambiente ?? "");
        }
      } catch { /* sin maestro */ }
    }
    const { data: itemsRaw } = await ctx.service.from("cotizacion_items")
      .select("*, materiales(codigo,nombre,unidad)").eq("cotizacion_id", args.cotizacion_id);
    let items = ((itemsRaw ?? []) as Record<string, any>[]);
    try {
      const { completarNombresItems } = await import("./operaciones");
      items = await completarNombresItems(ctx.service, items);
    } catch { /* sin respaldo */ }
    const lineas = items.map((it) => {
      const cant = Number(it.cantidad ?? 0);
      const punit = Number(it.precio_unit ?? 0);
      const dscto = Number(it.descuento_pct ?? 0);
      const mat = it.descripcion
        ? String(it.descripcion)
        : `${it.materiales?.codigo ?? ""} ${it.materiales?.nombre ?? "Ítem"}`.trim();
      return {
        descripcion: mat,
        material_codigo: String(it.material_codigo ?? it.materiales?.codigo ?? ""),
        cantidad: cant,
        precio_unit: punit,
        descuento_pct: dscto,
      };
    });
    const importeNeto = Math.round(lineas.reduce((a, it) => a + it.cantidad * it.precio_unit * (1 - it.descuento_pct / 100), 0) * 100) / 100;
    const cuotaInicial = Math.max(Number(c.cuota_inicial ?? 0) || 0, 0);
    return {
      cotizacion: {
        id: c.id,
        codigo: c.codigo,
        created_at: c.created_at,
        estado: c.estado,
        cuenta_contrato: cuentaContrato || null,
      },
      cliente: {
        id: c.cliente_id,
        nombres: String(cli.nombres ?? cli.nombre ?? "—"),
        doc: String(cli.dni ?? cli.documento ?? ""),
        email: String(cli.email ?? ""),
        telefono: String(cli.telefono ?? ""),
        cuenta_contrato: cuentaContrato || null,
        ambiente,
      },
      items: lineas,
      financiamiento: {
        cuota_inicial: cuotaInicial,
        capital: Math.max(Math.round((importeNeto - cuotaInicial) * 100) / 100, 0),
        plazo: Number(c.plazo ?? 9) || 9,
        tea: Number(c.tea ?? 0.40) > 1 ? Number(c.tea) / 100 : (Number(c.tea ?? 0.40) || 0.40),
      },
      proveedor: String(c.proveedor ?? ""),
      asesor: String(c.asesor ?? ""),
      asesor_telefono: String(c.asesor_telefono ?? ""),
    };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hRegistrarPV(args: z.infer<typeof EsquemaRegistrarPV>, ctx: OperacionContext) {
  try {
    const { data: sol, error: eSol } = await ctx.service.from(T_SOL).select("*").eq("id", args.solicitud_id).maybeSingle();
    if (eSol) throw new Error(eSol.message);
    if (!sol) lanzar(404, `Solicitud no encontrada: ${args.solicitud_id}`);
    const s = sol as Fila;
    const est = String(s.estado ?? "").toLowerCase();
    if (!["borrador", "observado"].includes(est)) {
      lanzar(422, `Solo se registra PV en solicitudes pendientes (borrador/observado), no en '${est}'`);
    }
    const anticipo = Math.max(Number(s.anticipo ?? 0) || 0, 0);
    const pvAbono = String(args.numero_pedido_abono ?? "").trim();
    if (anticipo > 0 && !pvAbono) lanzar(422, "La solicitud tiene anticipo: registra el PV de abono");
    if (anticipo <= 0 && pvAbono) lanzar(422, "La solicitud no tiene abono inicial: el PV de abono no aplica");
    const parcheCompleto: Fila = {
      numero_pedido: String(args.numero_pedido_venta).trim(),
      codigo_llamada: String(args.codigo_llamada).trim(),
      pv_abono: pvAbono || null,
      estado: "generada",
    };
    let { data, error } = await ctx.service.from(T_SOL).update(parcheCompleto).eq("id", args.solicitud_id).select().single();
    let parcial = false;
    if (error && /column|schema cache/i.test(error.message)) {
      // BD sin migración 03-04: guarda lo esencial (pedido + estado).
      parcial = true;
      const r2 = await ctx.service.from(T_SOL).update({
        numero_pedido: String(args.numero_pedido_venta).trim(),
        estado: "generada",
      }).eq("id", args.solicitud_id).select().single();
      data = r2.data;
      error = r2.error;
    }
    if (error || !data) {
      const m = error?.message ?? "No se pudo registrar el PV";
      if (/duplicate|unique|llave duplicada|ya existe/i.test(m)) lanzar(409, `Ese pedido de venta ya está registrado: ${args.numero_pedido_venta}`);
      throw new Error(m);
    }
    return { solicitud: data, parcial };
  } catch (e) {
    exigirTabla(e);
  }
}

// ---------------------------------------------------------------- Etapa 5: cortes programados

const CLAVES_CORTE = ["ventas_pv", "instalaciones_liq"] as const;

const EsquemaGuardarCorte = z.object({
  clave: z.enum(["ventas_pv", "instalaciones_liq"]),
  horas: z.string().trim().max(200).optional().default(""),
  para: z.string().trim().max(500).optional().default(""),
  copia: z.string().trim().max(500).optional().default(""),
  asunto: z.string().trim().max(200).optional().default(""),
  mensaje: z.string().trim().max(4000).optional().default(""),
  activo: z.coerce.boolean().optional().default(true),
});

const EsquemaEnviarCorte = z.object({
  clave: z.enum(["ventas_pv", "instalaciones_liq"]),
});

/** Hora actual de Lima (para comparar con las horas configuradas). */
export function ahoraLima(): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const m: Record<string, string> = {};
  for (const p of partes) m[p.type] = p.value;
  return { fecha: `${m.year}-${m.month}-${m.day}`, hora: `${m.hour}:${m.minute}` };
}

type Servicio = { from(t: string): any };

async function contarPendientesPV(service: Servicio): Promise<{ cantidad: number; numeros: string[] }> {
  const { data, error } = await service.from(T_SOL).select("id,created_at")
    .in("estado", ["borrador", "observado"]).is("numero_pedido", null)
    .order("created_at", { ascending: true }).limit(51);
  if (error) throw new Error(error.message);
  const filas = ((data ?? []) as Fila[]);
  return { cantidad: filas.length, numeros: filas.slice(0, 20).map((r) => String(r.id)) };
}

async function contarPendientesLiquidar(service: Servicio): Promise<{ cantidad: number; numeros: string[] }> {
  const ids = new Set<string>();
  try {
    const { data } = await service.from(T_SOL).select("id")
      .eq("estado", "validada_proveedor").limit(500);
    for (const r of ((data ?? []) as Fila[])) ids.add(String(r.id));
  } catch { /* sin solicitudes */ }
  try {
    const { data } = await service.from(T_INS).select("solicitud_id")
      .eq("estado", "pendiente_liquidar").limit(500);
    for (const r of ((data ?? []) as Fila[])) ids.add(String(r.solicitud_id));
  } catch { /* estado nuevo aún sin filas */ }
  const lista = [...ids].sort();
  return { cantidad: lista.length, numeros: lista.slice(0, 20) };
}

function aplicarPlantilla(tpl: string, vars: Record<string, string | number>): string {
  let s = String(tpl ?? "");
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

function partirCorreos(s: string): string[] {
  return String(s ?? "").split(/[,;\n]+/).map((x) => x.trim()).filter((x) => /@[a-z]/i.test(x));
}

/** Ejecuta un corte: cuenta pendientes y envía el correo configurado. */
export async function procesarCorte(
  service: Servicio,
  clave: "ventas_pv" | "instalaciones_liq",
  forzar = false
): Promise<{ clave: string; enviado: boolean; motivo: string; cantidad?: number }> {
  const { data: cfg, error } = await service.from("cfg_cortes").select("*").eq("clave", clave).maybeSingle();
  if (error) throw new Error(`Falta la tabla cfg_cortes (migración 03, etapa 5): ${error.message}`);
  if (!cfg) throw new Error(`Corte no configurado: ${clave}`);
  const c = cfg as Record<string, any>;
  if (!c.activo && !forzar) return { clave, enviado: false, motivo: "corte inactivo" };
  const ahora = ahoraLima();
  const horas = String(c.horas ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const marca = `${ahora.fecha} ${ahora.hora}`;
  if (!forzar && (!horas.includes(ahora.hora) || String(c.ultimo_envio ?? "") === marca)) {
    return { clave, enviado: false, motivo: "fuera de horario o ya enviado" };
  }
  const conteo = clave === "ventas_pv"
    ? await contarPendientesPV(service)
    : await contarPendientesLiquidar(service);
  const detalle = conteo.numeros.length > 0
    ? conteo.numeros.map((n) => `• ${n}`).join("\n") + (conteo.cantidad > conteo.numeros.length ? `\n• …y ${conteo.cantidad - conteo.numeros.length} más` : "")
    : "(sin pendientes)";
  const vars = { cantidad: conteo.cantidad, fecha: ahora.fecha, hora: ahora.hora, detalle };
  const para = partirCorreos(String(c.para ?? ""));
  if (para.length === 0) return { clave, enviado: false, motivo: "sin correo destino configurado", cantidad: conteo.cantidad };
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error("SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASS)");
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: para,
    cc: partirCorreos(String(c.copia ?? "")) || undefined,
    subject: aplicarPlantilla(String(c.asunto ?? `Corte ${clave}`), vars),
    text: aplicarPlantilla(String(c.mensaje ?? "{cantidad} pendientes"), vars),
  });
  await service.from("cfg_cortes").update({ ultimo_envio: marca }).eq("clave", clave);
  return { clave, enviado: true, motivo: "enviado", cantidad: conteo.cantidad };
}

async function hCortesListar(_args: unknown, ctx: OperacionContext) {
  try {
    const { data, error } = await ctx.service.from("cfg_cortes").select("*").order("clave");
    if (error) throw new Error(error.message);
    return { cortes: data ?? [], necesitaMigracion: false };
  } catch (e) {
    if (esTablaFaltante(e)) return { cortes: [], necesitaMigracion: true };
    throw e;
  }
}

async function hCorteGuardar(args: z.infer<typeof EsquemaGuardarCorte>, ctx: OperacionContext) {
  const { data, error } = await ctx.service.from("cfg_cortes").upsert({
    clave: args.clave,
    horas: args.horas,
    para: args.para,
    copia: args.copia,
    asunto: args.asunto,
    mensaje: args.mensaje,
    activo: args.activo,
  }).select().single();
  if (error) throw new Error(/Could not find the table|does not exist|42P01/i.test(error.message)
    ? "Falta la tabla cfg_cortes: ejecuta la migración 03 (etapa 5)"
    : error.message);
  return data;
}

async function hCorteEnviar(args: z.infer<typeof EsquemaEnviarCorte>, ctx: OperacionContext) {
  try {
    return await procesarCorte(ctx.service, args.clave, true);
  } catch (e) {
    exigirTabla(e);
  }
}

// ---------------------------------------------------------------- Etapa 6: instalaciones y liquidación

const ESTADOS_INSTALABLE = ["generada", "aprobada", "en_instalacion", "instalada", "observada", "validada_proveedor"];

const EsquemaListarInstalaciones = z.object({
  q: z.string().trim().max(120).optional().default(""),
  estado_sol: z.string().trim().max(40).optional().default(""),
  estado_inst: z.string().trim().max(40).optional().default(""),
  desde: z.string().trim().max(10).optional().default(""),
  hasta: z.string().trim().max(10).optional().default(""),
  limit: zLimit,
  page: zPage,
  pageSize: zPageSize,
});

const zUrlDocOpcional = z.string().trim().max(2000).optional().default("");

const EsquemaRegistrarLiquidacion = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  tipo: z.enum(["anticipo", "acta"]),
  voucher_url: zUrlDocOpcional,
  foto_antes_url: zUrlDocOpcional,
  foto_durante_url: zUrlDocOpcional,
  foto_despues_url: zUrlDocOpcional,
  foto_dni_url: zUrlDocOpcional,
  foto_cliente_dni_url: zUrlDocOpcional,
  acta_url: zUrlDocOpcional,
  boleta_url: zUrlDocOpcional,
});

const EsquemaLiquidar = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
});

/** Instalaciones: solicitudes post-PV con su instalación (cada proveedor ve las suyas). */
async function hListarInstalaciones(args: z.infer<typeof EsquemaListarInstalaciones>, ctx: OperacionContext) {
  try {
    const desde = (args.page - 1) * args.pageSize;
    const sc = alcanceVentas(ctx);
    const armar = (conPV: boolean) => {
      let qq = ctx.service.from(T_SOL).select("*", { count: "exact" }).order("created_at", { ascending: false });
      if (!sc.todo) {
        if (sc.proveedor) qq = qq.or(`id_proveedor.eq.${sc.proveedor},created_by.eq.${ctx.sesion.userId}`);
        else qq = qq.eq("created_by", ctx.sesion.userId);
      }
      qq = qq.in("estado", ["generada", "aprobada", "en_instalacion", "instalada", "validada_proveedor", "pendiente_liquidar", "observada", "cerrada", "liquidada"]);
      if (args.estado_sol) qq = qq.eq("estado", args.estado_sol.toLowerCase());
      if (args.desde) qq = qq.gte("created_at", `${args.desde}T00:00:00`);
      if (args.hasta) qq = qq.lte("created_at", `${args.hasta}T23:59:59`);
      if (args.q) {
        const s = args.q.replace(/[%(),]/g, "");
        let orQ = `id.ilike.%${s}%,id_cliente.ilike.%${s}%,id_proveedor.ilike.%${s}%,observaciones.ilike.%${s}%`;
        if (conPV) orQ += `,numero_pedido.ilike.%${s}%,pv_abono.ilike.%${s}%`;
        qq = qq.or(orQ);
      }
      return qq.range(desde, desde + args.pageSize - 1);
    };
    // PV de ítems → solicitudes (best-effort, sin columnas nuevas = vacío).
    let idsPorPV: string[] = [];
    if (args.q) {
      try {
        const s = args.q.replace(/[%(),]/g, "");
        const { data: its } = await ctx.service.from(T_ITEM).select("solicitud_id")
          .or(`numero_pedido_venta.ilike.%${s}%,numero_pedido_abono.ilike.%${s}%`).limit(500);
        idsPorPV = [...new Set(((its ?? []) as Fila[]).map((it) => String(it.solicitud_id)))];
      } catch { /* sin columnas de pedido */ }
    }
    let { data, error, count } = await armar(true);
    if (error && /column|schema cache/i.test(error.message)) {
      // BD sin migración 03-04: reintenta sin columnas nuevas.
      ({ data, error, count } = await armar(false));
    }
    if (error) throw new Error(error.message);
    let rows = ((data ?? []) as Fila[]);
    if (idsPorPV.length && args.q) {
      try {
        const { data: extra } = await ctx.service.from(T_SOL).select("*").in("id", idsPorPV).limit(200);
        const vistas = new Set(rows.map((r) => String(r.id)));
        const estadosOK = ["generada", "aprobada", "en_instalacion", "instalada", "validada_proveedor", "pendiente_liquidar", "observada", "cerrada", "liquidada"];
        for (const r of ((extra ?? []) as Fila[])) {
          if (vistas.has(String(r.id))) continue;
          if (!estadosOK.includes(String(r.estado ?? "").toLowerCase())) continue;
          if (!sc.todo) {
            const mismaEmpresa = !!sc.proveedor && String(r.id_proveedor ?? "") === sc.proveedor;
            if (!mismaEmpresa && String(r.created_by ?? "") !== ctx.sesion.userId) continue;
          }
          rows = [...rows, r];
          vistas.add(String(r.id));
        }
      } catch { /* sin coincidencias extra */ }
    }
    // Instalación por solicitud (izquierda: sin fila = pendiente de instalar).
    const mIns = new Map<string, Fila>();
    if (rows.length) {
      try {
        const { data: inss } = await ctx.service.from(T_INS)
          .select("*").in("solicitud_id", rows.map((r) => String(r.id)));
        for (const ins of ((inss ?? []) as Fila[])) mIns.set(String(ins.solicitud_id), ins);
      } catch { /* sin tabla */ }
    }
    if (args.estado_inst) {
      const e = args.estado_inst.toLowerCase();
      rows = rows.filter((r) => {
        const ins = mIns.get(String(r.id));
        return e === "pendiente_instalar" ? !ins || String(ins.estado ?? "") === "pendiente" : String(ins?.estado ?? "") === e;
      });
    }
    const enriquecidas = await enriquecerSolicitudes(ctx, rows);
    return {
      rows: enriquecidas.map((r) => {
        const ins = mIns.get(String(r.id));
        return {
          ...r,
          instalacion_estado: ins ? String(ins.estado ?? "") : "pendiente_instalar",
          instalacion_tipo: ins?.tipo_liquidacion ?? null,
          instalacion: ins ?? null,
        };
      }),
      total: count ?? rows.length, page: args.page, pageSize: args.pageSize,
    };
  } catch (e) {
    exigirTabla(e);
  }
}

/** Proveedor registra 1 de 2 formas de solicitud de liquidación → pendiente_liquidar. */
async function hRegistrarLiquidacion(args: z.infer<typeof EsquemaRegistrarLiquidacion>, ctx: OperacionContext) {
  try {
    const { data: sol, error: eSol } = await ctx.service.from(T_SOL).select("*").eq("id", args.solicitud_id).maybeSingle();
    if (eSol) throw new Error(eSol.message);
    if (!sol) lanzar(404, `Solicitud no encontrada: ${args.solicitud_id}`);
    const s = sol as Fila;
    const est = String(s.estado ?? "").toLowerCase();
    if (![...ESTADOS_INSTALABLE, "pendiente_liquidar"].includes(est)) {
      lanzar(422, `La solicitud debe tener PV generado para registrar liquidación (está '${est}')`);
    }
    if (["liquidada", "cerrada"].includes(est)) lanzar(422, "La venta ya está liquidada o cerrada");
    // Solo el proveedor dueño (o admin).
    const sc = alcanceVentas(ctx);
    if (!sc.todo && sc.proveedor && String(s.id_proveedor ?? "") !== sc.proveedor) {
      lanzar(403, "Solo el proveedor de la venta puede registrar su liquidación");
    }
    const U = (v: string | undefined) => String(v ?? "").trim();
    let fila: Fila;
    if (args.tipo === "anticipo") {
      if (!U(args.voucher_url)) lanzar(422, "Sube el voucher del anticipo (PDF o foto)");
      fila = { solicitud_id: args.solicitud_id, tipo_liquidacion: "anticipo", voucher_url: U(args.voucher_url), estado: "pendiente_liquidar" };
    } else {
      const faltan: string[] = [];
      if (!U(args.foto_antes_url)) faltan.push("foto del antes");
      if (!U(args.foto_durante_url)) faltan.push("foto del durante");
      if (!U(args.foto_despues_url)) faltan.push("foto del después");
      if (!U(args.foto_dni_url)) faltan.push("foto del DNI");
      if (!U(args.foto_cliente_dni_url)) faltan.push("foto del cliente con su DNI");
      if (!U(args.acta_url)) faltan.push("acta de conformidad");
      if (!U(args.boleta_url)) faltan.push("boleta de venta");
      if (faltan.length) lanzar(422, `Faltan evidencias del acta: ${faltan.join(", ")}`);
      fila = {
        solicitud_id: args.solicitud_id, tipo_liquidacion: "acta",
        foto_antes_url: U(args.foto_antes_url), foto_durante_url: U(args.foto_durante_url),
        foto_despues_url: U(args.foto_despues_url), foto_dni_url: U(args.foto_dni_url),
        foto_cliente_dni_url: U(args.foto_cliente_dni_url), acta_url: U(args.acta_url),
        boleta_url: U(args.boleta_url), estado: "pendiente_liquidar",
      };
    }
    // Upsert por solicitud (tolerante a columnas/estados nuevos sin migración).
    let ins = await ctx.service.from(T_INS).upsert(fila, { onConflict: "solicitud_id" }).select().single();
    if (ins.error && /column|schema cache|check|constraint|violates/i.test(ins.error.message)) {
      const base: Fila = {
        solicitud_id: args.solicitud_id,
        foto_antes_url: U(args.foto_antes_url) || U(args.voucher_url),
        foto_despues_url: U(args.foto_despues_url) || U(args.voucher_url),
        boleta_url: U(args.boleta_url) || U(args.voucher_url),
        acta_url: U(args.acta_url) || U(args.voucher_url),
        estado: "registrada",
      };
      ins = await ctx.service.from(T_INS).upsert(base, { onConflict: "solicitud_id" }).select().single();
      if (ins.error) throw new Error(ins.error.message);
      const u2 = await ctx.service.from(T_SOL).update({ estado: "instalada" }).eq("id", args.solicitud_id);
      if (u2.error) throw new Error(u2.error.message);
      return { instalacion: ins.data, parcial: true };
    }
    const upd = await ctx.service.from(T_SOL).update({ estado: "pendiente_liquidar" }).eq("id", args.solicitud_id);
    if (upd.error) throw new Error(upd.error.message);
    return { instalacion: ins.data, parcial: false };
  } catch (e) {
    exigirTabla(e);
  }
}

/** Stephany liquida (ya lo hizo en SAP): verifica evidencias y cierra → liquidada. */
async function hLiquidarVenta(args: z.infer<typeof EsquemaLiquidar>, ctx: OperacionContext) {
  try {
    const { data: ins, error: eIns } = await ctx.service.from(T_INS).select("*").eq("solicitud_id", args.solicitud_id).maybeSingle();
    if (eIns) throw new Error(eIns.message);
    if (!ins) lanzar(422, "La venta no tiene liquidación registrada por el proveedor");
    const f = ins as Fila;
    if (String(f.estado ?? "") !== "pendiente_liquidar") {
      lanzar(422, `Solo se liquida desde 'pendiente de liquidar' (está '${f.estado ?? ""}')`);
    }
    // Verifica evidencias completas antes de liquidar.
    const tiene = (v: unknown) => String(v ?? "").trim().length > 0;
    if (String(f.tipo_liquidacion ?? "") === "anticipo") {
      if (!tiene(f.voucher_url)) lanzar(422, "Falta el voucher del anticipo");
    } else {
      const faltan = ["foto_antes_url", "foto_durante_url", "foto_despues_url", "foto_dni_url", "foto_cliente_dni_url", "acta_url", "boleta_url"].filter((k) => !tiene(f[k]));
      if (faltan.length) lanzar(422, `Evidencias incompletas: faltan ${faltan.length} archivo(s)`);
    }
    const u1 = await ctx.service.from(T_INS).update({ estado: "liquidada" }).eq("solicitud_id", args.solicitud_id);
    if (u1.error) throw new Error(u1.error.message);
    const u2 = await ctx.service.from(T_SOL).update({ estado: "liquidada" }).eq("id", args.solicitud_id);
    if (u2.error) throw new Error(u2.error.message);
    return { ok: true };
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
  registrarPV: { descripcion: "Ventas: registra PV + código de llamada → generada (PV abono solo si hubo anticipo)", roles: SOLO_ADMIN, schema: EsquemaRegistrarPV, handler: hRegistrarPV },
  cfgCortesListar: { descripcion: "Cortes: lee configuración de cortes programados", roles: SOLO_ADMIN, schema: z.object({}).passthrough(), handler: hCortesListar },
  cfgCorteGuardar: { descripcion: "Cortes: guarda horas/correos/asunto/mensaje de un corte", roles: SOLO_ADMIN, schema: EsquemaGuardarCorte, handler: hCorteGuardar },
  cfgCorteEnviar: { descripcion: "Cortes: envía ahora un corte (prueba)", roles: SOLO_ADMIN, schema: EsquemaEnviarCorte, handler: hCorteEnviar },
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
  listarInstalaciones: { descripcion: "Instalaciones: solicitudes post-PV con su instalación (scope proveedor)", roles: TODOS, schema: EsquemaListarInstalaciones, handler: hListarInstalaciones },
  registrarLiquidacion: { descripcion: "Instalaciones: proveedor registra anticipo o acta → pendiente_liquidar", roles: OPERATIVO, schema: EsquemaRegistrarLiquidacion, handler: hRegistrarLiquidacion },
  liquidarVenta: { descripcion: "Instalaciones: liquida tras verificar evidencias → liquidada", roles: SOLO_ADMIN, schema: EsquemaLiquidar, handler: hLiquidarVenta },
  buscarCotizacionesParaVenta: { descripcion: "Ventas: busca cotizaciones por DNI/nombre/cta-cto/código para generar solicitud", roles: TODOS, schema: EsquemaBuscarCotizaciones, handler: hBuscarCotizacionesParaVenta },
  obtenerCotizacionParaVenta: { descripcion: "Ventas: payload de cotización para prellenar la solicitud", roles: OPERATIVO, schema: EsquemaCotizacionParaVenta, handler: hObtenerCotizacionParaVenta },
};

/** Reglas del módulo (para el coordinador/UI): roles, TEA, adjuntos, aprobaciones y alcance. */
export const REGLAS_VENTAS = {
  tablas: [T_SOL, T_ITEM, T_ABO, T_INS],
  schema_sql: "supabase/schema_ventas.sql",
  scope_por_rol: "GLOBAL (admin): todo. EMPRESA (proveedor): ventas de su empresa + propias. EQUIPO/PROPIO: solo propias (EQUIPO completo requiere matriz de equipos). Instalaciones: admin todo, proveedor las suyas",
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
