import { jsPDF } from "jspdf";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cuotaFrancesa, tablaSimulacion, temDesdeTea, PLAZOS_SIMULACION } from "./financiamiento";

/** SOLO SERVER: construcción del PDF 2 páginas estilo captura COT-AMCA. */

export interface ItemPdf {
  cantidad?: number; precio_unit?: number; descuento_pct?: number; total_linea?: number;
  materiales?: { codigo?: string; nombre?: string; unidad?: string } | null;
}
export interface DatosPdf {
  codigo: string; estado?: string; fecha?: string; observaciones?: string;
  subtotal: number; descuento: number; total: number;
  clienteNombre?: string; clienteDoc?: string; clienteEmail?: string; clienteTel?: string;
  proveedor?: string; asesor?: string;
  cuotaInicial: number; capital: number; tea: number; plazo: number; cuotaMensual: number;
  tabla: { plazo: number; cuota: number }[];
  items: { idx: number; material: string; cant: number; punit: number; dscto: number; neto: number }[];
}

const AZUL = [0, 51, 102] as const;
const ROJO = [227, 6, 19] as const;
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

export async function obtenerDatosPdf(service: SupabaseClient, id: string): Promise<DatosPdf> {
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
    return { idx: i + 1, material: mat.slice(0, 64), cant, punit, dscto, neto };
  });
  const bruto = items.reduce((a, it) => a + it.cant * it.punit, 0);
  const netoSum = items.reduce((a, it) => a + it.neto, 0);
  const subtotal = Number(c.subtotal ?? bruto) || Math.round(bruto * 100) / 100;
  const total = Number(c.total ?? netoSum) || Math.round(netoSum * 100) / 100;
  const descuento = c.descuento != null ? Number(c.descuento) : Math.round((subtotal - total) * 100) / 100;
  const cuotaInicial = Number(c.cuota_inicial ?? 0) || 0;
  const capital = Number(c.capital ?? (total - cuotaInicial)) || total - cuotaInicial;
  const teaRaw = Number(c.tea ?? 0.40);
  const tea = teaRaw > 1 ? teaRaw / 100 : teaRaw || 0.40;
  const plazo = Number(c.plazo ?? 9) || 9;
  // Simulación guardada si existe, si no se calcula.
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
    cuotaInicial, capital: capital > 0 ? capital : total, tea, plazo, cuotaMensual, tabla,
    items
  };
}

export function buildCotizacionPdf(d: DatosPdf): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const fmt = (n: number) => `S/ ${Number(n || 0).toFixed(2)}`;
  const pct = (n: number) => `${Number(n || 0).toFixed(0)}%`;

  // ---- header ----
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

  // ---- cliente y contacto comercial ----
  seccion("CLIENTE Y CONTACTO COMERCIAL");
  const filasCli: [string, string][] = [
    ["Cliente:", d.clienteNombre ?? "—"],
    ["Documento:", d.clienteDoc ?? "—"],
    ["Correo:", d.clienteEmail ?? "—"],
    ["Teléfono:", d.clienteTel ?? "—"],
    ["Proveedor:", d.proveedor ?? "—"],
    ["Asesor:", d.asesor ?? "—"]
  ];
  for (const [k, v] of filasCli) {
    doc.setFont("helvetica", "bold"); doc.text(k, 16, y);
    doc.setFont("helvetica", "normal"); doc.text(String(v).slice(0, 70), 45, y);
    y += 4.5;
  }
  y += 2;

  // ---- materiales y servicios ----
  seccion("MATERIALES Y SERVICIOS");
  const cols = [16, 26, 105, 122, 142, 162]; // ITEM/MATERIAL/CANT/P.UNIT/DSCTO/NETO
  doc.setFont("helvetica", "bold");
  doc.text("ITEM", cols[0], y); doc.text("MATERIAL", cols[1], y);
  doc.text("CANT", cols[2], y); doc.text("P.UNITARIO", cols[3], y);
  doc.text("DSCTO", cols[4], y); doc.text("NETO", cols[5], y);
  y += 2; doc.line(14, y, W - 14, y); y += 4;
  doc.setFont("helvetica", "normal");
  for (const it of d.items) {
    if (y > 250) { doc.addPage(); y = 18; }
    doc.text(String(it.idx), cols[0], y);
    doc.text(it.material.slice(0, 44), cols[1], y);
    doc.text(String(it.cant), cols[2], y);
    doc.text(Number(it.punit).toFixed(2), cols[3], y);
    doc.text(pct(it.dscto), cols[4], y);
    doc.text(Number(it.neto).toFixed(2), cols[5], y);
    y += 5;
  }
  y += 2; doc.line(14, y, W - 14, y); y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(`Subtotal: ${fmt(d.subtotal)}`, W - 14, y, { align: "right" }); y += 5;
  doc.text(`Descuento: ${fmt(d.descuento)}`, W - 14, y, { align: "right" }); y += 5;
  doc.setFontSize(12);
  doc.text(`Total: ${fmt(d.total)}`, W - 14, y, { align: "right" });
  doc.setFontSize(9);
  y += 8;

  // ---- página 2: financiamiento ----
  doc.addPage();
  y = 18;
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text(`FINANCIAMIENTO · ${d.codigo}`, 14, 11);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  const tem = temDesdeTea(d.tea);
  const infoFin = `Cuota inicial: ${fmt(d.cuotaInicial)}   Capital: ${fmt(d.capital)}   TEA: ${(d.tea * 100).toFixed(2)}% (TEM ${(tem * 100).toFixed(3)}%)   Plazo: ${d.plazo} meses   Cuota mensual: ${fmt(d.cuotaMensual)}`;
  doc.text(doc.splitTextToSize(infoFin, W - 28), 14, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.text("CUOTAS", 14, y); doc.text("MENSUAL", 150, y);
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
    doc.text(`${f.plazo} cuotas`, 14, y);
    doc.text(fmt(f.cuota), 150, y);
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
  doc.setFillColor(...ROJO);
  doc.rect(14, y - 4, W - 28, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("ESTA COTIZACIÓN NO ES UN CONTRATO", W / 2, y + 2.5, { align: "center" });
  doc.setTextColor(0, 0, 0);
  if (d.observaciones) {
    y += 10;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(`Observaciones: ${d.observaciones}`, W - 28), 14, y);
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
