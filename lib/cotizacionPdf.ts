import { jsPDF } from "jspdf";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cuotaFrancesaConIgv, tablaSimulacion, PLAZOS_SIMULACION } from "./financiamiento";
import { extraerDetalles, DETALLES_LABELS } from "./detallesMueble";

/** SOLO SERVER: construcción del PDF estilo captura COT-AMCA-00012.
 *  Fuente 100% BD SGT360: ven_cotizaciones + ven_cotizacion_items +
 *  mae_clientes + mae_proveedores + mae_materiales + pre_tarifario +
 *  ven_financiamiento_sim. Sin textos demo.
 */

export interface ItemPdf {
  cantidad?: number; precio_unit?: number; descuento_pct?: number; total_linea?: number;
  materiales?: { codigo?: string; nombre?: string; unidad?: string } | null;
}
export interface DatosPdf {  codigo: string; estado?: string; fecha?: string; observaciones?: string;
  detalles: { etiqueta: string; valor: string }[];
  subtotal: number; descuento: number; total: number;
  clienteNombre?: string; clienteDoc?: string; clienteEmail?: string; clienteTel?: string;
  clienteContacto?: string;
  proveedor?: string; proveedorRuc?: string; proveedorEmail?: string; proveedorTel?: string;
  asesor?: string; asesorTelefono?: string; asesorEmail?: string;
  cuotaInicial: number; capital: number; tea: number; plazo: number; cuotaMensual: number;
  tabla: { plazo: number; cuota: number }[];
  items: { idx: number; material: string; cant: number; punit: number; dscto: number; neto: number }[];
}

const TEAL = [0, 133, 173] as const;
const VERDE = [0, 150, 90] as const;
const AMARILLO = [255, 193, 7] as const;
const GRIS_BG = [244, 247, 250] as const;
const GRIS_LINEA = [210, 218, 226] as const;

const CONSIDERACIONES = [
  "1. El precio considera la ejecución del proyecto de manera integral, que incluye asesoría, visita técnica, diseño, ejecución del proyecto y garantía.",
  "2. Los montos incluyen IGV.",
  "3. La cotización no incluye trabajos de desmontaje, albañilería, gasfitería y electricidad.",
  "4. El plazo inicia desde la aprobación del diseño por parte del usuario.",
  "5. La cotización incluye diseño, materiales, fabricación, instalación y transporte.",
  "6. El servicio ofrecido tiene garantía de 1 año por fabricación del mueble.",
  "7. Si el importe total excede la línea de crédito aprobada por Cálidda, el usuario podrá abonar la diferencia como cuota inicial a Cálidda.",
];

/** Pie del documento: contacto comercial (banda destacada). */
const CONTACTO_WHATSAPP = "926 982 647";
const CONTACTO_FIJO = "01-614 9002";

function teaADecimal(teaRaw: number, fallback = 0.4): number {
  if (!Number.isFinite(teaRaw)) return fallback;
  if (teaRaw <= 0) return 0;
  if (teaRaw > 1) return teaRaw > 10 ? teaRaw / 100 : teaRaw / 100;
  return teaRaw || fallback;
}

async function obtenerDatosSGT(service: SupabaseClient, numero: string): Promise<DatosPdf | null> {
  const { data: cot, error } = await service.from("ven_cotizaciones").select("*").eq("numero", numero).maybeSingle();
  if (error || !cot) return null;
  const c = cot as Record<string, any>;
  const numCot = String(c.numero);

  const [{ data: cli }, { data: prv }, { data: itemsRaw }, { data: simRaw }, { data: asesorUsr }] = await Promise.all([
    service.from("mae_clientes").select("*").eq("id", c.id_cliente).maybeSingle(),
    service.from("mae_proveedores").select("*").eq("id", c.id_proveedor).maybeSingle(),
    service.from("ven_cotizacion_items").select("*, mae_materiales(id,codigo_tmp,nombre,descripcion,unidad)").eq("numero_cot", numCot),
    service.from("ven_financiamiento_sim").select("cuotas,valor_cuota").eq("numero_cot", numCot).order("cuotas"),
    c.created_by
      ? service.from("seg_usuarios").select("id,nombre,correo,telefono").eq("id", c.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const cliR = (cli ?? {}) as Record<string, any>;
  const prvR = (prv ?? {}) as Record<string, any>;
  const aseR = (asesorUsr ?? {}) as Record<string, any>;

  // pre_tarifario vigente como respaldo de precio (100% BD, sin demo).
  let tarifas = new Map<string, number>();
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: tar } = await service.from("pre_tarifario").select("id_material,precio,estado,fecha_inicio,fecha_fin")
      .eq("estado", "VIGENTE").lte("fecha_inicio", hoy);
    for (const t of ((tar ?? []) as Record<string, any>[])) {
      const fin = t.fecha_fin as string | null;
      if (fin && fin < hoy) continue;
      if (!tarifas.has(String(t.id_material))) tarifas.set(String(t.id_material), Number(t.precio ?? 0));
    }
  } catch { /* best-effort */ }

  const items = (((itemsRaw ?? []) as Record<string, any>[])).map((it, i) => {
    const mat = (it.mae_materiales ?? {}) as Record<string, any>;
    const cant = Number(it.cantidad ?? 0);
    let punit = Number(it.precio ?? 0);
    if ((!punit || !Number.isFinite(punit)) && mat.id && tarifas.has(String(mat.id))) {
      punit = tarifas.get(String(mat.id)) ?? 0;
    }
    const dsctoTipo = String(it.dscto_tipo ?? "Ninguno");
    const valor = Number(it.valor ?? 0);
    // dscto_tipo '%' → valor es %; 'Ninguno' → 0%.
    const dscto = dsctoTipo === "%" ? valor : 0;
    const neto = Number(it.neto ?? cant * punit * (1 - dscto / 100));
    const nombre = String(mat.nombre ?? `Material ${it.id_material ?? ""}`);
    const desc = String(mat.descripcion ?? "");
    const cod = String(mat.codigo_tmp ?? mat.id ?? "");
    const base = cod ? `${cod} · ${nombre}` : nombre;
    const material = desc ? `${base} — ${desc}` : base;
    return { idx: i + 1, material, cant, punit, dscto, neto };
  });

  const subtotal = Number(c.subtotal ?? 0);
  const descuento = Number(c.descuento ?? 0);
  const totalStored = Number(c.total ?? 0);
  const cuotaInicial = Number(c.cuota_inicial ?? 0);
  // Importe = sumatoria de productos SIN IGV (el IGV solo va en las cuotas).
  const netoSgt = Math.round(items.reduce((a, it) => a + it.neto, 0) * 100) / 100;
  const total = netoSgt > 0 ? netoSgt : totalStored;
  const capital = netoSgt > 0
    ? Math.max(Math.round((total - cuotaInicial) * 100) / 100, 0)
    : (Number(c.capital_financiado ?? (total - cuotaInicial)) || 0);
  const tea = teaADecimal(Number(c.tea ?? 40));
  const plazo = Number(c.cuotas_elegidas ?? 9) || 9;

  let tabla: { plazo: number; cuota: number }[] = [];
  if (Array.isArray(simRaw) && simRaw.length > 0) {
    tabla = (simRaw as Record<string, any>[]).map((s) => ({ plazo: Number(s.cuotas), cuota: Number(s.valor_cuota) }));
  } else if (capital > 0) {
    tabla = tablaSimulacion(capital, tea, PLAZOS_SIMULACION, true).map((f) => ({ plazo: f.plazo, cuota: f.cuota }));
  } else {
    tabla = [...PLAZOS_SIMULACION].map((p) => ({ plazo: p, cuota: 0 }));
  }
  let cuotaMensual = 0;
  const filaElegida = tabla.find((f) => f.plazo === plazo);
  if (filaElegida) cuotaMensual = filaElegida.cuota;
  else if (capital > 0) cuotaMensual = cuotaFrancesaConIgv(capital, tea, plazo);

  const docCli = [cliR.tipo_doc, cliR.nro_doc].filter(Boolean).join(" ") || "—";
  const parsed = extraerDetalles(String(c.observaciones ?? ""));

  return {
    codigo: numCot,
    estado: String(c.estado ?? "Pendiente"),
    fecha: c.created_at ? new Date(c.created_at).toLocaleDateString("es-PE") : new Date().toLocaleDateString("es-PE"),
    observaciones: parsed.resto,
    detalles: parsed.detalles,
    subtotal, descuento, total,
    clienteNombre: String(cliR.nombre_razon_social ?? "—"),
    clienteDoc: docCli || "—",
    clienteEmail: String(cliR.correo ?? "—"),
    clienteTel: String(cliR.telefono ?? "—"),
    clienteContacto: String(cliR.contacto ?? ""),
    proveedor: String(prvR.nombre_comercial ?? prvR.razon_social ?? "—"),
    proveedorRuc: String(prvR.ruc ?? ""),
    proveedorEmail: String(prvR.correo ?? ""),
    proveedorTel: String(prvR.telefono ?? ""),
    asesor: String(aseR.nombre ?? "—"),
    asesorTelefono: String(c.asesor_telefono ?? aseR.telefono ?? "—"),
    asesorEmail: String(aseR.correo ?? "—"),
    cuotaInicial, capital, tea, plazo, cuotaMensual, tabla,
    items,
  };
}

/** Completa el nombre desde el maestro SGT cuando el join legacy viene null. */
async function nombresMaePdf(service: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const limpios = [...new Set(ids.filter(Boolean))];
  if (limpios.length === 0) return map;
  try {
    const { data, error } = await service.from("mae_materiales")
      .select("id,nombre,descripcion,codigo_tmp,codigo_sap").in("id", limpios);
    if (error || !data) return map;
    for (const m of (data as Record<string, any>[])) {
      const cod = String(m.codigo_tmp ?? m.codigo_sap ?? "");
      const base = cod ? `${cod} ${String(m.nombre ?? "")}`.trim() : String(m.nombre ?? "");
      const desc = String(m.descripcion ?? "");
      map.set(String(m.id), desc ? `${base} — ${desc}` : base);
    }
  } catch { /* sin maestro SGT: se mantiene el nombre legacy */ }
  return map;
}

async function obtenerDatosLegacy(service: SupabaseClient, id: string): Promise<DatosPdf> {
  const { data: cotRaw, error } = await service.from("cotizaciones").select("*, clientes(*)").eq("id", id).single();
  if (error || !cotRaw) throw new Error("Cotización no encontrada");
  const c = cotRaw as Record<string, any>;
  const cli = (c.clientes ?? {}) as Record<string, any>;
  const { data: itemsRaw } = await service.from("cotizacion_items")
    .select("*, materiales(codigo,nombre,unidad)").eq("cotizacion_id", id);
  const crudos = ((itemsRaw ?? []) as (ItemPdf & { material_id?: string | null })[]);
  const mae = await nombresMaePdf(service, crudos.filter((it) => !it.materiales && it.material_id).map((it) => String(it.material_id)));
  const items = crudos.map((it, i) => {
    const cant = Number(it.cantidad ?? 0), punit = Number(it.precio_unit ?? 0);
    const dscto = Number(it.descuento_pct ?? 0);
    const neto = Number(it.total_linea ?? cant * punit * (1 - dscto / 100));
    const snap = String((it as Record<string, unknown>).descripcion ?? "").trim();
    const matMae = it.material_id ? mae.get(String(it.material_id)) : undefined;
    const mat = snap || (it.materiales
      ? `${it.materiales?.codigo ?? ""} ${it.materiales?.nombre ?? "Ítem"}`.trim()
      : (matMae || `Ítem ${it.material_id ?? ""}`.trim() || "Ítem"));
    return { idx: i + 1, material: mat, cant, punit, dscto, neto };
  });
  const bruto = items.reduce((a, it) => a + it.cant * it.punit, 0);
  const netoSum = items.reduce((a, it) => a + it.neto, 0);
  const netoItems = Math.round(netoSum * 100) / 100;
  // Importe = sumatoria de productos SIN IGV (el IGV solo va en las cuotas).
  const total = netoItems > 0 ? netoItems : (Number(c.total ?? 0) || 0);
  const subtotal = netoItems > 0 ? netoItems : (Number(c.subtotal ?? bruto) || Math.round(bruto * 100) / 100);
  const descuento = c.descuento != null ? Number(c.descuento) : Math.max(Math.round((subtotal - total) * 100) / 100, 0);
  const cuotaInicial = Number(c.cuota_inicial ?? 0) || 0;
  const capital = Math.max(Math.round((total - cuotaInicial) * 100) / 100, 0);
  const tea = teaADecimal(Number(c.tea ?? 0.40));
  const plazo = Number(c.plazo ?? 9) || 9;
  let tabla = tablaSimulacion(capital > 0 ? capital : total, tea, PLAZOS_SIMULACION, true)
    .map((f) => ({ plazo: f.plazo, cuota: f.cuota }));
  let cuotaMensual = capital > 0 ? cuotaFrancesaConIgv(capital, tea, plazo) : 0;
  for (const t of ["cotizacion_simulaciones", "cotizacion_financiamiento"]) {
    const { data } = await service.from(t).select("*").eq("cotizacion_id", id)
      .order("created_at", { ascending: false }).limit(1);
    if (data && data.length > 0) {
      const s = data[0] as Record<string, any>;
      if (Array.isArray(s.tabla) && s.tabla.length > 0) tabla = s.tabla;
      if (s.cuota_mensual != null) cuotaMensual = Number(s.cuota_mensual);
      break;
    }
  }
  const parsedLeg = extraerDetalles(String(c.observaciones ?? ""));
  return {
    codigo: String(c.codigo ?? id.slice(0, 8)),
    estado: String(c.estado ?? "BORRADOR"),
    fecha: c.created_at ? new Date(c.created_at).toLocaleDateString("es-PE") : new Date().toLocaleDateString("es-PE"),
    observaciones: parsedLeg.resto,
    detalles: parsedLeg.detalles,
    subtotal, descuento, total,
    clienteNombre: String(cli.nombres ?? "—"),
    clienteDoc: String(cli.dni ?? cli.documento ?? "—"),
    clienteEmail: String(cli.email ?? "—"),
    clienteTel: String(cli.telefono ?? "—"),
    proveedor: String(c.proveedor ?? cli.proveedor ?? "—"),
    asesor: String(c.asesor ?? "—"),
    asesorTelefono: String((c as Record<string, unknown>).asesor_telefono ?? "—"),
    asesorEmail: "—",
    cuotaInicial, capital: capital > 0 ? capital : total, tea, plazo, cuotaMensual, tabla,
    items
  };
}

export async function obtenerDatosPdf(service: SupabaseClient, id: string): Promise<DatosPdf> {
  const clave = decodeURIComponent(String(id ?? "")).trim();
  // 1) Modelo SGT360: ven_cotizaciones por numero (COT-AMCA-xxxxx).
  try {
    const sgt = await obtenerDatosSGT(service, clave);
    if (sgt) return sgt;
  } catch { /* cae a legacy */ }
  // 2) Legacy: cotizaciones por uuid.
  return obtenerDatosLegacy(service, clave);
}

/** Logo Cálidda para el header (SOLO SERVER).
 *  Lee public/logo-calidda.png y lo reduce a 240px con sharp para que el PDF
 *  no pese 1MB. Retorna {dataUrl, wMm, hMm} con alto 11mm, o null (texto).
 */
let _logoCache: { dataUrl: string; wMm: number; hMm: number } | null | undefined;
async function logoCalidda(): Promise<{ dataUrl: string; wMm: number; hMm: number } | null> {
  if (_logoCache !== undefined) return _logoCache;
  _logoCache = null;
  try {
    const fs = await import("fs");
    const path = await import("path");
    const sharp = (await import("sharp")).default;
    const p = path.join(process.cwd(), "public", "logo-calidda.png");
    const small: Buffer = await sharp(fs.readFileSync(p)).resize({ width: 240 }).png().toBuffer();
    const meta = await sharp(small).metadata();
    const w = meta.width ?? 240;
    const h = meta.height ?? 60;
    if (!w || !h) return _logoCache;
    const hMm = 11;
    _logoCache = {
      dataUrl: `data:image/png;base64,${small.toString("base64")}`,
      wMm: Math.min(55, (hMm * w) / h),
      hMm,
    };
  } catch { /* sin logo o sin sharp: se usa texto */ }
  return _logoCache;
}

export async function buildCotizacionPdf(d: DatosPdf): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, ML = 14, MR = W - 14, ANCHO = W - 28;
  const fmt = (n: number) =>
    `S/ ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtCant = (n: number) =>
    Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const pct = (n: number) => `${Number(n || 0).toFixed(0)}%`;
  const gris = (v: number) => doc.setTextColor(v, v, v);

  const linea = (y: number, grosor = 0.3, color: readonly number[] = GRIS_LINEA) => {
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(grosor);
    doc.line(ML, y, MR, y);
  };

  const tituloSeccion = (t: string, y: number) => {
    doc.setFillColor(...TEAL);
    doc.rect(ML, y - 4.2, 1.6, 6, "F");
    doc.setTextColor(...TEAL);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
    doc.text(t, ML + 4, y);
    doc.setTextColor(0, 0, 0);
    return y + 5;
  };

  // ---- header blanco estilo modelo: logo izquierda, COTIZACIÓN derecha ----
  const logo = await logoCalidda();
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, "PNG", ML, 6, logo.wMm, logo.hMm);
    } catch {
      doc.setTextColor(...TEAL);
      doc.setFont("helvetica", "bold"); doc.setFontSize(14);
      doc.text("Cálidda", ML, 12);
    }
  } else {
    doc.setTextColor(...TEAL);
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("Cálidda", ML, 12);
  }
  gris(120); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.text("Ambientes Cáliddos", ML, 20.5);
  doc.setTextColor(...TEAL);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("COTIZACIÓN", MR, 11, { align: "right" });
  gris(80); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(d.codigo, MR, 16, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.text(`Fecha: ${d.fecha} · Estado: ${d.estado}`, MR, 20.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(...VERDE); doc.setLineWidth(0.8);
  doc.line(ML, 24, MR, 24);

  let y = 31;

  // ---- CLIENTE Y CONTACTO COMERCIAL: tabla 2 columnas con bordes ----
  y = tituloSeccion("CLIENTE Y CONTACTO COMERCIAL", y);
  const celdaCli = (x: number, w: number, etiqueta: string, valor: string, yy: number) => {
    gris(130); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(etiqueta, x + 2, yy + 3.5);
    doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    const ls = doc.splitTextToSize(String(valor || "—").slice(0, 90), w - 4) as string[];
    doc.text(ls.slice(0, 2), x + 2, yy + 7.5);
    return Math.max(1, Math.min(2, ls.length)) * 4 + 4.5;
  };
  const filasCli: [string, string, string, string][] = [
    ["CLIENTE", d.clienteNombre ?? "—", "DOCUMENTO", d.clienteDoc ?? "—"],
    ["CORREO DEL CLIENTE", d.clienteEmail ?? "—", "TELÉFONO DEL CLIENTE", d.clienteTel ?? "—"],
    ["PROVEEDOR", [d.proveedor ?? "—", d.proveedorRuc ? `RUC ${d.proveedorRuc}` : ""].filter(Boolean).join(" · "), "ASESOR-CONTACTO",
      [d.asesor ?? "—", d.asesorTelefono && d.asesorTelefono !== "—" ? `Tel. ${d.asesorTelefono}` : ""].filter(Boolean).join(" / ")],
  ];
  const colW = ANCHO / 2;
  const topCli = y;
  const alturas = filasCli.map(([a, b, c, e]) =>
    Math.max(celdaAlto(a, b, colW), celdaAlto(c, e, colW)));
  function celdaAlto(et: string, v: string, w: number) {
    const ls = doc.splitTextToSize(String(v || "—").slice(0, 90), w - 4) as string[];
    return Math.max(1, Math.min(2, ls.length)) * 4 + 4.5;
  }
  doc.setDrawColor(...GRIS_LINEA); doc.setLineWidth(0.3);
  let yy = topCli;
  const dibujadas: number[] = [];
  for (let i = 0; i < filasCli.length; i++) {
    dibujadas.push(yy);
    yy += alturas[i];
  }
  doc.rect(ML, topCli, ANCHO, yy - topCli);
  doc.line(ML + colW, topCli, ML + colW, yy);
  for (let i = 1; i < filasCli.length; i++) doc.line(ML, dibujadas[i], MR, dibujadas[i]);
  for (let i = 0; i < filasCli.length; i++) {
    const [a, b, c, e] = filasCli[i];
    celdaCli(ML, colW, a, b, dibujadas[i]);
    celdaCli(ML + colW, colW, c, e, dibujadas[i]);
  }
  if (d.clienteContacto) {
    yy += 2;
    gris(130); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text("CONTACTO", ML, yy);
    doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text(String(d.clienteContacto).slice(0, 100), ML + 22, yy);
    yy += 4;
  }
  y = yy + 9;

  // ---- MATERIALES Y SERVICIOS: tabla con bordes ----
  y = tituloSeccion("MATERIALES Y SERVICIOS", y);
  const cx = [ML, ML + 12, ML + 108, ML + 126, ML + 148, ML + 162, MR]; // ITEM/MAT/CANT/PUNIT/DSCTO/NETO
  const headM = ["ITEM", "MATERIAL", "CANT.", "P. UNITARIO", "DSCTO.", "NETO"];
  const dibujaHeadMat = (yyy: number) => {
    doc.setFillColor(...GRIS_BG);
    doc.rect(ML, yyy, ANCHO, 6, "F");
    doc.setDrawColor(...GRIS_LINEA); doc.setLineWidth(0.3);
    doc.rect(ML, yyy, ANCHO, 6);
    for (let i = 1; i < cx.length - 1; i++) doc.line(cx[i], yyy, cx[i], yyy + 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); gris(60);
    headM.forEach((h, i) => doc.text(h, cx[i] + 1.5, yyy + 4.2));
    doc.setTextColor(0, 0, 0);
    return yyy + 6;
  };
  y = dibujaHeadMat(y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  for (const it of d.items) {
    const matLineas = doc.splitTextToSize(it.material || "—", cx[2] - cx[1] - 3) as string[];
    const h = Math.max(1, matLineas.length) * 4 + 2;
    if (y + h > 255) {
      doc.setDrawColor(...GRIS_LINEA); doc.line(ML, y, MR, y);
      doc.addPage(); y = 18; y = dibujaHeadMat(y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    }
    const y0 = y;
    doc.text(String(it.idx), cx[0] + 1.5, y + 4);
    doc.text(matLineas, cx[1] + 1.5, y + 4);
    doc.text(fmtCant(it.cant), cx[2] + 1.5, y + 4);
    doc.text(Number(it.punit).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cx[3] + 1.5, y + 4);
    doc.text(it.dscto > 0 ? pct(it.dscto) : "-", cx[4] + 1.5, y + 4);
    doc.setFont("helvetica", "bold");
    doc.text(fmt(it.neto), cx[5] + 1.5, y + 4);
    doc.setFont("helvetica", "normal");
    y += h;
    doc.setDrawColor(...GRIS_LINEA); doc.setLineWidth(0.3);
    doc.line(ML, y, MR, y);
    for (let i = 1; i < cx.length - 1; i++) doc.line(cx[i], y0, cx[i], y);
  }
  y += 6;
  // Solo: Subtotal (importe productos) / Descuento (solo si hay) /
  // Adelanto (abono) / Total (= valor a financiar = importe − adelanto).
  // Sin fila IGV: el IGV va incluido en las cuotas del financiamiento.
  const descPos = d.descuento > 0 ? d.descuento : 0;
  const adelanto = Math.max(Number(d.cuotaInicial || 0), 0);
  const totalFinanciar = Math.max(Math.round((d.total - adelanto) * 100) / 100, 0);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text("Subtotal (importe productos):", MR - 62, y); doc.text(fmt(d.total), MR, y, { align: "right" }); y += 4.5;
  if (descPos > 0) {
    doc.text("Descuento:", MR - 62, y); doc.text(fmt(descPos), MR, y, { align: "right" }); y += 4.5;
  }
  doc.text("Adelanto (abono):", MR - 62, y); doc.text(fmt(adelanto), MR, y, { align: "right" }); y += 4.5;
  doc.setDrawColor(...VERDE); doc.setLineWidth(0.5); doc.line(MR - 72, y, MR, y); y += 4.5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("Total (valor a financiar):", MR - 62, y); doc.text(fmt(totalFinanciar), MR, y, { align: "right" });
  doc.setFontSize(8.5);
  y += 12;

  // ---- FINANCIAMIENTO: 5 cajas + matriz horizontal con elegida en verde ----
  if (y > 230) { doc.addPage(); y = 18; }
  y = tituloSeccion("FINANCIAMIENTO", y);
  const boxW = ANCHO / 5;
  const boxes: [string, string][] = [
    ["ADELANTO", fmt(d.cuotaInicial)],
    ["VALOR A FINANCIAR", fmt(d.capital)],
    ["TEA", `${(d.tea * 100).toFixed(2)}%`],
    ["PLAZO", `${d.plazo} cuotas`],
    ["CUOTA MENSUAL*", fmt(d.cuotaMensual)],
  ];
  const yBox = y;
  doc.setDrawColor(...GRIS_LINEA); doc.setLineWidth(0.3);
  doc.roundedRect(ML, yBox, ANCHO, 13, 2, 2);
  boxes.forEach(([lab, val], i) => {
    const x = ML + i * boxW;
    if (i > 0) doc.line(x, yBox, x, yBox + 13);
    gris(130); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(lab, x + 2, yBox + 4.2);
    doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text(String(val).slice(0, 24), x + 2, yBox + 9.5);
  });
  y = yBox + 19;

  const nCuotas = d.tabla.length;
  const c0 = 30, cw = (ANCHO - c0) / Math.max(1, nCuotas);
  const headY = y;
  doc.setFillColor(...GRIS_BG);
  doc.rect(ML, headY, ANCHO, 6, "F");
  doc.setDrawColor(...GRIS_LINEA); doc.rect(ML, headY, ANCHO, 12);
  doc.line(ML, headY + 6, MR, headY + 6);
  doc.line(ML + c0, headY, ML + c0, headY + 12);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); gris(60);
  doc.text("CUOTAS", ML + 2, headY + 4.2);
  doc.text("VALOR CUOTA", ML + 2, headY + 10.2);
  doc.setTextColor(0, 0, 0);
  d.tabla.forEach((f, i) => {
    const x = ML + c0 + i * cw;
    const elegida = f.plazo === d.plazo;
    if (elegida) {
      doc.setFillColor(...VERDE);
      doc.rect(x, headY, cw, 12, "F");
      doc.setTextColor(255, 255, 255);
    }
    if (i > 0) { doc.setDrawColor(...GRIS_LINEA); doc.line(x, headY, x, headY + 12); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    const cxC = x + cw / 2;
    doc.text(String(f.plazo), cxC, headY + 4.2, { align: "center" });
    doc.setFont("helvetica", elegida ? "bold" : "normal"); doc.setFontSize(6.5);
    doc.text(fmt(f.cuota), cxC, headY + 10.2, { align: "center" });
    if (elegida) doc.setTextColor(0, 0, 0);
  });
  // Etiqueta ELEGIDA bajo la columna elegida (con aire para no chocar la sección siguiente).
  {
    const ie = d.tabla.findIndex((f) => f.plazo === d.plazo);
    if (ie >= 0) {
      const cxC = ML + c0 + ie * cw + cw / 2;
      doc.setFont("helvetica", "bold"); doc.setFontSize(6); gris(100);
      doc.text("ELEGIDA", cxC, headY + 15, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }
  }
  y = headY + 21;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); gris(110);
  doc.text("* Cuota mensual con IGV del interés incluido (TEM × 1.18).", ML, y - 5);

  // ---- DETALLES DEL MUEBLE: siempre visible, luego de las cuotas y
  // antes de consideraciones. Sin datos muestra "—" por fila.
  {
    const detMueble = d.detalles.length > 0
      ? d.detalles
      : DETALLES_LABELS.map(({ etiqueta }) => ({ etiqueta, valor: "—" }));
    if (y > 225) { doc.addPage(); y = 18; }
    y = tituloSeccion("DETALLES DEL MUEBLE", y);
    const hFila = 6.5;
    const alto = detMueble.length * hFila;
    if (y + alto > 258) { doc.addPage(); y = 18; }
    const yDet = y;
    const colLab = 72;
    doc.setDrawColor(...GRIS_LINEA); doc.setLineWidth(0.3);
    doc.rect(ML, yDet, ANCHO, alto);
    doc.line(ML + colLab, yDet, ML + colLab, yDet + alto);
    detMueble.forEach((t, i) => {
      const yy = yDet + i * hFila;
      if (i > 0) doc.line(ML, yy, MR, yy);
      gris(130); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
      doc.text(String(t.etiqueta).toUpperCase().slice(0, 34), ML + 2, yy + 4.5);
      doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      doc.text(String(t.valor).slice(0, 60), ML + colLab + 2, yy + 4.5);
    });
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    y = yDet + alto + 7;
  }

  // ---- CONSIDERACIONES: ocupa el espacio en blanco; lo que no alcance
  // fluye a la hoja 2. Letra normal y con aire entre líneas.
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  const lineasCons = CONSIDERACIONES.map((c) => doc.splitTextToSize(c, ANCHO) as string[]);
  if (y + 14 > 278) { doc.addPage(); y = 18; }
  y = tituloSeccion("CONSIDERACIONES", y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  for (const ls of lineasCons) {
    if (y + ls.length * 4.0 > 272) { doc.addPage(); y = 18; doc.setFont("helvetica", "normal"); doc.setFontSize(8); }
    doc.text(ls, ML, y);
    y += ls.length * 4.0 + 1.2;
  }
  // Banda amarilla: si no entra en lo que queda, va a la hoja 2.
  if (y + 14 > 278) { doc.addPage(); y = 18; }
  y += 6;
  doc.setFillColor(...AMARILLO);
  doc.rect(ML, y - 4, ANCHO, 8, "F");
  doc.setDrawColor(200, 150, 0); doc.setLineWidth(0.4);
  doc.rect(ML, y - 4, ANCHO, 8);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("ESTA COTIZACIÓN NO ES UN CONTRATO", W / 2, y + 1.8, { align: "center" });
  y += 8;
  if (d.observaciones) {
    y += 2;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const lo = doc.splitTextToSize(`Observaciones: ${d.observaciones}`, ANCHO) as string[];
    if (y + lo.length * 3.8 > 272) { doc.addPage(); y = 18; doc.setFont("helvetica", "normal"); doc.setFontSize(8); }
    doc.text(lo, ML, y);
    y += lo.length * 3.8;
  }

  const asesorTxt = d.asesor && d.asesor !== "—"
    ? `tu asesor ${d.asesor.slice(0, 28)}`
    : "tu asesor de venta";
  const lineaContacto = `Comunícate con ${asesorTxt} · WhatsApp: ${CONTACTO_WHATSAPP} · ${CONTACTO_FIJO}`;
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    // Banda moderna de contacto: fondo teal, texto blanco grande.
    doc.setFillColor(...TEAL);
    doc.roundedRect(ML, 280.5, ANCHO, 12, 2.5, 2.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("¿Dudas o consultas sobre tu cotización?", W / 2, 285.2, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text(lineaContacto, W / 2, 289.4, { align: "center" });
    doc.setFontSize(7); gris(110);
    doc.text(`Pág. ${i}/${n}`, W / 2, 294.8, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }
  return doc;
}
