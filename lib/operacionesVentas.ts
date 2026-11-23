import { z } from "zod";
import type { RolUsuario } from "./auth";
import type { OperacionContext } from "./operaciones";
import { resolverAlcance, aplicarAlcanceVentas, puedeVerVenta, puedeVerCotizacion } from "./alcance";
import { correoConfigurado, enviarCorreo, MSG_CORREO_NO_CONFIGURADO } from "./mailer";
import { CLAVE_CORREO_COTIZACION, obtenerConfigCorreoCotizacion } from "./correoCotizacion";
import { cuotaFrancesaConIgv } from "./financiamiento";
import { tokensMaterial } from "./materialMatch";
import { verificarPermisoMatriz } from "./permisosMatriz";

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
const T_EVID = "vta_instalacion_evidencias";

/** Evidencias que el proveedor entrega y administración revisa una por una. */
const EVIDENCIAS_INSTALACION = [
  "foto_antes",
  "foto_durante",
  "foto_despues",
  "foto_dni",
  "foto_cliente_dni",
  "acta",
  "boleta",
] as const;
type TipoEvidencia = (typeof EVIDENCIAS_INSTALACION)[number];

/** Estados de solicitud (12): borrador → generada (PV) → instalada → revisión → liquidada. */
export const ESTADOS_SOLICITUD = [
  "borrador",
  "pendiente_aprobacion",
  "observado",
  "subsanado_pendiente",
  "aprobada",
  "generada",
  "en_instalacion",
  "instalada",
  "observado_por_sustento",
  "validada_proveedor",
  "cerrada",
  "pendiente_liquidar",
  "liquidada",
] as const;

/** Estados de abono (3, igual que SQL). */
export const ESTADOS_ABONO = ["pendiente", "efectuado", "validado"] as const;

/** Estados de instalación (8, igual que SQL). */
export const ESTADOS_INSTALACION = [
  "pendiente",
  "registrada",
  "validada_proveedor",
  "observada",
  "subsanado_pendiente",
  "pendiente_liquidar",
  "cerrada",
  "liquidada",
] as const;

const zLimit = z.coerce.number().int().min(1).max(500).default(100);
const zPage = z.coerce.number().int().min(1).optional().default(1);
const zPageSize = z.coerce.number().int().min(1).max(200).optional().default(25);
const esUrlHttp = (v: string) => /^https?:\/\//i.test(v);
const zUrlDoc = z.string().trim().min(8).max(2000).refine(esUrlHttp, "URL inválida: debe iniciar con http:// o https://");

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

/**
 * Ids recientes de un maestro, en orden descendente: sin el orden desc,
 * `limit(n)` trae las filas más antiguas y el correlativo se calcula sobre
 * una muestra (mae_clientes ya tiene >10k filas y el id nuevo choca).
 */
async function idsParaCorrelativo(ctx: OperacionContext, tabla: string, limite = 5000): Promise<string[]> {
  const { data } = await ctx.service.from(tabla).select("id").order("id", { ascending: false }).limit(limite);
  return ((data ?? []) as { id?: string }[]).map((r) => String(r.id ?? ""));
}

/** Scope por rol: asesor/oficina solo ven lo creado por ellos (created_by propio). */
function esAdmin(ctx: OperacionContext): boolean {
  return ctx.sesion.rol === "admin";
}

function exigirAdminOProveedor(ctx: OperacionContext): void {
  if (esAdmin(ctx) || ctx.sesion.alcance === "GLOBAL") return;
  if (ctx.sesion.alcance === "EMPRESA" && ctx.sesion.idProveedor) return;
  lanzar(403, "Solo el administrador o el proveedor asignado puede acceder a instalaciones");
}

/**
 * Alcance de lectura de ventas (ver lib/alcance.ts):
 * GLOBAL = todo; EMPRESA = solo su proveedor; EQUIPO = asesores asignados de
 * la misma empresa; PROPIO = registros propios identificados por UUID.
 */
type Fila = Record<string, any>;

/** Carga la venta y exige que el usuario pueda verla (404 si no existe, 403 si es ajena). */
async function ventaVisible(ctx: OperacionContext, id: string): Promise<Fila> {
  const { data, error } = await ctx.service.from(T_SOL).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) lanzar(404, `Solicitud no encontrada: ${id}`);
  const a = await resolverAlcance(ctx.service, ctx.sesion);
  if (!puedeVerVenta(a, data as Fila)) {
    lanzar(403, "Sin permiso: la venta pertenece a otro usuario o empresa");
  }
  return data as Fila;
}

/** Carga las evidencias de una solicitud (tabla nueva de migración 04). */
async function cargarEvidencias(ctx: OperacionContext, solicitudId: string): Promise<Fila[]> {
  const { data, error } = await ctx.service.from(T_EVID)
    .select("*").eq("solicitud_id", solicitudId).order("tipo", { ascending: true });
  if (error) {
    if (esTablaFaltante(error) || /Could not find the table|schema cache/i.test(error.message)) {
      lanzar(503, "Falta la tabla de evidencias: ejecuta supabase/migracion_04_cotizaciones_ventas_integradores.sql");
    }
    throw new Error(error.message);
  }
  const orden = new Map(EVIDENCIAS_INSTALACION.map((t, i) => [t, i]));
  return ((data ?? []) as Fila[]).sort((a, b) => (orden.get(String(a.tipo) as TipoEvidencia) ?? 99) - (orden.get(String(b.tipo) as TipoEvidencia) ?? 99));
}

/** Carga evidencias de varias solicitudes en una sola consulta (para la bandeja). */
async function cargarEvidenciasDe(ctx: OperacionContext, ids: string[]): Promise<Map<string, Fila[]>> {
  const out = new Map<string, Fila[]>();
  if (!ids.length) return out;
  try {
    const { data, error } = await ctx.service.from(T_EVID).select("*").in("solicitud_id", ids);
    if (error) return out;
    for (const e of ((data ?? []) as Fila[])) {
      const k = String(e.solicitud_id);
      out.set(k, [...(out.get(k) ?? []), e]);
    }
  } catch { /* sin tabla: la bandeja sigue funcionando sin evidencias */ }
  return out;
}

/** Guarda/actualiza las evidencias enviadas y las devuelve a revisión pendiente. */
async function sincronizarEvidencias(
  ctx: OperacionContext,
  solicitudId: string,
  urls: Partial<Record<TipoEvidencia, string>>
): Promise<Fila[]> {
  const filas = EVIDENCIAS_INSTALACION
    .map((tipo) => ({ tipo, url: String(urls[tipo] ?? "").trim() }))
    .filter((f) => f.url.length > 0);
  if (!filas.length) return [];
  const anteriores = await cargarEvidencias(ctx, solicitudId);
  const { data, error } = await ctx.service.from(T_EVID).upsert(
    filas.map((f) => {
      const anterior = anteriores.find((e) => e.tipo === f.tipo);
      const conservar = anterior?.estado === "aprobado" && anterior.url === f.url;
      return {
        solicitud_id: solicitudId,
        tipo: f.tipo,
        url: f.url,
        estado: conservar ? "aprobado" : "pendiente",
        observacion: null,
        revisado_por: conservar ? anterior.revisado_por : null,
        revisado_at: conservar ? anterior.revisado_at : null,
      };
    }),
    { onConflict: "solicitud_id,tipo" }
  ).select();
  if (error) {
    if (esTablaFaltante(error) || /Could not find the table|schema cache/i.test(error.message)) {
      lanzar(503, "Falta la tabla de evidencias: ejecuta supabase/migracion_04_cotizaciones_ventas_integradores.sql");
    }
    throw new Error(error.message);
  }
  return (data ?? []) as Fila[];
}

/** Valida un pedido de venta y, si hay anticipo, un pedido de abono, asignados a sus filas de tipo correspondientes. */
async function exigirPedidosRegistrados(ctx: OperacionContext, solicitudId: string): Promise<void> {
  const { data, error } = await ctx.service.from(T_ITEM)
    .select("id,numero_pedido_venta,numero_pedido_abono,tipo_pedido").eq("solicitud_id", solicitudId);
  if (error) throw new Error(error.message);
  const items = (data ?? []) as Fila[];
  if (!items.length) lanzar(422, "La venta no tiene ítems/pedidos registrados.");
  const itemsVenta = items.filter((it) => String(it.tipo_pedido ?? "VENTA").toUpperCase() === "VENTA");
  const itemsAbono = items.filter((it) => String(it.tipo_pedido ?? "VENTA").toUpperCase() === "ABONO");
  const tienePedidoVenta = itemsVenta.some((it) => String(it.numero_pedido_venta ?? "").trim());
  const tienePedidoAbono = itemsAbono.some((it) => String(it.numero_pedido_abono ?? "").trim());
  const { data: solicitud, error: errorSolicitud } = await ctx.service.from(T_SOL).select("anticipo,pv_abono,numero_pedido").eq("id", solicitudId).maybeSingle();
  if (errorSolicitud) throw new Error(errorSolicitud.message);
  const pedidoVentaCabecera = String((solicitud as Fila | null)?.numero_pedido ?? "").trim();
  if (!tienePedidoVenta && !pedidoVentaCabecera) lanzar(422, "Falta registrar el pedido de venta en los ítems de tipo VENTA.");
  const anticipo = Number((solicitud as Fila | null)?.anticipo ?? 0);
  if (anticipo > 0 && !tienePedidoAbono && !String((solicitud as Fila | null)?.pv_abono ?? "").trim()) {
    lanzar(422, "Falta registrar el pedido de abono en los ítems de tipo ABONO.");
  }
}

/** Todas las evidencias deben estar aprobadas por administración. */
async function exigirEvidenciasAprobadas(ctx: OperacionContext, solicitudId: string): Promise<Fila[]> {
  const evidencias = await cargarEvidencias(ctx, solicitudId);
  if (!evidencias.length) lanzar(422, "El proveedor aún no entregó el acta ni los sustentos.");
  const faltan = EVIDENCIAS_INSTALACION.filter((t) => !evidencias.some((e) => String(e.tipo) === t && String(e.estado) === "aprobado"));
  if (faltan.length) lanzar(422, `Administración debe aprobar ${faltan.length} evidencia(s): ${faltan.join(", ")}.`);
  return evidencias;
}


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
    const { VENTAS_ADMIN_EMAIL, ADMIN_EMAIL, RESEND_ADMIN_EMAIL, SENDGRID_ADMIN_EMAIL, SMTP_USER } = process.env;
    const destinos = partirCorreos(
      [VENTAS_ADMIN_EMAIL, ADMIN_EMAIL, RESEND_ADMIN_EMAIL, SENDGRID_ADMIN_EMAIL, SMTP_USER].filter(Boolean).join(",")
    );
    if (!correoConfigurado() || destinos.length === 0) return "omitido";
    await enviarCorreo({
      to: destinos,
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
    const [{ data: cfg, error: eCfg }, { data: solicitud, error: eSol }] = await Promise.all([
      ctx.service.from("cfg_cortes").select("activo,modo_envio").eq("clave", "subsanaciones").maybeSingle(),
      ctx.service.from(T_SOL).select("id_proveedor").eq("id", solicitudId).maybeSingle(),
    ]);
    if (eCfg || eSol || !cfg || !solicitud) return "omitido";
    const { data: aviso, error } = await ctx.service.from("cfg_subsanaciones_cola").insert({
      solicitud_id: solicitudId,
      id_proveedor: (solicitud as Fila).id_proveedor ?? null,
      etapa,
      motivo: motivo.trim(),
    }).select("id").single();
    if (error || !aviso) return "omitido";
    if (cfg.activo && String(cfg.modo_envio ?? "automatico") === "automatico" && correoConfigurado()) {
      const resultado = await procesarAvisosSubsanacion(ctx.service, true, [Number((aviso as Fila).id)]);
      return resultado.enviado ? "enviado" : "omitido";
    }
    return "omitido";
  } catch {
    return "omitido";
  }
}

async function resolverAvisosSubsanacion(service: Servicio, solicitudId: string, etapas?: string[]): Promise<void> {
  try {
    let q = service.from("cfg_subsanaciones_cola").update({ resuelto_at: new Date().toISOString() })
      .eq("solicitud_id", solicitudId).is("enviado_at", null).is("resuelto_at", null);
    if (etapas?.length) q = q.in("etapa", etapas);
    await q;
  } catch { /* la cola se habilita con migracion_subsanaciones_correo_01.sql */ }
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
  cotizacion_item_id: z.string().uuid().optional().nullable(),
  id_material: z.string().trim().min(1).max(120),
  material_codigo: z.string().trim().max(60).optional().default(""),
  material_nombre: z.string().trim().max(300).optional().default(""),
  tipo_pedido: z.enum(["VENTA", "ABONO"]).optional().default("VENTA"),
  cantidad: z.coerce.number().gt(0).max(100_000),
  precio_unit: z.coerce.number().min(0).max(10_000_000),
  descuento_monto: z.coerce.number().min(0).max(10_000_000).optional().default(0),
  modo: z.enum(["financiado", "contado"]),
  medio_pago: z.enum(["financiado", "efectivo", "tarjeta", "abono"]),
  nro_cuotas: z.coerce.number().int().min(1).max(360).optional().nullable(),
  cuota_mensual: z.coerce.number().min(0).max(10_000_000).optional().default(0),
  alto: z.coerce.number().min(0).max(1000).optional().default(0),
  ancho: z.coerce.number().min(0).max(1000).optional().default(0),
  fondo: z.coerce.number().min(0).max(1000).optional().default(0),
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
  medio_respaldo: z.enum(["audio", "voucher", "contrato"]).optional(),
  codigo_llamada: z.string().trim().max(60).optional().default(""),
  voucher_solicitud_url: zUrlDoc.optional(),
  contrato_fisico_url: zUrlDoc.optional(),
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
  cuota_mensual: z.coerce.number().min(0).max(10_000_000).optional().default(0),
  items: z.array(EsquemaItemVenta).min(1).max(200),
}).superRefine((v, ctx) => {
  const tieneAbono = Number(v.anticipo ?? 0) > 0
    || v.pago_modo === "mixto"
    || v.pago_modo === "con_abono"
    || v.items.some((item) => item.tipo_pedido === "ABONO");
  if (tieneAbono) {
    if (!v.voucher_solicitud_url) ctx.addIssue({ code: "custom", path: ["voucher_solicitud_url"], message: "Adjunta el voucher del abono." });
  } else {
    if (!v.codigo_llamada.trim()) ctx.addIssue({ code: "custom", path: ["codigo_llamada"], message: "Ingresa el código de llamada." });
    if (!v.contrato_fisico_url) ctx.addIssue({ code: "custom", path: ["contrato_fisico_url"], message: "Adjunta el contrato físico firmado." });
    if (v.voucher_solicitud_url) ctx.addIssue({ code: "custom", path: ["voucher_solicitud_url"], message: "No se puede adjuntar voucher si la solicitud no tiene abono." });
  }
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
  codigo_llamada: z.string().trim().max(60).optional(),
  numero_pedido_venta: z.string().trim().min(1).max(60),
  numero_pedido_abono: z.string().trim().max(60).optional().default(""),
});

const EsquemaInstalacion = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  foto_antes_url: zUrlDoc,
  foto_durante_url: zUrlDoc,
  foto_despues_url: zUrlDoc,
  foto_dni_url: zUrlDoc,
  foto_cliente_dni_url: zUrlDoc,
  boleta_url: zUrlDoc,
  acta_url: zUrlDoc,
  observacion: z.string().trim().max(2000).optional().default(""),
});

const EsquemaRevisarEvidencia = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  tipo: z.enum(EVIDENCIAS_INSTALACION),
  accion: z.enum(["aprobar", "rechazar"]),
  observacion: z.string().trim().max(2000).optional().default(""),
}).superRefine((v, ctx) => {
  if (v.accion === "rechazar" && !v.observacion.trim()) {
    ctx.addIssue({ code: "custom", path: ["observacion"], message: "Indica qué debe subsanar el proveedor." });
  }
});

const EsquemaRevisarEvidencias = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  decisiones: z.array(z.object({
    tipo: z.enum(EVIDENCIAS_INSTALACION),
    aprobada: z.boolean(),
    observacion: z.string().trim().max(2000).default(""),
  }).refine((d) => d.aprobada || d.observacion.length > 0, { message: "Indica qué debe subsanarse." })).length(EVIDENCIAS_INSTALACION.length),
}).refine((v) => new Set(v.decisiones.map((d) => d.tipo)).size === EVIDENCIAS_INSTALACION.length, { message: "Cada evidencia debe revisarse una vez." });

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
    const a = await resolverAlcance(ctx.service, ctx.sesion);
    q = aplicarAlcanceVentas(q, a);
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
        q2 = aplicarAlcanceVentas(q2, a);
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
      const { data: its } = await ctx.service.from(T_ITEM).select("solicitud_id,subtotal,id_material,material_nombre,tipo_pedido").in("solicitud_id", idsSol).order("id", { ascending: true }).limit(2000);
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
        const materiales = [...new Set(lista
          .filter((it) => String(it.tipo_pedido ?? "VENTA").toUpperCase() !== "ABONO")
          .map((it) => String(it.material_nombre ?? mNom.get(String(it.id_material ?? "")) ?? "").trim())
          .filter(Boolean))];
        mMat.set(k, materiales.length ? materiales.join(", ") : "—");
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
        cuenta_contrato: n.cuenta_contrato || cot?.cuenta_contrato || (r.cuenta_contrato ?? null),
        ambiente: n.ambiente || (r.ambiente ?? null),
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
  const nuevo = siguienteId("CLI", await idsParaCorrelativo(ctx, "mae_clientes"), 6);
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

/** Resuelve y autoriza la empresa proveedora en el ámbito del usuario. */
function validarProveedorEnSesion(
  ctx: OperacionContext,
  proveedor: { id: string }
): void {
  if (ctx.sesion.rol === "admin" || ctx.sesion.alcance === "GLOBAL") return;
  const asignados = new Set([...(ctx.sesion.idProveedores ?? []), ...(ctx.sesion.idProveedor ? [ctx.sesion.idProveedor] : [])]);
  if (!asignados.has(proveedor.id)) lanzar(403, "La empresa proveedora no está asignada a tu usuario");
}

async function resolverProveedorSGT(ctx: OperacionContext, id: string): Promise<{ id: string; nombre: string }> {
  const { data: ex, error: eProveedor } = await ctx.service.from("mae_proveedores")
    .select("id,razon_social,nombre_comercial").eq("id", id).maybeSingle();
  if (eProveedor) throw new Error(eProveedor.message);
  if (ex) {
    const p = ex as { id: string; razon_social?: string; nombre_comercial?: string };
    validarProveedorEnSesion(ctx, p);
    return {
      id: p.id,
      nombre: String(p.razon_social ?? p.nombre_comercial ?? p.id),
    };
  }
  if (ctx.sesion.rol !== "admin" && ctx.sesion.alcance !== "GLOBAL") {
    lanzar(403, "Solo administración puede migrar proveedores antiguos");
  }
  const { data: base } = await ctx.service.from("proveedores").select("*").eq("id", id).maybeSingle();
  if (!base) lanzar(422, "El proveedor no existe en mae_proveedores: créalo en Administración > Proveedores");
  const b = base as Record<string, any>;
  if (b.ruc) {
    const { data: previo } = await ctx.service.from("mae_proveedores").select("id").eq("ruc", String(b.ruc)).limit(1).maybeSingle();
    if (previo) {
      const p = previo as { id: string };
      validarProveedorEnSesion(ctx, { id: p.id });
      return { id: p.id, nombre: String(b.nombre ?? p.id) };
    }
  }
  if (!b.ruc) lanzar(422, "El proveedor base no tiene RUC: complétalo en Administración > Proveedores antes de vender");
  const nuevo = siguienteId("PRV", await idsParaCorrelativo(ctx, "mae_proveedores"));
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
  validarProveedorEnSesion(ctx, { id: nuevo });
  return { id: nuevo, nombre: String(b.nombre ?? nuevo) };
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
  const nuevo = siguienteId("MAT-", await idsParaCorrelativo(ctx, "mae_materiales"), 5);
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

async function hCrearSolicitudDesdeCotizacion(args: z.infer<typeof EsquemaCrearSolicitud>, ctx: OperacionContext) {
  try {
    const { data: cot, error: eCot } = await ctx.service.from("cotizaciones")
      .select("*").eq("id", args.cotizacion_id).maybeSingle();
    if (eCot) throw new Error(eCot.message);
    if (!cot) lanzar(404, "Cotización no encontrada");
    const c = cot as Fila;
    const alcance = await resolverAlcance(ctx.service, ctx.sesion);
    if (!puedeVerCotizacion(alcance, c)) lanzar(403, "No tienes acceso a esta cotización");
    const { data: existente, error: eExistente } = await ctx.service.from(T_SOL)
      .select("id").eq("cotizacion_id", args.cotizacion_id).limit(1).maybeSingle();
    if (eExistente) throw new Error(eExistente.message);
    if (existente) lanzar(409, "Esta cotización ya tiene una solicitud de venta");

    const proveedorSolicitado = String(args.id_proveedor ?? c.id_proveedor ?? "");
    const empresa = await resolverProveedorSGT(ctx, proveedorSolicitado);
    if (c.id_proveedor && String(c.id_proveedor) !== empresa.id) {
      lanzar(422, "La empresa proveedora no coincide con la cotización");
    }

    const { data: cotItems, error: eItems } = await ctx.service.from("cotizacion_items")
      .select("id,cantidad,precio_unit,descuento_pct,total_linea,descripcion,material_codigo,ambiente,alto,ancho,fondo")
      .eq("cotizacion_id", args.cotizacion_id).order("id", { ascending: true });
    if (eItems) throw new Error(eItems.message);
    const lineas = (cotItems ?? []) as Fila[];
    if (!lineas.length) lanzar(422, "La cotización no tiene materiales.");
    const normalizar = (v: unknown) => String(v ?? "").trim().toLowerCase();
    const lineasProducto = lineas.map((it) => {
      const bruto = red2(Number(it.cantidad ?? 1) * Number(it.precio_unit ?? 0));
      const neto = red2(Number(it.total_linea ?? bruto * (1 - Number(it.descuento_pct ?? 0) / 100)));
      return { ...it, neto: Math.max(neto, 0) };
    }) as Fila[];
    const totalProducto = red2(lineasProducto.reduce((sum, it) => sum + it.neto, 0));
    if (!(totalProducto > 0)) lanzar(422, "El valor de los productos de la cotización debe ser mayor que cero");
    const anticipo = Math.max(Number(c.cuota_inicial ?? 0) || 0, 0);
    if (anticipo > totalProducto) lanzar(422, "El abono de la cotización supera el valor de sus productos");
    const montoFinanciado = red2(Math.max(totalProducto - anticipo, 0));
    const teaRaw = Number(c.tea ?? 0.4);
    const tea = teaRaw > 1 ? teaRaw / 100 : teaRaw;
    const plazo = Number(c.plazo ?? 9) || 9;
    const cuotaTotal = montoFinanciado > 0
      ? cuotaFrancesaConIgv(montoFinanciado, tea, plazo)
      : 0;

    const detalles: Fila[] = [];
    const abonosPorLinea = lineasProducto.map((it) => totalProducto > 0 ? red2(anticipo * it.neto / totalProducto) : 0);
    if (abonosPorLinea.length) {
      const asignado = red2(abonosPorLinea.slice(0, -1).reduce((sum, monto) => sum + monto, 0));
      abonosPorLinea[abonosPorLinea.length - 1] = red2(anticipo - asignado);
    }
    for (const [i, it] of lineasProducto.entries()) {
      const ambiente = String(it.ambiente ?? c.ambiente ?? "");
      const mapeo = await resolverMaterialVentaCotizacion(ctx, {
        ...c,
        id_proveedor: empresa.id,
        id_integrador: null,
        proveedor: empresa.nombre,
      }, { ...it, ambiente });
      const parteAbono = abonosPorLinea[i] ?? 0;
      const financiado = red2(Math.max(it.neto - parteAbono, 0));
      const common = {
        solicitud_id: "",
        id_material: String(mapeo.id),
        material_codigo: String(mapeo.codigo_sap ?? ""),
        material_nombre: String(mapeo.nombre ?? it.descripcion ?? ""),
        cantidad: 1,
        descuento_monto: 0,
        alto: Number(it.alto ?? 0),
        ancho: Number(it.ancho ?? 0),
        fondo: Number(it.fondo ?? 0),
        modo: "financiado" as const,
        medio_pago: "financiado",
      };
      if (financiado > 0) {
        detalles.push({
          ...common,
          tipo_pedido: "VENTA",
          precio_unit: financiado,
          subtotal: financiado,
          nro_cuotas: plazo,
          cuota_mensual: cuotaFrancesaConIgv(financiado, tea, plazo),
        });
      }
    }
    if (anticipo > 0) {
      const primera = lineasProducto[0];
      const material = await resolverMaterialVentaCotizacion(ctx, {
        ...c,
        id_proveedor: empresa.id,
        id_integrador: null,
        proveedor: empresa.nombre,
      }, { ...primera, ambiente: String(primera.ambiente ?? c.ambiente ?? "") });
      detalles.push({
        solicitud_id: "",
        id_material: String(material.id),
        material_codigo: String(material.codigo_sap ?? ""),
        material_nombre: `ABONO INICIAL · ${String(material.nombre ?? primera.descripcion ?? "")}`.trim(),
        cantidad: 1,
        descuento_monto: 0,
        alto: 0,
        ancho: 0,
        fondo: 0,
        modo: "contado",
        medio_pago: "efectivo",
        tipo_pedido: "ABONO",
        precio_unit: red2(anticipo),
        subtotal: red2(anticipo),
        nro_cuotas: 1,
        cuota_mensual: 0,
      });
    }

    const idClienteSGT = await resolverClienteSGT(ctx, String(c.cliente_id));
    let idAsesor: string | null = c.id_asesor ? String(c.id_asesor) : (args.id_asesor || null);
    let asesorNombre = String(c.asesor ?? args.asesor ?? "").trim();
    if (idAsesor) {
      const { data: ficha } = await ctx.service.from("seg_usuarios").select("id,nombre").eq("id", idAsesor).maybeSingle();
      if (!ficha) idAsesor = await resolverAsesorPorNombre(ctx, asesorNombre);
      else if (!asesorNombre) asesorNombre = String((ficha as { nombre?: string }).nombre ?? "");
    }
    if (!idAsesor && asesorNombre) idAsesor = await resolverAsesorPorNombre(ctx, asesorNombre);

    const id = siguienteVTA(await idsParaCorrelativo(ctx, T_SOL));
    const filaSol: Fila = {
      id,
      id_cliente: idClienteSGT,
      id_proveedor: empresa.id,
       id_integrador: null,
      cotizacion_id: c.id,
      canal: args.canal,
      es_microaliado: args.es_microaliado ?? false,
      visita_estado: args.visita_estado ?? "visitado",
      pago_modo: anticipo > 0 ? "con_abono" : "financiado",
      proyecto_financiado: montoFinanciado > 0,
      id_asesor: idAsesor,
      asesor_nombre: asesorNombre || null,
      asesor_telefono: String(c.asesor_telefono ?? args.asesor_telefono ?? "") || null,
      tea: tea * 100,
      anticipo,
      monto_financiado: montoFinanciado,
      nro_cuotas: plazo,
      cuota_mensual: cuotaTotal,
      ambiente: String(c.ambiente ?? [...new Set(lineasProducto.map((x) => x.ambiente).filter(Boolean))].join(", ")),
      codigo_llamada: args.codigo_llamada.trim() || null,
      medio_respaldo: args.codigo_llamada.trim() ? "audio" : args.voucher_solicitud_url ? "voucher" : "contrato",
      voucher_solicitud_url: args.voucher_solicitud_url || null,
      contrato_fisico_url: args.contrato_fisico_url || null,
      observaciones: args.observaciones || "",
      estado: "borrador",
      created_by: ctx.sesion.userId,
    };
    const { data: cab, error: eCab } = await ctx.service.from(T_SOL).insert(filaSol).select().single();
    if (eCab || !cab) {
      if (/column|schema cache/i.test(eCab?.message ?? "")) {
        throw new Error("Falta la migración 04 para solicitudes y pedidos de material.");
      }
      if (/foreign key|llave foránea|violates foreign/i.test(eCab?.message ?? "")) {
        lanzar(422, "El cliente, proveedor o material ya no existe en el maestro.");
      }
      throw new Error(eCab?.message ?? "No se pudo crear la solicitud de venta");
    }
    const filasVenta = detalles.map(({ solicitud_id: _sid, ...rest }) => ({ ...rest, solicitud_id: id }));
    const { data: saleItems, error: eDet } = await ctx.service.from(T_ITEM).insert(filasVenta).select();
    if (eDet) {
      await ctx.service.from(T_SOL).delete().eq("id", id);
      if (/column|schema cache/i.test(eDet.message)) throw new Error(`No se pudo guardar el detalle de venta: ${eDet.message}`);
      throw new Error(eDet.message);
    }
    return { solicitud: cab, items: saleItems ?? [], id, numero: id, total: totalProducto, estado: "borrador" };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hCrearSolicitud(args: z.infer<typeof EsquemaCrearSolicitud>, ctx: OperacionContext) {
  if (args.cotizacion_id) return hCrearSolicitudDesdeCotizacion(args, ctx);
  // Solo admin puede usar TEA distinta de 40.
  if (!esAdmin(ctx) && Number(args.tea) !== 40) lanzar(403, "Solo el rol admin puede registrar una TEA distinta de 40");
  // Subtotal por ítem = cant*precio − dscto.
  const items = args.items.map((it) => {
    const bruto = red2(it.cantidad * it.precio_unit);
    if (it.descuento_monto > bruto) lanzar(422, `descuento_monto supera el bruto de la línea (material ${it.id_material})`);
    return { ...it, subtotal: red2(bruto - it.descuento_monto) };
  });
  const total = red2(items.reduce((a, it) => a + it.subtotal, 0));
  // FKs: resuelven al maestro SGT (migran desde tablas base si hace falta).
  const idClienteSGT = await resolverClienteSGT(ctx, args.id_cliente);
  const proveedor = args.id_proveedor ? await resolverProveedorSGT(ctx, args.id_proveedor) : null;
  if (args.canal !== "contratista" && !proveedor) lanzar(422, "Selecciona una empresa proveedora.");
  const idProveedorSGT = proveedor?.id ?? null;
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
  if (idAsesor && idProveedorSGT) {
    const { data: relaciones, error: eRel } = await ctx.service.from("seg_usuario_proveedores")
      .select("id_proveedor").eq("id_usuario", idAsesor);
    if (eRel && !esTablaFaltante(eRel)) throw new Error(eRel.message);
    const idsAsignados = !eRel
      ? ((relaciones ?? []) as { id_proveedor?: string }[]).map((r) => String(r.id_proveedor ?? ""))
      : [];
    if (!idsAsignados.length) {
      const { data: ficha } = await ctx.service.from("seg_usuarios").select("id_proveedor").eq("id", idAsesor).maybeSingle();
      if ((ficha as { id_proveedor?: string | null } | null)?.id_proveedor) idsAsignados.push(String((ficha as { id_proveedor: string }).id_proveedor));
    }
    if (!idsAsignados.includes(idProveedorSGT)) {
      lanzar(422, "El proveedor seleccionado no está asignado al asesor de la solicitud.");
    }
  }
  const anticipo = Math.max(Number(args.anticipo ?? 0) || 0, 0);
  const montoFinanciado = Math.max(red2(total - anticipo), 0);
  for (const it of items) {
    it.id_material = await resolverMaterialSGT(ctx, it.id_material);
  }
  try {
    const id = siguienteVTA(await idsParaCorrelativo(ctx, T_SOL));
    const baseSol: Record<string, unknown> = {
      id,
      id_cliente: idClienteSGT,
      id_proveedor: idProveedorSGT,
      id_integrador: null,
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
      codigo_llamada: args.codigo_llamada.trim() || null,
      medio_respaldo: args.codigo_llamada.trim() ? "audio" : args.voucher_solicitud_url ? "voucher" : "contrato",
      voucher_solicitud_url: args.voucher_solicitud_url || null,
      contrato_fisico_url: args.contrato_fisico_url || null,
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
      throw new Error("Falta la migración 04 de ventas y respaldo de la solicitud.");
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
           // Compatibilidad con clientes anteriores: abono se representaba
           // como medio de pago, pero el esquema distingue ABONO por tipo_pedido.
           medio_pago: it.medio_pago === "abono" ? "efectivo" : it.medio_pago,
           tipo_pedido: it.tipo_pedido,
           nro_cuotas: it.nro_cuotas,
           cuota_mensual: it.cuota_mensual,
           material_nombre: it.material_nombre,
           material_codigo: it.material_codigo,
           alto: it.alto,
           ancho: it.ancho,
           fondo: it.fondo,
           subtotal: it.subtotal,
        }))
      )
      .select();
    if (eDet) {
      try { await ctx.service.from(T_SOL).delete().eq("id", id); } catch { /* limpieza best-effort */ }
      if (/column|schema cache/i.test(eDet.message)) throw new Error("Falta la migración 04 de dimensiones y pedidos de venta.");
      throw new Error(eDet.message);
    }
    return { solicitud: cab, items: det ?? [], id, numero: id, total, estado: "borrador" };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hRegistrarAbono(args: z.infer<typeof EsquemaRegistrarAbono>, ctx: OperacionContext) {
  try {
    await ventaVisible(ctx, args.solicitud_id);
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
    } else {
      const sid = String((data as { solicitud_id?: string }).solicitud_id ?? "");
      if (sid) await resolverAvisosSubsanacion(ctx.service, sid, ["tu abono"]);
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
    await resolverAvisosSubsanacion(ctx.service, args.solicitud_id, ["tu solicitud"]);
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
    exigirAdminOProveedor(ctx);
    await ventaVisible(ctx, args.solicitud_id);
    const urls: Partial<Record<TipoEvidencia, string>> = {
      foto_antes: args.foto_antes_url,
      foto_durante: args.foto_durante_url,
      foto_despues: args.foto_despues_url,
      foto_dni: args.foto_dni_url,
      foto_cliente_dni: args.foto_cliente_dni_url,
      acta: args.acta_url,
      boleta: args.boleta_url,
    };
    const evidencias = await sincronizarEvidencias(ctx, args.solicitud_id, urls);
    const { data: previa, error: ePrev } = await ctx.service
      .from(T_INS)
      .select("id,estado")
      .eq("solicitud_id", args.solicitud_id)
      .maybeSingle();
    if (ePrev) throw new Error(ePrev.message);
    // Columnas base (migración 03) para la bandeja; el detalle por archivo vive
    // en vta_instalacion_evidencias.
    const extra = {
      foto_antes_url: args.foto_antes_url,
      foto_despues_url: args.foto_despues_url,
      boleta_url: args.boleta_url,
      acta_url: args.acta_url,
      estado: "registrada",
      observacion: args.observacion || null,
    };
    let instalacion: unknown;
    if (previa) {
      const { data, error } = await ctx.service.from(T_INS).update(extra).eq("solicitud_id", args.solicitud_id).select().single();
      if (error) throw new Error(error.message);
      instalacion = data;
    } else {
      const { data, error } = await ctx.service.from(T_INS).insert({ solicitud_id: args.solicitud_id, ...extra }).select().single();
      if (error) throw new Error(error.message);
      instalacion = data;
    }
    // El proveedor entrega acta + sustentos; administración revisa cada evidencia.
    const estadoSol = "instalada";
    const { data: cab, error: eCab } = await ctx.service
      .from(T_SOL)
      .update({ estado: estadoSol })
      .eq("id", args.solicitud_id)
      .select()
      .single();
    if (eCab) throw new Error(eCab.message);
    await resolverAvisosSubsanacion(ctx.service, args.solicitud_id, ["las evidencias de instalación", "la instalación"]);
    return { solicitud: cab, instalacion, evidencias, estado: estadoSol };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hRevisarEvidencia(args: z.infer<typeof EsquemaRevisarEvidencia>, ctx: OperacionContext) {
  try {
    const s = await ventaVisible(ctx, args.solicitud_id);
    const estSol = String(s.estado ?? "").toLowerCase();
    if (["liquidada"].includes(estSol)) lanzar(422, "La venta ya está liquidada: no se revisan evidencias.");
    const { data: ev, error: eEv } = await ctx.service.from(T_EVID)
      .select("*").eq("solicitud_id", args.solicitud_id).eq("tipo", args.tipo).maybeSingle();
    if (eEv) throw new Error(eEv.message);
    if (!ev) lanzar(404, `El proveedor no entregó la evidencia '${args.tipo}'.`);
    const { data: actualizada, error: eUpd } = await ctx.service.from(T_EVID).update({
      estado: args.accion === "aprobar" ? "aprobado" : "rechazado",
      observacion: args.observacion.trim() || null,
      revisado_por: ctx.sesion.userId,
      revisado_at: new Date().toISOString(),
    }).eq("solicitud_id", args.solicitud_id).eq("tipo", args.tipo).select().single();
    if (eUpd) throw new Error(eUpd.message);

    const evidencias = await cargarEvidencias(ctx, args.solicitud_id);
    const rechazadas = evidencias.filter((e) => String(e.estado) === "rechazado");
    const todasAprobadas = EVIDENCIAS_INSTALACION.every((t) =>
      evidencias.some((e) => String(e.tipo) === t && String(e.estado) === "aprobado")
    );
    const estado = rechazadas.length ? "observada" : todasAprobadas ? "validada_proveedor" : "registrada";
    const estadoSol = rechazadas.length ? "observado_por_sustento" : todasAprobadas ? "validada_proveedor" : "instalada";
    const observacion = rechazadas.length
      ? `Subsanar: ${rechazadas.map((e) => `${String(e.tipo)} (${String(e.observacion ?? "sin detalle")})`).join("; ")}`
      : null;
    const { data: instOk, error: eIns } = await ctx.service.from(T_INS)
      .update({ estado, observacion }).eq("solicitud_id", args.solicitud_id).select().single();
    if (eIns) throw new Error(eIns.message);
    const { data: cab, error: eCab } = await ctx.service.from(T_SOL)
      .update({ estado: estadoSol }).eq("id", args.solicitud_id).select().single();
    if (eCab) throw new Error(eCab.message);
    let aviso: unknown = null;
    if (rechazadas.length) {
      aviso = await avisarObservacion(ctx, args.solicitud_id, "las evidencias de instalación", observacion ?? "");
    }
    let liquidacionAutomatica: unknown = null;
    if (todasAprobadas) {
      const actaUrl = String(evidencias.find((e) => String(e.tipo) === "acta")?.url ?? "");
      liquidacionAutomatica = await hRegistrarLiquidacion({ solicitud_id: args.solicitud_id, tipo: "acta", acta_url: actaUrl }, ctx);
    }
    return { solicitud: cab, instalacion: instOk, evidencias, evidencia: actualizada, estado: todasAprobadas ? "pendiente_liquidar" : estadoSol, liquidacion_automatica: liquidacionAutomatica, aviso_email: aviso };
  } catch (e) {
    exigirTabla(e);
  }
}

async function hRevisarEvidencias(args: z.infer<typeof EsquemaRevisarEvidencias>, ctx: OperacionContext) {
  const solicitud = await ventaVisible(ctx, args.solicitud_id);
  if (["liquidada", "cerrada"].includes(String(solicitud.estado ?? "").toLowerCase())) {
    lanzar(422, "La venta ya está cerrada o liquidada: no se revisan evidencias.");
  }
  const actuales = await cargarEvidencias(ctx, args.solicitud_id);
  if (!EVIDENCIAS_INSTALACION.every((tipo) => actuales.some((e) => e.tipo === tipo && e.url))) {
    lanzar(422, "Deben estar entregadas las siete evidencias antes de revisarlas.");
  }
  const fecha = new Date().toISOString();
  const filas = args.decisiones.map((d) => {
    const evidencia = actuales.find((e) => e.tipo === d.tipo)!;
    return {
      solicitud_id: args.solicitud_id, tipo: d.tipo, url: evidencia.url,
      estado: d.aprobada ? "aprobado" : "rechazado",
      observacion: d.aprobada ? null : d.observacion,
      revisado_por: ctx.sesion.userId, revisado_at: fecha,
    };
  });
  const { data: evidencias, error } = await ctx.service.from(T_EVID)
    .upsert(filas, { onConflict: "solicitud_id,tipo" }).select();
  if (error) throw new Error(error.message);
  const observadas = args.decisiones.filter((d) => !d.aprobada);
  const estado = observadas.length ? "observada" : "validada_proveedor";
  const observacion = observadas.length ? `Subsanar: ${observadas.map((d) => `${d.tipo} (${d.observacion})`).join("; ")}` : null;
  const { error: eInstalacion } = await ctx.service.from(T_INS).update({ estado, observacion }).eq("solicitud_id", args.solicitud_id);
  if (eInstalacion) throw new Error(eInstalacion.message);
  const estadoSolicitud = observadas.length ? "observado_por_sustento" : "validada_proveedor";
  const { error: eSolicitud } = await ctx.service.from(T_SOL).update({ estado: estadoSolicitud }).eq("id", args.solicitud_id);
  if (eSolicitud) throw new Error(eSolicitud.message);
  if (observacion) await avisarObservacion(ctx, args.solicitud_id, "las evidencias de instalación", observacion);
  const liquidacionAutomatica = observadas.length
    ? null
    : await hRegistrarLiquidacion({ solicitud_id: args.solicitud_id, tipo: "acta", acta_url: String(actuales.find((e) => e.tipo === "acta")?.url ?? "") }, ctx);
  return { evidencias, estado: observadas.length ? estado : "pendiente_liquidar", liquidacion_automatica: liquidacionAutomatica };
}

async function hObservarInstalacion(args: z.infer<typeof EsquemaObservarInstalacion>, ctx: OperacionContext) {
  try {
    exigirAdminOProveedor(ctx);
    await ventaVisible(ctx, args.solicitud_id);
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
      .update({ estado: "instalada" })
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
    const aExp = await resolverAlcance(ctx.service, ctx.sesion);
    q = aplicarAlcanceVentas(q, aExp);
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
  const alcance = await resolverAlcance(ctx.service, ctx.sesion);
  if (!alcance.todo && (!alcance.empresaScope || !alcance.proveedores.length)) return { rows: [], total: 0, proveedor: null };
  const idsProveedores = alcance.proveedores;
  let q = ctx.service.from(T_SOL)
    .select("id,id_cliente,id_proveedor,canal,estado,created_at,updated_at", { count: "exact" })
    .order("updated_at", { ascending: false }).limit(args.limit);
  if (idsProveedores.length) q = q.in("id_proveedor", idsProveedores);
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
    proveedor: idsProveedores[0] ?? null,
  };
}

async function hGetVenta(args: z.infer<typeof EsquemaGetVenta>, ctx: OperacionContext) {
  try {
    const { data: cab, error: eCab } = await ctx.service.from(T_SOL).select("*").eq("id", args.id).maybeSingle();
    if (eCab) {
      if (esTablaFaltante(new Error(eCab.message))) exigirTabla(eCab);
      throw new Error(eCab.message);
    }
    if (!cab) lanzar(404, `Venta no encontrada: ${args.id}`);
    const sol = cab as Fila;
    const aVenta = await resolverAlcance(ctx.service, ctx.sesion);
    if (!puedeVerVenta(aVenta, sol)) {
      lanzar(403, "Sin permiso: la venta pertenece a otro usuario o empresa");
    }
    const puedeVerInstalacion = aVenta.todo || (aVenta.empresaScope && aVenta.proveedores.length > 0);
    const [rItems, rAbonos, rIns] = await Promise.all([
      ctx.service.from(T_ITEM).select("*").eq("solicitud_id", args.id),
      ctx.service.from(T_ABO).select("*").eq("solicitud_id", args.id).order("created_at", { ascending: false }),
      ctx.service.from(T_INS).select("*").eq("solicitud_id", args.id).maybeSingle(),
    ]);
    let evidencias: Fila[] = [];
    try {
      if (puedeVerInstalacion) evidencias = await cargarEvidencias(ctx, args.id);
    } catch (e) {
      // Sin migración 04 el detalle sigue cargando; la revisión avisará al usarse.
      if (!(e instanceof Error && (e as Error & { status?: number }).status === 503)) throw e;
    }
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
    const numeroPedidoVenta = String(sol.numero_pedido ?? "");
    const numeroPedidoAbono = String(sol.pv_abono ?? "");
    const items = itemsRaw.map((it) => {
      const m = mMat.get(String(it.id_material ?? ""));
      const codigo = String(m?.codigo_tmp ?? m?.codigo_sap ?? "");
      const nombre = String(m?.nombre ?? "");
      const desc = String(m?.descripcion ?? "");
      const tipoPedido = String(it.tipo_pedido ?? "VENTA").toUpperCase();
      return {
        ...it,
        numero_pedido_venta: tipoPedido === "VENTA" ? (it.numero_pedido_venta || numeroPedidoVenta || null) : it.numero_pedido_venta,
        numero_pedido_abono: tipoPedido === "ABONO" ? (it.numero_pedido_abono || numeroPedidoAbono || null) : it.numero_pedido_abono,
        material_codigo: codigo,
        material_nombre: String(it.material_nombre ?? "").trim() || nombre || String(it.id_material ?? ""),
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
      instalacion: puedeVerInstalacion ? rIns.data ?? null : null,
      evidencias: puedeVerInstalacion ? evidencias : [],
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

/** Visibilidad de cotizaciones (ver lib/alcance.ts): admin todo; proveedor su
 *  staff; supervisor su equipo; asesor solo lo propio. null = sin filtro.
 */
async function filtroVisibilidadCotizacion(
  ctx: OperacionContext
): Promise<null | ((c: Fila) => boolean)> {
  const a = await resolverAlcance(ctx.service, ctx.sesion);
  if (a.todo) return null;
  return (c: Fila) => puedeVerCotizacion(a, c);
}

async function anotarConSolicitud(ctx: OperacionContext, cots: Fila[]): Promise<Fila[]> {
  const ver = await filtroVisibilidadCotizacion(ctx);
  const visibles = ver ? cots.filter(ver) : cots;
  const ids = visibles.map((c) => String(c.id)).filter(Boolean);
  const mSol = new Map<string, string>();
  const totalProductos = new Map<string, number>();
  if (ids.length) {
    try {
      const { data } = await ctx.service.from(T_SOL).select("id,cotizacion_id").in("cotizacion_id", ids);
      for (const s of ((data ?? []) as Fila[])) {
        if (s.cotizacion_id) mSol.set(String(s.cotizacion_id), String(s.id));
      }
    } catch { /* sin columna/tabla: ninguna marcada */ }
    try {
      const { data, error } = await ctx.service.from("cotizacion_items")
        .select("cotizacion_id,total_linea,cantidad,precio_unit,descuento_pct")
        .in("cotizacion_id", ids).limit(5000);
      if (!error) for (const item of ((data ?? []) as Fila[])) {
        const id = String(item.cotizacion_id ?? "");
        if (!id) continue;
        const bruto = Number(item.cantidad ?? 0) * Number(item.precio_unit ?? 0);
        const linea = Number(item.total_linea ?? bruto * (1 - Number(item.descuento_pct ?? 0) / 100));
        totalProductos.set(id, Math.round(((totalProductos.get(id) ?? 0) + linea) * 100) / 100);
      }
    } catch { /* se usa el subtotal guardado en la cotización como respaldo */ }
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
      // El total de esta lista es el importe de los productos, sin sumar las cuotas.
      total: totalProductos.get(String(c.id)) ?? Number(c.subtotal ?? c.total ?? 0),
      subtotal: c.subtotal,
      asesor: c.asesor ?? null,
      asesor_telefono: c.asesor_telefono ?? null,
      proveedor: c.proveedor ?? null,
      id_proveedor: c.id_proveedor ?? null,
      id_asesor: c.id_asesor ?? null,
      ambiente: c.ambiente ?? null,
      cuota_inicial: c.cuota_inicial ?? 0,
      plazo: c.plazo ?? null,
      cuota_mensual: c.cuota_mensual ?? 0,
      cuenta_contrato: c.cuenta_contrato ?? null,
      cliente_nombre: cli.nombres ?? null,
      cliente_doc: cli.dni ?? null,
      cliente_email: cli.email ?? null,
      cliente_telefono: cli.telefono ?? null,
      solicitud_id: null,
    };
  });
}

function normalizarClaveVenta(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const esValorGlobalVenta = (value: unknown) => normalizarClaveVenta(value).startsWith("todos");

/** Selecciona el SKU por proveedor + asesor + ambiente, sin usar coincidencia parcial de nombres. */
async function resolverMaterialVentaCotizacion(ctx: OperacionContext, cot: Fila, item: Fila): Promise<Fila> {
  const ambiente = normalizarClaveVenta(item.ambiente);
  const providerId = String(cot.id_proveedor ?? "");
  const providerName = normalizarClaveVenta(cot.proveedor);
  const asesorId = String(cot.id_asesor ?? "");
  const asesorNombre = normalizarClaveVenta(cot.asesor);
  if (!ambiente) throw new Error("La cotización no tiene ambiente asignado a uno de sus materiales.");

  const { data, error } = await ctx.service.from("mae_materiales")
    .select("id,codigo_sap,nombre,descripcion,espacio,espacio_remodelar,estado,id_proveedor,id_asesor,asesor_nombre,proveedor_nombre")
    .eq("espacio", "VENTAS")
    .eq("estado", "ACTIVO")
    .limit(1000);
  if (error) throw new Error(error.message);

  // Preferencia: asignación del proveedor para el asesor → asignación del
  // proveedor (mismo código SAP) → material genérico, que es el respaldo.
  const todos = ((data ?? []) as Fila[]).flatMap((m) => {
    const env = normalizarClaveVenta(m.espacio_remodelar);
    const envExacta = env === ambiente;
    const envGenerica = ["otros", "general", "diseno", "diseño"].includes(env);
    // "Otros" en la cotización agrupa diseño y remodelación: esos materiales
    // también son válidos para la línea, con menor prioridad que el ambiente exacto.
    const envOtros = ambiente === "otros" && ["remodelacion", "diseno", "diseño"].includes(env);
    if (!envExacta && !envGenerica && !envOtros) return [];

    const mapProvId = String(m.id_proveedor ?? "");
    const mapProvName = normalizarClaveVenta(m.proveedor_nombre);
    const proveedorGlobal = esValorGlobalVenta(m.proveedor_nombre) && !mapProvId;
    const providerExact = Boolean(providerId && mapProvId === providerId);
    const providerNameExact = Boolean(providerName && mapProvName === providerName);
    if (mapProvId && !providerExact) return [];
    if (!proveedorGlobal && !providerExact && !providerNameExact) return [];

    const mapAsesorId = String(m.id_asesor ?? "");
    const mapAsesorName = normalizarClaveVenta(m.asesor_nombre);
    const asesorGlobal = esValorGlobalVenta(m.asesor_nombre) && !mapAsesorId;
    const asesorExact = Boolean(asesorId && mapAsesorId === asesorId);
    const asesorNameExact = Boolean(asesorNombre && mapAsesorName === asesorNombre);
    const asesorOk = mapAsesorId ? asesorExact : (asesorGlobal || asesorNameExact);

    // Coincidencia de texto (descripción de la línea vs. nombre del material)
    // para elegir el servicio correcto dentro del mismo ambiente.
    const buscados = tokensMaterial(item.descripcion);
    const enNombre = tokensMaterial(`${m.nombre ?? ""} ${m.descripcion ?? ""}`);
    const coincidencias = buscados.filter((t) => enNombre.includes(t)).length;

    const score =
      (envExacta ? 100 : envOtros ? 60 : 0)
      + (providerExact ? 100 : providerNameExact ? 60 : 10)
      + (asesorExact ? 100 : asesorNameExact ? 60 : asesorOk ? 20 : 0)
      + Math.min(coincidencias, 3) * 8;
    return [{
      ...m,
      _score: score,
      _propio: providerExact || providerNameExact ? 1 : 0,
      _asesor: asesorOk ? 1 : 0,
    }];
  });

  const delProveedor = todos.filter((m) => Number(m._propio) === 1);
  const conAsesor = delProveedor.filter((m) => Number(m._asesor) === 1);
  let candidates = conAsesor.length ? conAsesor : delProveedor.length ? delProveedor : todos;

  candidates.sort((a, b) => Number(b._score) - Number(a._score));
  if (!candidates.length) {
    throw new Error(`No hay material asignado para ${item.ambiente} / ${cot.proveedor} / ${cot.asesor}. Actualiza el XLSX de Materiales.`);
  }
  return candidates[0];
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
    let ambiente = String(c.ambiente ?? "").trim();
    if (!cuentaContrato || !ambiente) {
      try {
        const dni = String(cli.dni ?? cli.documento ?? "").trim();
        if (dni) {
          const { data: mae } = await ctx.service.from("mae_clientes").select("cuenta_contrato,ambiente").eq("nro_doc", dni).limit(1).maybeSingle();
          const m = (mae ?? {}) as Record<string, any>;
          if (!cuentaContrato) cuentaContrato = String(m.cuenta_contrato ?? "");
          if (!ambiente) ambiente = String(m.ambiente ?? "");
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
    const lineas = await Promise.all(items.map(async (it) => {
      const cant = Number(it.cantidad ?? 0);
      const punit = Number(it.precio_unit ?? 0);
      const dscto = Number(it.descuento_pct ?? 0);
      const mat = it.descripcion
        ? String(it.descripcion)
        : `${it.materiales?.codigo ?? ""} ${it.materiales?.nombre ?? "Ítem"}`.trim();
      const ambienteItem = String(it.ambiente ?? c.ambiente ?? ambiente ?? "");
      const mapeo = await resolverMaterialVentaCotizacion(ctx, c, { ...it, ambiente: ambienteItem });
      return {
        cotizacion_item_id: String(it.id),
        descripcion: mat,
        material_codigo: String(mapeo.codigo_sap ?? it.material_codigo ?? it.materiales?.codigo ?? ""),
        material_id: String(mapeo.id),
        material_nombre: String(mapeo.nombre ?? ""),
        cantidad: cant,
        precio_unit: punit,
        descuento_pct: dscto,
        ambiente: ambienteItem,
        alto: Number(it.alto ?? 0),
        ancho: Number(it.ancho ?? 0),
        fondo: Number(it.fondo ?? 0),
        importe: red2(cant * punit * (1 - dscto / 100)),
      };
    }));
    const importeNeto = Math.round(lineas.reduce((a, it) => a + it.cantidad * it.precio_unit * (1 - it.descuento_pct / 100), 0) * 100) / 100;
    const cuotaInicial = Math.max(Number(c.cuota_inicial ?? 0) || 0, 0);
    return {
      cotizacion: {
        id: c.id,
        codigo: c.codigo,
        created_at: c.created_at,
        estado: c.estado,
        cuenta_contrato: cuentaContrato || null,
        total: Number(c.total ?? importeNeto),
        id_proveedor: c.id_proveedor ?? null,
        id_asesor: c.id_asesor ?? null,
        proveedor: c.proveedor ?? null,
        asesor: c.asesor ?? null,
        asesor_telefono: c.asesor_telefono ?? null,
        cuota_inicial: cuotaInicial,
        plazo: Number(c.plazo ?? 9) || 9,
        cuota_mensual: Number(c.cuota_mensual ?? 0) || 0,
        ambiente: ambiente || [...new Set(lineas.map((it) => it.ambiente).filter(Boolean))].join(", "),
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
        cuota_mensual: importeNeto > cuotaInicial
          ? cuotaFrancesaConIgv(importeNeto - cuotaInicial, Number(c.tea ?? 0.4) > 1 ? Number(c.tea) / 100 : Number(c.tea ?? 0.4), Number(c.plazo ?? 9) || 9)
          : 0,
      },
      id_proveedor: c.id_proveedor ?? null,
      id_asesor: c.id_asesor ?? null,
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
      codigo_llamada: String(args.codigo_llamada ?? "").trim() || s.codigo_llamada || null,
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

const CLAVES_CORTE = ["ventas_pv", "instalaciones_liq", "subsanaciones"] as const;

const EsquemaGuardarCorte = z.object({
  clave: z.enum(CLAVES_CORTE),
  horas: z.string().trim().max(200).optional().default(""),
  para: z.string().trim().max(500).optional().default(""),
  copia: z.string().trim().max(500).optional().default(""),
  asunto: z.string().trim().max(200).optional().default(""),
  mensaje: z.string().trim().max(4000).optional().default(""),
  activo: z.coerce.boolean().optional().default(true),
  modo_envio: z.enum(["automatico", "programado"]).optional().default("programado"),
});

const EsquemaEnviarCorte = z.object({
  clave: z.enum(CLAVES_CORTE),
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

/** Envía observaciones a cada correo de proveedor (configurado en Proveedores). */
async function procesarAvisosSubsanacion(
  service: Servicio,
  forzar = false,
  soloAvisos?: number[],
): Promise<{ clave: string; enviado: boolean; motivo: string; cantidad?: number; proveedores?: number }> {
  const { data: cfg, error } = await service.from("cfg_cortes").select("*").eq("clave", "subsanaciones").maybeSingle();
  if (error) throw new Error(`Falta la configuración de subsanaciones: ${error.message}`);
  if (!cfg) throw new Error("Falta configurar el corte de subsanaciones.");
  const c = cfg as Record<string, any>;
  if (!c.activo && !forzar) return { clave: "subsanaciones", enviado: false, motivo: "aviso inactivo" };
  const ahora = ahoraLima();
  const marca = `${ahora.fecha} ${ahora.hora}`;
  if (!forzar && String(c.modo_envio ?? "programado") === "programado") {
    const horas = String(c.horas ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!horas.includes(ahora.hora) || String(c.ultimo_envio ?? "") === marca) {
      return { clave: "subsanaciones", enviado: false, motivo: "fuera de horario o ya enviado" };
    }
  }

  let q = service.from("cfg_subsanaciones_cola").select("id,solicitud_id,id_proveedor,etapa,motivo,creado_at")
    .is("enviado_at", null).is("resuelto_at", null).order("creado_at", { ascending: true }).limit(5000);
  if (soloAvisos?.length) q = q.in("id", soloAvisos);
  const { data: pendientes, error: ePendientes } = await q;
  if (ePendientes) throw new Error(`No se pudo leer la cola de subsanaciones: ${ePendientes.message}`);
  const filas = (pendientes ?? []) as Fila[];
  if (!filas.length) return { clave: "subsanaciones", enviado: false, motivo: "sin pendientes", cantidad: 0, proveedores: 0 };

  const proveedoresIds = [...new Set(filas.map((f) => String(f.id_proveedor ?? "")).filter(Boolean))];
  const { data: proveedores, error: eProv } = await service.from("mae_proveedores")
    .select("id,razon_social,nombre_comercial,correo_subsanaciones,avisos_subsanacion_activos").in("id", proveedoresIds.length ? proveedoresIds : ["__ninguno__"]);
  if (eProv) throw new Error(`No se pudieron leer los correos de proveedores: ${eProv.message}`);
  const porProveedor = new Map(((proveedores ?? []) as Fila[]).map((p) => [String(p.id), p]));
  const errores: string[] = [];
  let enviados = 0;
  for (const [idProveedor, casos] of agruparPor(filas, (f) => String(f.id_proveedor ?? ""))) {
    if (!idProveedor) { errores.push("Solicitud sin proveedor asignado"); continue; }
    const proveedor = porProveedor.get(idProveedor);
    if (!proveedor?.avisos_subsanacion_activos) { errores.push(`${idProveedor}: avisos desactivados`); continue; }
    const correo = String(proveedor?.correo_subsanaciones ?? "").trim();
    if (!/@[a-z]/i.test(correo)) { errores.push(`${idProveedor}: falta correo en Administración > Proveedores`); continue; }
    const nombre = String(proveedor?.nombre_comercial ?? proveedor?.razon_social ?? idProveedor);
    const detalle = casos.map((f) => `• ${f.solicitud_id} — ${f.etapa}: ${f.motivo || "Revisa los datos/evidencias observados."}`).join("\n");
    const vars = { proveedor: nombre, cantidad: casos.length, fecha: ahora.fecha, hora: ahora.hora, detalle };
    try {
      if (!correoConfigurado()) throw new Error(MSG_CORREO_NO_CONFIGURADO);
      await enviarCorreo({
        to: correo,
        subject: aplicarPlantilla(String(c.asunto ?? "Pendientes por subsanar — {proveedor}"), vars),
        text: aplicarPlantilla(String(c.mensaje ?? "Hola {proveedor}, tienes {cantidad} solicitud(es) por subsanar:\n{detalle}"), vars),
      });
      const ids = casos.map((f) => Number(f.id));
      const { error: eActualiza } = await service.from("cfg_subsanaciones_cola")
        .update({ enviado_at: new Date().toISOString() }).in("id", ids);
      if (eActualiza) throw new Error(eActualiza.message);
      enviados += 1;
    } catch (e) {
      errores.push(`${nombre}: ${(e as Error).message}`);
    }
  }
  if (enviados) await service.from("cfg_cortes").update({ ultimo_envio: marca }).eq("clave", "subsanaciones");
  return {
    clave: "subsanaciones", enviado: enviados > 0,
    motivo: errores.join("; ") || (enviados ? "enviado" : "sin proveedores con correo"),
    cantidad: filas.length, proveedores: enviados,
  };
}

function agruparPor<T>(items: T[], clave: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of items) {
    const k = clave(item);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(item);
  }
  return grupos;
}

/** Ejecuta un corte: cuenta pendientes y envía el correo configurado. */
export async function procesarCorte(
  service: Servicio,
  clave: "ventas_pv" | "instalaciones_liq" | "subsanaciones",
  forzar = false
): Promise<{ clave: string; enviado: boolean; motivo: string; cantidad?: number }> {
  if (clave === "subsanaciones") return procesarAvisosSubsanacion(service, forzar);
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
  if (conteo.cantidad === 0 && !forzar) {
    return { clave, enviado: false, motivo: "sin pendientes", cantidad: 0 };
  }
  const detalle = conteo.numeros.length > 0
    ? conteo.numeros.map((n) => `• ${n}`).join("\n") + (conteo.cantidad > conteo.numeros.length ? `\n• …y ${conteo.cantidad - conteo.numeros.length} más` : "")
    : "(sin pendientes)";
  const vars = { cantidad: conteo.cantidad, fecha: ahora.fecha, hora: ahora.hora, detalle };
  const para = partirCorreos(String(c.para ?? ""));
  if (para.length === 0) return { clave, enviado: false, motivo: "sin correo destino configurado", cantidad: conteo.cantidad };
  if (!correoConfigurado()) {
    throw new Error(MSG_CORREO_NO_CONFIGURADO);
  }
  await enviarCorreo({
    to: para,
    cc: partirCorreos(String(c.copia ?? "")),
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
    const cortes = data ?? [];
    return { cortes, necesitaMigracion: false, necesitaMigracionSubsanaciones: !cortes.some((c) => c.clave === "subsanaciones") };
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
    modo_envio: args.modo_envio,
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

const EsquemaProveedorAvisoSubsanacion = z.object({
  id_proveedor: z.string().trim().min(1).max(30),
  correo: z.string().trim().max(160).email().or(z.literal("")),
  activo: z.coerce.boolean(),
});

async function hListarProveedoresAvisosSubsanacion(_args: unknown, ctx: OperacionContext) {
  const { data, error } = await ctx.service.from("mae_proveedores")
    .select("id,razon_social,nombre_comercial,correo_subsanaciones,avisos_subsanacion_activos,estado")
    .order("nombre_comercial", { ascending: true }).limit(2000);
  if (error) throw new Error(/column|schema cache/i.test(error.message)
    ? "Falta la migración de avisos por proveedor: ejecuta supabase/migracion_subsanaciones_correo_01.sql"
    : error.message);
  return ((data ?? []) as Fila[]).map((p) => ({
    id: String(p.id),
    nombre: String(p.nombre_comercial ?? p.razon_social ?? p.id),
    correo: String(p.correo_subsanaciones ?? ""),
    activo: p.avisos_subsanacion_activos !== false,
    estado: String(p.estado ?? ""),
  }));
}

async function hGuardarProveedorAvisoSubsanacion(args: z.infer<typeof EsquemaProveedorAvisoSubsanacion>, ctx: OperacionContext) {
  const { data, error } = await ctx.service.from("mae_proveedores")
    .update({ correo_subsanaciones: args.correo || null, avisos_subsanacion_activos: args.activo })
    .eq("id", args.id_proveedor).select("id,nombre_comercial,razon_social,correo_subsanaciones,avisos_subsanacion_activos").maybeSingle();
  if (error) throw new Error(/column|schema cache/i.test(error.message)
    ? "Falta la migración de avisos por proveedor: ejecuta supabase/migracion_subsanaciones_correo_01.sql"
    : error.message);
  if (!data) lanzar(404, `Proveedor no encontrado: ${args.id_proveedor}`);
  const p = data as Fila;
  return { id: String(p.id), nombre: String(p.nombre_comercial ?? p.razon_social ?? p.id), correo: String(p.correo_subsanaciones ?? ""), activo: p.avisos_subsanacion_activos !== false };
}

// ------------------------------------------------ Plantilla del correo de cotización

const EsquemaGuardarCorreoCotizacion = z.object({
  asunto: z.string().trim().min(1, "El asunto es obligatorio").max(200),
  mensaje: z.string().trim().min(1, "El mensaje es obligatorio").max(8000)
});

async function hCorreoCotizacionObtener(_args: unknown, ctx: OperacionContext) {
  return obtenerConfigCorreoCotizacion(ctx.service);
}

async function hCorreoCotizacionGuardar(
  args: z.infer<typeof EsquemaGuardarCorreoCotizacion>,
  ctx: OperacionContext
) {
  const { data, error } = await ctx.service
    .from("cfg_correos")
    .upsert({
      clave: CLAVE_CORREO_COTIZACION,
      asunto: args.asunto,
      mensaje: args.mensaje,
      updated_at: new Date().toISOString()
    })
    .select("asunto,mensaje")
    .single();

  if (error) {
    if (/42P01|does not exist|Could not find the table|no existe/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
      throw new Error("Falta la tabla cfg_correos: ejecuta supabase/migracion_correos_01.sql");
    }
    throw new Error(error.message);
  }
  return { config: data, necesitaMigracion: false };
}

// ---------------------------------------------------------------- Etapa 6: instalaciones y liquidación

const ESTADOS_INSTALABLE = ["generada", "aprobada", "en_instalacion", "instalada", "observado_por_sustento", "observada", "validada_proveedor"];

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

const zUrlDocOpcional = z.string().trim().max(2000).optional().default("")
  .refine((v) => !v || esUrlHttp(v), "URL inválida: debe iniciar con http:// o https://");

const EsquemaRegistrarLiquidacion = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  // Solo existe la vía de acta de entrega; el anticipo dejó de usarse.
  tipo: z.enum(["acta"]).optional().default("acta"),
  acta_url: zUrlDocOpcional,
});

const EsquemaLiquidar = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  orden_pedido_venta: z.string().trim().min(1, "Registra la orden del pedido de venta.").max(80),
  orden_pedido_abono: z.string().trim().max(80).optional().default(""),
  nota: z.string().trim().max(2000).optional().default(""),
});

const EsquemaRevertirLiquidacion = z.object({
  solicitud_id: z.string().trim().min(1).max(20),
  nota: z.string().trim().min(3, "Indica el motivo de la reversión.").max(2000),
});

/** Instalaciones: solicitudes post-PV con su instalación (cada proveedor ve las suyas). */
async function hListarInstalaciones(args: z.infer<typeof EsquemaListarInstalaciones>, ctx: OperacionContext) {
  try {
    const desde = (args.page - 1) * args.pageSize;
    const aIns = await resolverAlcance(ctx.service, ctx.sesion);
    // Las instalaciones son información operativa del proveedor asignado;
    // asesores y supervisores no la reciben ni siquiera por llamada directa.
    if (!aIns.todo && !aIns.proveedor) {
      return { rows: [], total: 0, page: args.page, pageSize: args.pageSize };
    }
    const armar = (conPV: boolean) => {
      let qq = ctx.service.from(T_SOL).select("*", { count: "exact" }).order("created_at", { ascending: false });
      qq = aplicarAlcanceVentas(qq, aIns);
      qq = qq.in("estado", ["generada", "aprobada", "en_instalacion", "instalada", "observado_por_sustento", "subsanado_pendiente", "validada_proveedor", "pendiente_liquidar", "observada", "cerrada", "liquidada"]);
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
        const estadosOK = ["generada", "aprobada", "en_instalacion", "instalada", "observado_por_sustento", "subsanado_pendiente", "validada_proveedor", "pendiente_liquidar", "observada", "cerrada", "liquidada"];
        for (const r of ((extra ?? []) as Fila[])) {
          if (vistas.has(String(r.id))) continue;
          if (!estadosOK.includes(String(r.estado ?? "").toLowerCase())) continue;
          if (!puedeVerVenta(aIns, r)) continue;
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
    const mEvid = await cargarEvidenciasDe(ctx, rows.map((r) => String(r.id)));
    // Ítems con sus pedidos: la solicitud de liquidación exige uno por línea.
    const mItems = new Map<string, Fila[]>();
    if (rows.length) {
      try {
        const { data: its } = await ctx.service.from(T_ITEM)
          .select("id,solicitud_id,numero_pedido_venta,numero_pedido_abono,material_nombre,id_material,cantidad,precio_unit,subtotal,tipo_pedido")
          .in("solicitud_id", rows.map((r) => String(r.id))).limit(2000);
        for (const it of ((its ?? []) as Fila[])) {
          const k = String(it.solicitud_id);
          const sol = rows.find((r) => String(r.id) === k);
          const tipo = String(it.tipo_pedido ?? "VENTA").toUpperCase();
          const item = {
            ...it,
            numero_pedido_venta: tipo === "VENTA" ? (it.numero_pedido_venta || sol?.numero_pedido || null) : it.numero_pedido_venta,
            numero_pedido_abono: tipo === "ABONO" ? (it.numero_pedido_abono || sol?.pv_abono || null) : it.numero_pedido_abono,
          };
          mItems.set(k, [...(mItems.get(k) ?? []), item]);
        }
      } catch { /* sin ítems */ }
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
          evidencias: mEvid.get(String(r.id)) ?? [],
          items: mItems.get(String(r.id)) ?? [],
        };
      }),
      total: count ?? rows.length, page: args.page, pageSize: args.pageSize,
    };
  } catch (e) {
    exigirTabla(e);
  }
}

/** Proveedor solicita liquidación por acta de entrega → pendiente_liquidar. */
async function hRegistrarLiquidacion(args: z.infer<typeof EsquemaRegistrarLiquidacion>, ctx: OperacionContext) {
  try {
    exigirAdminOProveedor(ctx);
    const s = await ventaVisible(ctx, args.solicitud_id);
    const est = String(s.estado ?? "").toLowerCase();
    if (est === "pendiente_liquidar") {
      const { data: ya } = await ctx.service.from(T_INS).select("*").eq("solicitud_id", args.solicitud_id).maybeSingle();
      return { instalacion: ya ?? null, parcial: false };
    }
    if (["liquidada", "cerrada"].includes(est)) lanzar(422, "La venta ya está liquidada o cerrada");
    if (est !== "validada_proveedor") {
      lanzar(422, `Administración debe aprobar todas las evidencias antes de solicitar la liquidación (estado '${est}')`);
    }
    const evidencias = await exigirEvidenciasAprobadas(ctx, args.solicitud_id);
    await exigirPedidosRegistrados(ctx, args.solicitud_id);
    const urlDe = (tipo: TipoEvidencia) => String(evidencias.find((e) => String(e.tipo) === tipo)?.url ?? "");
    const fila: Fila = {
      solicitud_id: args.solicitud_id,
      tipo_liquidacion: "acta",
      foto_antes_url: urlDe("foto_antes"),
      foto_despues_url: urlDe("foto_despues"),
      acta_url: urlDe("acta"),
      boleta_url: urlDe("boleta"),
      estado: "pendiente_liquidar",
      observacion: null,
    };
    const ins = await ctx.service.from(T_INS).upsert(fila, { onConflict: "solicitud_id" }).select().single();
    if (ins.error) throw new Error(ins.error.message);
    const upd = await ctx.service.from(T_SOL).update({ estado: "pendiente_liquidar" }).eq("id", args.solicitud_id);
    if (upd.error) throw new Error(upd.error.message);
    return { instalacion: ins.data, evidencias, parcial: false };
  } catch (e) {
    exigirTabla(e);
  }
}

/**
 * Revierte una liquidación registrada por error:
 *  - pendiente_liquidar → validada_proveedor (operativo; borra solo datos exclusivos de liquidación)
 *  - liquidada con acta/anticipo → pendiente_liquidar (solo admin)
 *  - liquidada con cierre operativo → validada_proveedor (solo admin)
 */
async function hRevertirLiquidacion(args: z.infer<typeof EsquemaRevertirLiquidacion>, ctx: OperacionContext) {
  try {
    const s = await ventaVisible(ctx, args.solicitud_id);
    const estSol = String(s.estado ?? "").toLowerCase();
    const { data: ins, error: eIns } = await ctx.service
      .from(T_INS)
      .select("id,estado")
      .eq("solicitud_id", args.solicitud_id)
      .maybeSingle();
    if (eIns) throw new Error(eIns.message);
    if (!ins) lanzar(422, "La venta no tiene instalación o liquidación registrada");
    const estIns = String((ins as Fila).estado ?? "").toLowerCase();
    const nota = args.nota.trim();

    if (estSol === "liquidada") {
      if (!esAdmin(ctx)) lanzar(403, "Solo admin puede revertir una venta liquidada");
      const destino = estIns === "cerrada"
        ? "validada_proveedor"
        : ["liquidada", "pendiente_liquidar"].includes(estIns)
          ? "pendiente_liquidar"
          : "";
      if (!destino) lanzar(422, `No se puede revertir una venta liquidada con instalación '${estIns}'`);
      const u1 = await ctx.service.from(T_INS).update({ estado: destino }).eq("solicitud_id", args.solicitud_id);
      if (u1.error) throw new Error(u1.error.message);
      const u2 = await ctx.service.from(T_SOL).update({ estado: destino, nota_reversion: nota }).eq("id", args.solicitud_id);
      if (u2.error) throw new Error(u2.error.message);
      return { ok: true, estado: destino, nota };
    }

    if (estSol !== "pendiente_liquidar") {
      lanzar(422, `Solo se revierte una venta pendiente de liquidar o liquidada (está '${estSol}')`);
    }
    const u1 = await ctx.service.from(T_INS).update({
      estado: "validada_proveedor",
      tipo_liquidacion: null,
      observacion: null,
    }).eq("solicitud_id", args.solicitud_id);
    if (u1.error) throw new Error(u1.error.message);
    const u2 = await ctx.service.from(T_SOL).update({ estado: "validada_proveedor", nota_reversion: nota }).eq("id", args.solicitud_id);
    if (u2.error) throw new Error(u2.error.message);
    return { ok: true, estado: "validada_proveedor", nota };
  } catch (e) {
    exigirTabla(e);
  }
}

/** Administración liquida (ya ejecutado en SAP): exige evidencias aprobadas y pedidos. */
async function hLiquidarVenta(args: z.infer<typeof EsquemaLiquidar>, ctx: OperacionContext) {
  try {
    const { data: ins, error: eIns } = await ctx.service.from(T_INS).select("*").eq("solicitud_id", args.solicitud_id).maybeSingle();
    if (eIns) throw new Error(eIns.message);
    if (!ins) lanzar(422, "La venta no tiene liquidación solicitada por el proveedor");
    const f = ins as Fila;
    if (String(f.estado ?? "") !== "pendiente_liquidar") {
      lanzar(422, `Solo se liquida desde 'pendiente de liquidar' (está '${f.estado ?? ""}')`);
    }
    await exigirEvidenciasAprobadas(ctx, args.solicitud_id);
    await exigirPedidosRegistrados(ctx, args.solicitud_id);
    const { data: solicitud, error: eSolicitud } = await ctx.service.from(T_SOL)
      .select("anticipo,numero_pedido,pv_abono,orden_pedido_venta,orden_pedido_abono").eq("id", args.solicitud_id).maybeSingle();
    if (eSolicitud) throw new Error(/column|schema cache/i.test(eSolicitud.message)
      ? "Falta ejecutar supabase/migracion_ordenes_liquidacion_01.sql para registrar las órdenes SAP antes de liquidar."
      : eSolicitud.message);
    const cab = solicitud as Fila | null;
    if (!String(cab?.numero_pedido ?? "").trim()) lanzar(422, "La venta no tiene PV de venta registrado.");
    const tieneAbono = Number(cab?.anticipo ?? 0) > 0;
    if (tieneAbono && !String(cab?.pv_abono ?? "").trim()) lanzar(422, "La venta tiene anticipo, pero falta el PV de abono.");
    if (tieneAbono && !args.orden_pedido_abono.trim()) lanzar(422, "Registra la orden del pedido de abono.");
    const nota = args.nota.trim();
    const uOrdenes = await ctx.service.from(T_SOL).update({
      orden_pedido_venta: args.orden_pedido_venta.trim(),
      orden_pedido_abono: tieneAbono ? args.orden_pedido_abono.trim() : null,
    }).eq("id", args.solicitud_id);
    if (uOrdenes.error) throw new Error(uOrdenes.error.message);
    const u1 = await ctx.service.from(T_INS).update({ estado: "liquidada", observacion: nota || null }).eq("solicitud_id", args.solicitud_id);
    if (u1.error) throw new Error(u1.error.message);
    const u2 = await ctx.service.from(T_SOL).update({
      estado: "liquidada",
      ...(nota ? { nota_liquidacion: nota } : {}),
    }).eq("id", args.solicitud_id);
    if (u2.error) throw new Error(/column|schema cache/i.test(u2.error.message)
      ? "Falta ejecutar supabase/migracion_ordenes_liquidacion_01.sql para guardar las órdenes de venta y abono."
      : u2.error.message);
    return { ok: true, estado: "liquidada", nota };
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
  crearSolicitudVenta: { descripcion: "Ventas: crea solicitud VTA-xxxxxx en borrador con uno o más sustentos", roles: OPERATIVO, schema: EsquemaCrearSolicitud, handler: hCrearSolicitud },
  registrarAbono: { descripcion: "Ventas: registra abono pendiente + aviso email a admin (best-effort)", roles: OPERATIVO, schema: EsquemaRegistrarAbono, handler: hRegistrarAbono },
  validarAbono: { descripcion: "Ventas: valida u observa un abono", roles: SOLO_ADMIN, schema: EsquemaValidarAbono, handler: hValidarAbono },
  aprobarSolicitud: { descripcion: "Ventas: aprueba solicitud exigiendo n.º de pedido por cada ítem", roles: SOLO_ADMIN, schema: EsquemaAprobar, handler: hAprobarSolicitud },
  registrarPV: { descripcion: "Ventas: registra PV + código de llamada → generada (PV abono solo si hubo anticipo)", roles: SOLO_ADMIN, schema: EsquemaRegistrarPV, handler: hRegistrarPV },
  cfgCortesListar: { descripcion: "Cortes: lee configuración de cortes programados", roles: SOLO_ADMIN, schema: z.object({}).passthrough(), handler: hCortesListar },
  cfgCorteGuardar: { descripcion: "Cortes: guarda horas/correos/asunto/mensaje de un corte", roles: SOLO_ADMIN, schema: EsquemaGuardarCorte, handler: hCorteGuardar },
  cfgCorteEnviar: { descripcion: "Cortes: envía ahora un corte (prueba)", roles: SOLO_ADMIN, schema: EsquemaEnviarCorte, handler: hCorteEnviar },
  cfgSubsanacionesProveedoresListar: { descripcion: "Cortes: lista correos de proveedores para subsanaciones", roles: SOLO_ADMIN, schema: z.object({}).passthrough(), handler: hListarProveedoresAvisosSubsanacion },
  cfgSubsanacionProveedorGuardar: { descripcion: "Cortes: guarda el correo y estado de aviso de un proveedor", roles: SOLO_ADMIN, schema: EsquemaProveedorAvisoSubsanacion, handler: hGuardarProveedorAvisoSubsanacion },
  cfgCorreoCotizacion: { descripcion: "Correo cotización: lee asunto/mensaje editables", roles: SOLO_ADMIN, schema: z.object({}).passthrough(), handler: hCorreoCotizacionObtener },
  cfgCorreoCotizacionGuardar: { descripcion: "Correo cotización: guarda asunto/mensaje", roles: SOLO_ADMIN, schema: EsquemaGuardarCorreoCotizacion, handler: hCorreoCotizacionGuardar },
  actualizarNumerosPedido: { descripcion: "Ventas: edita n.º de pedido por ítem sin cambiar estado", roles: SOLO_ADMIN, schema: EsquemaAprobar, handler: hActualizarNumerosPedido },
  observarSolicitud: { descripcion: "Ventas: observa solicitud", roles: SOLO_ADMIN, schema: EsquemaObservarSolicitud, handler: hObservarSolicitud },
  registrarInstalacion: { descripcion: "Ventas: proveedor entrega acta y sustentos (7 evidencias) para revisión", roles: OPERATIVO, schema: EsquemaInstalacion, handler: hRegistrarInstalacion },
  revisarEvidencia: { descripcion: "Instalaciones: admin aprueba o rechaza cada evidencia con observación", roles: SOLO_ADMIN, schema: EsquemaRevisarEvidencia, handler: hRevisarEvidencia },
  revisarEvidencias: { descripcion: "Instalaciones: revisar todas las evidencias", roles: SOLO_ADMIN, schema: EsquemaRevisarEvidencias, handler: hRevisarEvidencias },
  observarInstalacion: { descripcion: "Ventas: observa instalación → observada", roles: OPERATIVO, schema: EsquemaObservarInstalacion, handler: hObservarInstalacion },
  exportarVentas: { descripcion: "Ventas: {columnas, filas} planos listos para XLSX", roles: TODOS, schema: EsquemaExportar, handler: hExportarVentas },
  getVenta: { descripcion: "Ventas: cabecera + items + abonos + instalación", roles: TODOS, schema: EsquemaGetVenta, handler: hGetVenta },
  listarInstalacionesPendientes: { descripcion: "Ventas: historial de instalaciones del proveedor", roles: TODOS, schema: EsquemaQInstalaciones, handler: hListarInstalacionesPendientes },
  actualizarTeaVenta: { descripcion: "Ventas: actualiza TEA de la solicitud", roles: SOLO_ADMIN, schema: EsquemaTea, handler: hActualizarTea },
  listarInstalaciones: { descripcion: "Instalaciones: solicitudes post-PV con su instalación (scope proveedor)", roles: TODOS, schema: EsquemaListarInstalaciones, handler: hListarInstalaciones },
  registrarLiquidacion: { descripcion: "Instalaciones: registra liquidación por acta tras aprobar evidencias y validar pedidos → pendiente_liquidar", roles: OPERATIVO, schema: EsquemaRegistrarLiquidacion, handler: hRegistrarLiquidacion },
  liquidarVenta: { descripcion: "Instalaciones: admin liquida con nota tras aprobar evidencias y pedidos → liquidada", roles: SOLO_ADMIN, schema: EsquemaLiquidar, handler: hLiquidarVenta },
  revertirLiquidacion: { descripcion: "Ventas: revierte con nota pendiente_liquidar → validada_proveedor o liquidada → paso previo (admin)", roles: OPERATIVO, schema: EsquemaRevertirLiquidacion, handler: hRevertirLiquidacion },
  buscarCotizacionesParaVenta: { descripcion: "Ventas: busca cotizaciones por DNI/nombre/cta-cto/código para generar solicitud", roles: TODOS, schema: EsquemaBuscarCotizaciones, handler: hBuscarCotizacionesParaVenta },
  obtenerCotizacionParaVenta: { descripcion: "Ventas: payload de cotización para prellenar la solicitud", roles: OPERATIVO, schema: EsquemaCotizacionParaVenta, handler: hObtenerCotizacionParaVenta },
};

/** Reglas del módulo (para el coordinador/UI): roles, TEA, adjuntos, aprobaciones y alcance. */
export const REGLAS_VENTAS = {
  tablas: [T_SOL, T_ITEM, T_ABO, T_INS, T_EVID],
  schema_sql: "supabase/schema_ventas.sql",
  scope_por_rol: "GLOBAL (admin): todo. EMPRESA (proveedor): solo su empresa. EQUIPO (supervisor): solo asesores asignados de su empresa. PROPIO (asesor): solo propios por UUID, sin confiar en nombres. Instalaciones: solo admin/proveedor, con límite por empresa.",
  tea: "default 40; solo admin puede crear con TEA ≠ 40 (403) y solo admin puede actualizarla",
  adjuntos: "opcionales: cotización del cliente, DNI y foto del espacio; se requiere al menos un respaldo entre código de audio, voucher y contrato físico",
  subtotal_item: "cantidad * precio_unit − descuento_monto (422 si el descuento supera el bruto)",
  correlativo: "id VTA-xxxxxx (6 dígitos)",
  abonos: "registrarAbono deja estado 'pendiente' y avisa a admin por correo best-effort (aviso_email: enviado|omitido); validarAbono: validar → 'validado', observar → 'pendiente' + observacion (observacion obligatoria al observar)",
  aprobacion: "aprobarSolicitud exige al menos un número (venta o abono) por CADA ítem, sino 422; observarSolicitud → 'observado'",
  instalacion: "registrarInstalacion exige 7 evidencias (antes, durante, después, DNI, cliente con DNI, acta y boleta) → solicitud 'instalada' e instalación 'registrada'; revisarEvidencia (admin) aprueba/rechaza cada archivo con observación: al rechazar → 'observada' y el proveedor subsana ('subsanado_pendiente'); con las 7 aprobadas → 'validada_proveedor'",
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
  await verificarPermisoMatriz(ctx.service, ctx.sesion, operacion, def.roles);
  const parsed = def.schema.safeParse(argumentos ?? {});
  if (!parsed.success) {
    const e = new Error(`Argumentos inválidos: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`) as Error & { status?: number };
    e.status = 400; throw e;
  }
  const datos = await def.handler(parsed.data, ctx);
  return { ok: true, datos };
}
