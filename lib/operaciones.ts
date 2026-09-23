import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RolUsuario, SesionInfo } from "./auth";

/**
 * Mirror de `ejecutarOperacionSeguraPaso13D2` (GAS) adaptado a Next.js.
 * Alineado a supabase/schema.sql: profiles+roles, clientes(nombres/dni),
 * materiales(precio_unit), cotizaciones + cotizacion_items, estados UPPERCASE.
 */

export interface OperacionContext {
  /** Cliente privilegiado (service_role). SOLO server. */
  service: SupabaseClient;
  sesion: SesionInfo;
  modulo?: string;
}

type Handler = (args: any, ctx: OperacionContext) => Promise<unknown>;

interface DefOperacion {
  descripcion: string;
  roles: RolUsuario[];
  schema: z.ZodTypeAny;
  handler: Handler;
}

// ---------------------------------------------------------------- schemas

const zLimit = z.coerce.number().int().min(1).max(500).default(100);

const EsquemaListarClientes = z.object({
  q: z.string().trim().max(120).optional().default(""),
  limit: zLimit
});

const EsquemaCrearCliente = z.object({
  nombres: z.string().trim().min(2).max(200),
  dni: z.string().trim().max(12).optional().default(""),
  telefono: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).default(""),
  direccion: z.string().trim().max(300).optional().default(""),
  distrito: z.string().trim().max(120).optional().default("")
});

const EsquemaListarMateriales = z.object({
  q: z.string().trim().max(120).optional().default(""),
  soloActivos: z.coerce.boolean().optional().default(true),
  limit: zLimit
});

const EsquemaCrearMaterial = z.object({
  nombre: z.string().trim().min(2).max(200),
  codigo: z.string().trim().max(60).optional().default(""),
  unidad: z.string().trim().min(1).max(20).default("UND"),
  precio_unit: z.coerce.number().min(0).max(10_000_000),
  stock: z.coerce.number().min(0).max(10_000_000).optional().default(0),
  activo: z.coerce.boolean().optional().default(true)
});

const EsquemaItemCotizacion = z.object({
  material_id: z.string().uuid().optional().nullable(),
  cantidad: z.coerce.number().min(0.01).max(100_000),
  precio_unit: z.coerce.number().min(0).max(10_000_000),
  descuento_pct: z.coerce.number().min(0).max(100).optional().default(0)
});

const EsquemaCrearCotizacion = z.object({
  cliente_id: z.string().uuid(),
  items: z.array(EsquemaItemCotizacion).min(1).max(200),
  observaciones: z.string().trim().max(2000).optional().default(""),
  validez_dias: z.coerce.number().int().min(0).max(365).optional().default(15)
});

const EsquemaListarCotizaciones = z.object({
  estado: z.string().trim().max(30).optional().default(""),
  cliente_id: z.string().uuid().optional(),
  limit: zLimit
});

const EsquemaCambiarEstado = z.object({
  id: z.string().uuid(),
  estado: z.enum(["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA"])
});

const EsquemaGenerarPDF = z.object({
  cotizacion_id: z.string().uuid()
});

const EsquemaEnviarCorreo = z.object({
  para: z.string().trim().email().max(160),
  asunto: z.string().trim().min(2).max(200),
  mensaje: z.string().trim().min(1).max(10_000),
  cotizacion_id: z.string().uuid().optional()
});

const EsquemaListarProveedores = z.object({
  q: z.string().trim().max(120).optional().default(""),
  limit: zLimit
});

const EsquemaListarOficinas = z.object({
  q: z.string().trim().max(120).optional().default("")
});

const EsquemaVacio = z.object({}).passthrough();

const EsquemaAdminActualizar = z.object({
  user_id: z.string().uuid(),
  rol: z.enum(["admin", "asesor", "oficina"]).optional(),
  activo: z.coerce.boolean().optional()
});

const EsquemaAdminCrear = z.object({
  email: z.string().trim().email().max(160),
  nombre: z.string().trim().min(2).max(200).optional().default(""),
  rol: z.enum(["admin", "asesor", "oficina"]).default("asesor"),
  password: z.string().min(8).max(128).optional()
});

const EsquemaAdminEliminar = z.object({
  user_id: z.string().uuid()
});

// ---------------------------------------------------------------- handlers

async function hListarClientes(args: z.infer<typeof EsquemaListarClientes>, ctx: OperacionContext) {
  const { q, limit } = args;
  let query = ctx.service.from("clientes").select("*").order("created_at", { ascending: false }).limit(limit);
  if (q) query = query.or(`nombres.ilike.%${q}%,dni.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function hCrearCliente(args: z.infer<typeof EsquemaCrearCliente>, ctx: OperacionContext) {
  const payload = {
    nombres: args.nombres,
    dni: args.dni || null,
    telefono: args.telefono || null,
    email: args.email || null,
    direccion: args.direccion || null,
    distrito: args.distrito || null,
    created_by: ctx.sesion.userId
  };
  const { data, error } = await ctx.service.from("clientes").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function hListarMateriales(args: z.infer<typeof EsquemaListarMateriales>, ctx: OperacionContext) {
  const { q, soloActivos, limit } = args;
  let query = ctx.service.from("materiales").select("*, proveedores(id,nombre)").order("nombre").limit(limit);
  if (soloActivos) query = query.eq("activo", true);
  if (q) query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function hCrearMaterial(args: z.infer<typeof EsquemaCrearMaterial>, ctx: OperacionContext) {
  const codigo = args.codigo || `MAT-${Date.now().toString().slice(-6)}`;
  const { data, error } = await ctx.service
    .from("materiales")
    .insert({ nombre: args.nombre, codigo, unidad: args.unidad, precio_unit: args.precio_unit, stock: args.stock ?? 0, activo: args.activo ?? true })
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function hCrearCotizacion(args: z.infer<typeof EsquemaCrearCotizacion>, ctx: OperacionContext) {
  // 1. Cabecera en BORRADOR (triggers generan codigo; totales se recalculan con items)
  const { data: cab, error: eCab } = await ctx.service.from("cotizaciones").insert({
    cliente_id: args.cliente_id,
    observaciones: args.observaciones ?? "",
    validez_dias: args.validez_dias ?? 15,
    estado: "BORRADOR",
    created_by: ctx.sesion.userId
  }).select().single();
  if (eCab || !cab) throw new Error(eCab?.message ?? "No se pudo crear cotización");
  const cotId = (cab as { id: string }).id;

  // 2. Items (trigger calcula total_linea y recalcula subtotal/igv/total)
  const itemsPayload = args.items.map((it) => ({
    cotizacion_id: cotId,
    material_id: it.material_id ?? null,
    cantidad: it.cantidad,
    precio_unit: it.precio_unit,
    descuento_pct: it.descuento_pct ?? 0
  }));
  const { error: eItems } = await ctx.service.from("cotizacion_items").insert(itemsPayload);
  if (eItems) throw new Error(eItems.message);

  // 3. Devolver cabecera recalculada + items
  const [{ data: final }, { data: items }] = await Promise.all([
    ctx.service.from("cotizaciones").select("*, clientes(id,nombres,dni,email)").eq("id", cotId).single(),
    ctx.service.from("cotizacion_items").select("*, materiales(codigo,nombre,unidad)").eq("cotizacion_id", cotId)
  ]);
  return { ...(final as object), items: items ?? [] };
}

async function hListarCotizaciones(args: z.infer<typeof EsquemaListarCotizaciones>, ctx: OperacionContext) {
  const { estado, cliente_id, limit } = args;
  let query = ctx.service
    .from("cotizaciones")
    .select("*, clientes(id,nombres,dni,email)")
    .order("created_at", { ascending: false })
    .limit(limit);
  const est = estado ? estado.toUpperCase() : "";
  if (est) query = query.eq("estado", est);
  if (cliente_id) query = query.eq("cliente_id", cliente_id);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function hCambiarEstado(args: z.infer<typeof EsquemaCambiarEstado>, ctx: OperacionContext) {
  const { data, error } = await ctx.service
    .from("cotizaciones")
    .update({ estado: args.estado })
    .eq("id", args.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Retorna payload listo para PDF con items + cliente. */
async function hGenerarPDF(args: z.infer<typeof EsquemaGenerarPDF>, ctx: OperacionContext) {
  const { data: cot, error } = await ctx.service.from("cotizaciones").select("*, clientes(*)").eq("id", args.cotizacion_id).single();
  if (error || !cot) throw new Error("Cotización no encontrada");
  const { data: items } = await ctx.service
    .from("cotizacion_items")
    .select("*, materiales(codigo,nombre,unidad)")
    .eq("cotizacion_id", args.cotizacion_id);
  const c = cot as { id: string; codigo?: string };
  return { cotizacion: { ...cot, items: items ?? [] }, cliente: (cot as { clientes?: unknown }).clientes ?? null, items: items ?? [], filename: `cotizacion-${c.codigo ?? c.id.slice(0, 8)}.pdf` };
}

async function hEnviarCorreo(args: z.infer<typeof EsquemaEnviarCorreo>, _ctx: OperacionContext) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASS)");
  }
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  const info = await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: args.para,
    subject: args.asunto,
    text: args.mensaje + (args.cotizacion_id ? `\n\nCotización: ${args.cotizacion_id}` : "")
  });
  return { messageId: info.messageId, accepted: info.accepted };
}

async function hListarProveedores(args: z.infer<typeof EsquemaListarProveedores>, ctx: OperacionContext) {
  const { q, limit } = args;
  let query = ctx.service.from("proveedores").select("*").order("nombre").limit(limit);
  if (q) query = query.or(`nombre.ilike.%${q}%,ruc.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function hListarOficinas(args: z.infer<typeof EsquemaListarOficinas>, ctx: OperacionContext) {
  let query = ctx.service.from("oficinas").select("*").order("nombre");
  if (args.q) query = query.ilike("nombre", `%${args.q}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---- admin CRUD (public.profiles + public.roles) ----

async function hAdminListar(_args: unknown, ctx: OperacionContext) {
  const { data, error } = await ctx.service
    .from("profiles")
    .select("id,email,nombre,activo,created_at,oficina_id,roles!inner(nombre)")
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...r, rol: r.roles?.nombre ?? r.rol ?? null }));
}

async function hAdminCrear(args: z.infer<typeof EsquemaAdminCrear>, ctx: OperacionContext) {
  const password = args.password ?? Math.random().toString(36).slice(2, 12) + "A1!";
  const { data, error } = await ctx.service.auth.admin.createUser({
    email: args.email,
    password,
    email_confirm: true,
    user_metadata: { rol: args.rol }
  });
  if (error) throw new Error(error.message);
  const userId = data.user?.id;
  if (!userId) throw new Error("No se pudo crear el usuario");
  const { data: rol } = await ctx.service.from("roles").select("id").eq("nombre", args.rol).single();
  const { error: e2 } = await ctx.service.from("profiles").upsert({
    id: userId, email: args.email.toLowerCase(), nombre: args.nombre || args.email, rol_id: (rol as { id?: number })?.id ?? null, activo: true
  });
  if (e2) throw new Error(e2.message);
  return { id: userId, email: args.email, rol: args.rol };
}

async function hAdminActualizar(args: z.infer<typeof EsquemaAdminActualizar>, ctx: OperacionContext) {
  const patch: Record<string, unknown> = {};
  if (typeof args.activo === "boolean") patch.activo = args.activo;
  if (args.rol) {
    const { data: rol } = await ctx.service.from("roles").select("id").eq("nombre", args.rol).single();
    if (!(rol as { id?: number })?.id) throw new Error(`Rol desconocido: ${args.rol}`);
    patch.rol_id = (rol as { id: number }).id;
  }
  if (Object.keys(patch).length === 0) throw new Error("Nada que actualizar (rol/activo)");
  const { data, error } = await ctx.service.from("profiles").update(patch).eq("id", args.user_id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function hAdminEliminar(args: z.infer<typeof EsquemaAdminEliminar>, ctx: OperacionContext) {
  const { data, error } = await ctx.service.from("profiles").update({ activo: false }).eq("id", args.user_id).select().single();
  if (error) throw new Error(error.message);
  await ctx.service.auth.admin.deleteUser(args.user_id).catch(() => undefined);
  return data;
}

// ---------------------------------------------------------------- mapa

const TODOS: RolUsuario[] = ["admin", "asesor", "oficina"];
const OPERATIVO: RolUsuario[] = ["admin", "asesor"];
const SOLO_ADMIN: RolUsuario[] = ["admin"];

export const OPERACIONES: Record<string, DefOperacion> = {
  listarClientes: { descripcion: "Lista clientes (búsqueda opcional)", roles: TODOS, schema: EsquemaListarClientes, handler: hListarClientes },
  crearCliente: { descripcion: "Crea un cliente", roles: OPERATIVO, schema: EsquemaCrearCliente, handler: hCrearCliente },
  listarMateriales: { descripcion: "Lista materiales", roles: TODOS, schema: EsquemaListarMateriales, handler: hListarMateriales },
  crearMaterial: { descripcion: "Crea un material", roles: OPERATIVO, schema: EsquemaCrearMaterial, handler: hCrearMaterial },
  crearCotizacion: { descripcion: "Crea cotización + items (IGV 18% por trigger)", roles: OPERATIVO, schema: EsquemaCrearCotizacion, handler: hCrearCotizacion },
  listarCotizaciones: { descripcion: "Lista cotizaciones con cliente", roles: TODOS, schema: EsquemaListarCotizaciones, handler: hListarCotizaciones },
  cambiarEstadoCotizacion: { descripcion: "Cambia estado (BORRADOR/ENVIADA/APROBADA/RECHAZADA)", roles: OPERATIVO, schema: EsquemaCambiarEstado, handler: hCambiarEstado },
  generarPDF: { descripcion: "Payload de cotización + items listo para PDF", roles: TODOS, schema: EsquemaGenerarPDF, handler: hGenerarPDF },
  enviarCorreo: { descripcion: "Envía correo vía SMTP", roles: OPERATIVO, schema: EsquemaEnviarCorreo, handler: hEnviarCorreo },
  listarProveedores: { descripcion: "Lista proveedores", roles: TODOS, schema: EsquemaListarProveedores, handler: hListarProveedores },
  listarOficinas: { descripcion: "Lista oficinas", roles: TODOS, schema: EsquemaListarOficinas, handler: hListarOficinas },
  adminListarUsuarios: { descripcion: "Admin: listar profiles", roles: SOLO_ADMIN, schema: EsquemaVacio, handler: hAdminListar },
  adminCrearUsuario: { descripcion: "Admin: crear usuario Auth + profile", roles: SOLO_ADMIN, schema: EsquemaAdminCrear, handler: hAdminCrear },
  adminActualizarUsuario: { descripcion: "Admin: cambiar rol/activo", roles: SOLO_ADMIN, schema: EsquemaAdminActualizar, handler: hAdminActualizar },
  adminEliminarUsuario: { descripcion: "Admin: desactivar/eliminar", roles: SOLO_ADMIN, schema: EsquemaAdminEliminar, handler: hAdminEliminar },
  adminListar: { descripcion: "Alias de adminListarUsuarios", roles: SOLO_ADMIN, schema: EsquemaVacio, handler: hAdminListar },
  adminCrear: { descripcion: "Alias de adminCrearUsuario", roles: SOLO_ADMIN, schema: EsquemaAdminCrear, handler: hAdminCrear },
  adminActualizar: { descripcion: "Alias de adminActualizarUsuario", roles: SOLO_ADMIN, schema: EsquemaAdminActualizar, handler: hAdminActualizar },
  adminEliminar: { descripcion: "Alias de adminEliminarUsuario", roles: SOLO_ADMIN, schema: EsquemaAdminEliminar, handler: hAdminEliminar }
};

export function listarOperacionesPermitidas(rol: RolUsuario): string[] {
  return Object.entries(OPERACIONES)
    .filter(([, def]) => def.roles.includes(rol))
    .map(([k]) => k);
}

export async function ejecutarOperacionSegura(
  operacion: string,
  argumentos: unknown,
  ctx: OperacionContext
): Promise<{ ok: true; datos: unknown }> {
  const def = OPERACIONES[operacion];
  if (!def) {
    const e = new Error(`Operación desconocida: ${operacion}`) as Error & { status?: number };
    e.status = 404;
    throw e;
  }
  if (!def.roles.includes(ctx.sesion.rol)) {
    const e = new Error(`Rol '${ctx.sesion.rol}' sin permiso para '${operacion}'`) as Error & { status?: number };
    e.status = 403;
    throw e;
  }
  const parsed = def.schema.safeParse(argumentos ?? {});
  if (!parsed.success) {
    const e = new Error(`Argumentos inválidos: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`) as Error & { status?: number };
    e.status = 400;
    throw e;
  }
  const datos = await def.handler(parsed.data, ctx);
  return { ok: true, datos };
}
