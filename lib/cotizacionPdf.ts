import { jsPDF } from "jspdf";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cuotaFrancesa, tablaSimulacion, temDesdeTea, PLAZOS_SIMULACION } from "./financiamiento";

/** SOLO SERVER: construcción del PDF estilo captura COT-AMCA-00012.
 *  Fuente 100% BD SGT360: ven_cotizaciones + ven_cotizacion_items +
 *  mae_clientes + mae_proveedores + mae_materiales + pre_tarifario +
 *  ven_financiamiento_sim. Sin textos demo.
 */

export interface ItemPdf {
  cantidad?: number; precio_unit?: number; descuento_pct?: number; total_linea?: number;
  materiales?: { codigo?: string; nombre?: string; unidad?: string } | null;
}
export interface DatosPdf {
  codigo: string; estado?: string; fecha?: string; observaciones?: string;
  subtotal: number; descuento: number; total: number;
  clienteNombre?: string; clienteDoc?: string; clienteEmail?: string; clienteTel?: string;
  clienteContacto?: string;
  proveedor?: string; proveedorRuc?: string; proveedorEmail?: string; proveedorTel?: string;
  asesor?: string; asesorTelefono?: string; asesorEmail?: string;
  cuotaInicial: number; capital: number; tea: number; plazo: number; cuotaMensual: number;
  tabla: { plazo: number; cuota: number }[];
  items: { idx: number; material: string; cant: number; punit: number; dscto: number; neto: number }[];
}

const AZUL = [0, 51, 102] as const;
const ROJO = [227, 6, 19] as const;
const AMARILLO = [255, 193, 7] as const;
const GRIS = [245, 245, 245] as const;

const CONSIDERACIONES = [
  "1. Precios en soles, incluyen IGV salvo indicación contraria.",
  "2. Validez de la oferta: 15 días calendario.",
  "3. El financiamiento está sujeto a evaluación crediticia.",
  "4. La instalación requiere punto de gas habilitado y accesible.",
  "5. Los materiales cuentan con garantía de 12 meses por defectos de fábrica.",
  "6. Cualquier trabajo adicional será cotizado por separado.",
  "7. La aceptación de esta cotización se confirma con la firma del contrato."
];

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
  const total = Number(c.total ?? 0);
  const cuotaInicial = Number(c.cuota_inicial ?? 0);
  const capital = Number(c.capital_financiado ?? (total - cuotaInicial)) || 0;
  const tea = teaADecimal(Number(c.tea ?? 40));
  const plazo = Number(c.cuotas_elegidas ?? 9) || 9;

  let tabla: { plazo: number; cuota: number }[] = [];
  if (Array.isArray(simRaw) && simRaw.length > 0) {
    tabla = (simRaw as Record<string, any>[]).map((s) => ({ plazo: Number(s.cuotas), cuota: Number(s.valor_cuota) }));
  } else if (capital > 0) {
    tabla = tablaSimulacion(capital, tea, PLAZOS_SIMULACION).map((f) => ({ plazo: f.plazo, cuota: f.cuota }));
  } else {
    tabla = [...PLAZOS_SIMULACION].map((p) => ({ plazo: p, cuota: 0 }));
  }
  let cuotaMensual = 0;
  const filaElegida = tabla.find((f) => f.plazo === plazo);
  if (filaElegida) cuotaMensual = filaElegida.cuota;
  else if (capital > 0) cuotaMensual = cuotaFrancesa(capital, tea, plazo);

  const docCli = [cliR.tipo_doc, cliR.nro_doc].filter(Boolean).join(" ") || "—";

  return {
    codigo: numCot,
    estado: String(c.estado ?? "Pendiente"),
    fecha: c.created_at ? new Date(c.created_at).toLocaleDateString("es-PE") : new Date().toLocaleDateString("es-PE"),
    observaciones: String(c.observaciones ?? ""),
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

async function obtenerDatosLegacy(service: SupabaseClient, id: string): Promise<DatosPdf> {
  const { data: cotRaw, error } = await service.from("cotizaciones").select("*, clientes(*)").eq("id", id).single();
  if (error || !cotRaw) throw new Error("Cotización no encontrada");
  const c = cotRaw as Record<string, any>;
  const cli = (c.clientes ?? {}) as Record<string, any>;
  const { data: itemsRaw } = await service.from("cotizacion_items")
    .select("*, materiales(codigo,nombre,unidad)").eq("cotizacion_id", id);
  const items = ((itemsRaw ?? []) as ItemPdf[]).map((it, i) => {
    const cant = Number(it.cantidad ?? 0), punit = Number(it.precio_unit ?? 0);
    const dscto = Number(it.descuento_pct ?? 0);
    const neto = Number(it.total_linea ?? cant * punit * (1 - dscto / 100));
    const mat = `${it.materiales?.codigo ?? ""} ${it.materiales?.nombre ?? "Ítem"}`.trim();
    return { idx: i + 1, material: mat, cant, punit, dscto, neto };
  });
  const bruto = items.reduce((a, it) => a + it.cant * it.punit, 0);
  const netoSum = items.reduce((a, it) => a + it.neto, 0);
  const subtotal = Number(c.subtotal ?? bruto) || Math.round(bruto * 100) / 100;
  const total = Number(c.total ?? netoSum) || Math.round(netoSum * 100) / 100;
  const descuento = c.descuento != null ? Number(c.descuento) : Math.round((subtotal - total) * 100) / 100;
  const cuotaInicial = Number(c.cuota_inicial ?? 0) || 0;
  const capital = Number(c.capital ?? (total - cuotaInicial)) || total - cuotaInicial;
  const tea = teaADecimal(Number(c.tea ?? 0.40));
  const plazo = Number(c.plazo ?? 9) || 9;
  let tabla = tablaSimulacion(capital > 0 ? capital : total, tea, PLAZOS_SIMULACION)
    .map((f) => ({ plazo: f.plazo, cuota: f.cuota }));
  let cuotaMensual = capital > 0 ? cuotaFrancesa(capital, tea, plazo) : 0;
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
  return {
    codigo: String(c.codigo ?? id.slice(0, 8)),
    estado: String(c.estado ?? "BORRADOR"),
    fecha: c.created_at ? new Date(c.created_at).toLocaleDateString("es-PE") : new Date().toLocaleDateString("es-PE"),
    observaciones: String(c.observaciones ?? ""),
    subtotal, descuento, total,
    clienteNombre: String(cli.nombres ?? "—"),
    clienteDoc: String(cli.dni ?? cli.documento ?? "—"),
    clienteEmail: String(cli.email ?? "—"),
    clienteTel: String(cli.telefono ?? "—"),
    proveedor: String(c.proveedor ?? cli.proveedor ?? "—"),
    asesor: String(c.asesor ?? "—"),
    asesorTelefono: "—",
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

export function buildCotizacionPdf(d: DatosPdf): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const fmt = (n: number) => `S/ ${Number(n || 0).toFixed(2)}`;
  const pct = (n: number) => `${Number(n || 0).toFixed(0)}%`;

  // ---- header: logo Cálidda + COTIZACIÓN + número + Fecha/Estado ----
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Cálidda", 14, 11);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Soluciones Hogar", 14, 17);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(`COTIZACIÓN ${d.codigo}`, W - 14, 11, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Fecha: ${d.fecha}   Estado: ${d.estado}`, W - 14, 17, { align: "right" });
  doc.setTextColor(0, 0, 0);

  let y = 33;
  const seccion = (t: string) => {
    doc.setFillColor(...GRIS);
    doc.rect(14, y - 5, W - 28, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(t, 16, y);
    y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  };

  // ---- CLIENTE Y CONTACTO COMERCIAL ----
  seccion("CLIENTE Y CONTACTO COMERCIAL");
  const provLinea = [d.proveedor ?? "—", d.proveedorRuc ? `RUC ${d.proveedorRuc}` : ""].filter(Boolean).join(" · ");
  const asesorLinea = [d.asesor ?? "—", d.asesorTelefono && d.asesorTelefono !== "—" ? `Tel. ${d.asesorTelefono}` : "", d.asesorEmail && d.asesorEmail !== "—" ? d.asesorEmail : ""].filter(Boolean).join(" · ");
  const filasCli: [string, string][] = [
    ["CLIENTE:", d.clienteNombre ?? "—"],
    ["DOCUMENTO:", d.clienteDoc ?? "—"],
    ["CORREO DEL CLIENTE:", d.clienteEmail ?? "—"],
    ["TELÉFONO:", d.clienteTel ?? "—"],
    ["PROVEEDOR:", provLinea || "—"],
    ["ASESOR-CONTACTO:", asesorLinea || "—"]
  ];
  for (const [k, v] of filasCli) {
    const lineas = doc.splitTextToSize(String(v).slice(0, 160), 120) as string[];
    doc.setFont("helvetica", "bold"); doc.text(k, 16, y);
    doc.setFont("helvetica", "normal"); doc.text(lineas, 62, y);
    y += Math.max(1, lineas.length) * 4.5;
  }
  if (d.clienteContacto) {
    doc.setFont("helvetica", "bold"); doc.text("CONTACTO:", 16, y);
    doc.setFont("helvetica", "normal"); doc.text(String(d.clienteContacto).slice(0, 80), 62, y);
    y += 4.5;
  }
  y += 2;

  // ---- MATERIALES Y SERVICIOS (descripción multilínea) ----
  seccion("MATERIALES Y SERVICIOS");
  const cols = [14, 24, 118, 134, 154, 172]; // ITEM/MATERIAL/CANT/P.UNIT/DSCTO/NETO
  doc.setFont("helvetica", "bold");
  doc.text("ITEM", cols[0], y); doc.text("MATERIAL", cols[1], y);
  doc.text("CANT", cols[2], y); doc.text("P.UNITARIO", cols[3], y);
  doc.text("DSCTO", cols[4], y); doc.text("NETO", cols[5], y);
  y += 2; doc.line(14, y, W - 14, y); y += 4;
  doc.setFont("helvetica", "normal");
  for (const it of d.items) {
    const matLineas = doc.splitTextToSize(it.material || "—", 90) as string[];
    const h = Math.max(1, matLineas.length) * 4.2 + 1;
    if (y + h > 250) { doc.addPage(); y = 18; }
    doc.text(String(it.idx), cols[0], y);
    doc.text(matLineas, cols[1], y);
    doc.text(String(it.cant), cols[2], y);
    doc.text(Number(it.punit).toFixed(2), cols[3], y);
    doc.text(pct(it.dscto), cols[4], y);
    doc.text(Number(it.neto).toFixed(2), cols[5], y);
    y += h;
  }
  y += 2; doc.line(14, y, W - 14, y); y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(`Subtotal: ${fmt(d.subtotal)}`, W - 14, y, { align: "right" }); y += 5;
  doc.text(`Descuento: ${fmt(d.descuento)}`, W - 14, y, { align: "right" }); y += 5;
  doc.setFontSize(12);
  doc.text(`Total: ${fmt(d.total)}`, W - 14, y, { align: "right" });
  doc.setFontSize(9);
  y += 8;

  // ---- página 2: FINANCIAMIENTO ----
  doc.addPage();
  y = 18;
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text(`FINANCIAMIENTO · ${d.codigo}`, 14, 11);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  seccion("FINANCIAMIENTO");
  const tem = temDesdeTea(d.tea);
  const resumenFin: [string, string][] = [
    ["CUOTA INICIAL:", fmt(d.cuotaInicial)],
    ["CAPITAL:", fmt(d.capital)],
    ["TEA:", `${(d.tea * 100).toFixed(2)}% (TEM ${(tem * 100).toFixed(3)}%)`],
    ["PLAZO:", `${d.plazo} meses`],
    ["CUOTA MENSUAL:", fmt(d.cuotaMensual)],
  ];
  for (const [k, v] of resumenFin) {
    doc.setFont("helvetica", "bold"); doc.text(k, 16, y);
    doc.setFont("helvetica", "normal"); doc.text(String(v), 62, y);
    y += 4.5;
  }
  y += 3;

  doc.setFont("helvetica", "bold");
  doc.text("CUOTAS", 16, y); doc.text("VALOR CUOTA", 130, y);
  y += 2; doc.line(14, y, W - 14, y); y += 4;
  doc.setFont("helvetica", "normal");
  for (const f of d.tabla) {
    const elegida = f.plazo === d.plazo;
    if (elegida) {
      doc.setFillColor(...ROJO);
      doc.rect(14, y - 3.6, W - 28, 6, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
    }
    doc.text(`${f.plazo} cuotas${elegida ? "  · Elegida" : ""}`, 16, y);
    doc.text(fmt(f.cuota), 130, y);
    if (elegida) { doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); }
    y += 5.5;
  }
  y += 4;

  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("CONSIDERACIONES", 14, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  for (const c of CONSIDERACIONES) {
    const ls = doc.splitTextToSize(c, W - 28);
    if (y + ls.length * 4 > 258) { doc.addPage(); y = 18; }
    doc.text(ls, 14, y);
    y += ls.length * 4 + 1;
  }
  y += 4;
  // Banda amarilla: ESTA COTIZACIÓN NO ES UN CONTRATO
  doc.setFillColor(...AMARILLO);
  doc.rect(14, y - 4, W - 28, 9, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("ESTA COTIZACIÓN NO ES UN CONTRATO", W / 2, y + 2.5, { align: "center" });
  if (d.observaciones) {
    y += 10;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    const lo = doc.splitTextToSize(`Observaciones: ${d.observaciones}`, W - 28);
    if (y + lo.length * 4 > 280) { doc.addPage(); y = 18; }
    doc.text(lo, 14, y);
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic"); doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`Documento generado por Soluciones Hogar Cálidda · ${d.codigo} · pág. ${i}/${n}`, W / 2, 290, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }
  return doc;
}
