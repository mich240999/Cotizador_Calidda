import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { resolverAlcance, puedeVerVenta } from "@/lib/alcance";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVIDENCIAS_ORDEN = [
  ["acta", "Acta de conformidad firmada"],
  ["boleta", "Boleta de venta"],
  ["foto_dni", "Foto de DNI"],
  ["foto_cliente_dni", "Cliente con su DNI"],
  ["foto_antes", "Foto de antes"],
  ["foto_durante", "Foto durante la instalación"],
  ["foto_despues", "Foto después de la instalación"],
] as const;
const A4: [number, number] = [595.28, 841.89];
const COLOR = {
  azul: rgb(0.02, 0.34, 0.58),
  azulNoche: rgb(0.02, 0.17, 0.32),
  celeste: rgb(0, 0.61, 0.84),
  verde: rgb(0.0, 0.58, 0.38),
  texto: rgb(0.10, 0.16, 0.23),
  tenue: rgb(0.38, 0.45, 0.53),
  borde: rgb(0.84, 0.89, 0.94),
  fondo: rgb(0.95, 0.97, 0.99),
  blanco: rgb(1, 1, 1),
  fila: rgb(0.97, 0.985, 0.995),
};

function textoSeguro(value: unknown, fallback = "—"): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function envolver(texto: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, width: number, maxLines = 2): string[] {
  const words = texto.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 2))}…`;
  }
  return lines;
}

function dibujarEncabezado(
  page: ReturnType<PDFDocument["addPage"]>,
  titulo: string,
  referencia: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  logo?: Awaited<ReturnType<PDFDocument["embedPng"]>>,
) {
  const [width, height] = A4;
  if (logo) {
    const fit = logo.scale(Math.min(102 / logo.width, 38 / logo.height));
    page.drawImage(logo, { x: 36, y: height - 65, ...fit });
  } else {
    page.drawText("CÁLIDDA", { x: 36, y: height - 54, size: 16, font: bold, color: COLOR.azul });
  }
  page.drawText("AMBIENTES CÁLIDDOS", { x: 155, y: height - 35, size: 8, font, color: COLOR.tenue });
  page.drawText(titulo.toUpperCase(), { x: 155, y: height - 54, size: 13, font: bold, color: COLOR.azulNoche, maxWidth: width - 191, lineHeight: 12 });
  page.drawText(`Pedido de venta: ${referencia}`, { x: 155, y: height - 78, size: 9, font, color: COLOR.texto });
  page.drawLine({ start: { x: 36, y: height - 89 }, end: { x: width - 36, y: height - 89 }, thickness: 1, color: COLOR.azul });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const sesion = await getSession();
  if (!sesion) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  try {
    const service = createSupabaseServiceRole();
    const { data: venta, error: eVenta } = await service.from("vta_solicitudes_venta").select("*").eq("id", params.id).maybeSingle();
    if (eVenta) throw new Error(eVenta.message);
    if (!venta) return NextResponse.json({ ok: false, error: "Venta no encontrada" }, { status: 404 });
    const alcance = await resolverAlcance(service, sesion);
    if (!puedeVerVenta(alcance, venta as Record<string, unknown>)) {
      return NextResponse.json({ ok: false, error: "Sin permiso para ver esta venta" }, { status: 403 });
    }
    if (!alcance.todo && !alcance.empresaScope) {
      return NextResponse.json({ ok: false, error: "El expediente está habilitado para administración y proveedor" }, { status: 403 });
    }

    const { data: evidenciaRows, error: eEvidencias } = await service.from("vta_instalacion_evidencias")
      .select("tipo,url,estado").eq("solicitud_id", params.id);
    if (eEvidencias) throw new Error(eEvidencias.message);
    const evidencias = new Map(((evidenciaRows ?? []) as { tipo: string; url: string; estado: string }[]).map((e) => [e.tipo, e]));
    if (EVIDENCIAS_ORDEN.some(([tipo]) => !evidencias.get(tipo)?.url || evidencias.get(tipo)?.estado !== "aprobado")) {
      return NextResponse.json({ ok: false, error: "El expediente requiere las siete evidencias aprobadas" }, { status: 409 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) throw new Error("No está configurada la URL de Storage");
    const storageHost = new URL(supabaseUrl).host;
    const { data: cotizacion } = venta.cotizacion_id
      ? await service.from("cotizaciones").select("*").eq("id", String(venta.cotizacion_id)).maybeSingle()
      : { data: null };
    const idCotizacion = String(venta.cotizacion_id ?? "").trim();
    const idsCliente = [...new Set([venta.id_cliente, venta.cliente_id, cotizacion?.id_cliente, cotizacion?.cliente_id].map((id) => String(id ?? "").trim()).filter(Boolean))];
    let cliente: Record<string, unknown> | null = null;
    for (const idCliente of idsCliente) {
      for (const tabla of ["mae_clientes", "clientes"]) {
        try {
          const { data, error } = await service.from(tabla).select("*").eq("id", idCliente).maybeSingle();
          if (!error && data) { cliente = data as Record<string, unknown>; break; }
        } catch { /* prueba el catálogo alternativo */ }
      }
      if (cliente) break;
    }
    // Algunas cotizaciones guardan el documento aunque el registro de cliente
    // provenga del catálogo anterior; úsalo para recuperar la ficha maestra.
    const docCotizacion = String(cotizacion?.nro_doc ?? cotizacion?.dni ?? cotizacion?.documento ?? "").trim();
    if (!cliente && docCotizacion) {
      try {
        const { data } = await service.from("mae_clientes").select("*").eq("nro_doc", docCotizacion).maybeSingle();
        if (data) cliente = data as Record<string, unknown>;
      } catch { /* ficha no disponible por documento */ }
    }
    const { data: proveedor } = await service.from("mae_proveedores").select("*").eq("id", String(venta.id_proveedor ?? venta.proveedor_id ?? cotizacion?.id_proveedor ?? "")).maybeSingle();
    const { data: itemsVenta } = await service.from("vta_venta_items")
      .select("material_nombre,cantidad,subtotal,tipo_pedido,numero_pedido_venta,numero_pedido_abono")
      .eq("solicitud_id", params.id).order("id", { ascending: true });
    const { data: asesor } = venta.id_asesor
      ? await service.from("seg_usuarios").select("nombre").eq("id", String(venta.id_asesor)).maybeSingle()
      : { data: null };
    const clienteNombre = textoSeguro(cliente?.nombre_razon_social ?? cliente?.nombres ?? cliente?.nombre ?? venta.cliente_nombre ?? cotizacion?.cliente_nombre, "Cliente sin nombre");
    const documentoCliente = textoSeguro(cliente?.nro_doc ?? cliente?.dni ?? cliente?.documento ?? venta.cliente_documento ?? cotizacion?.nro_doc ?? cotizacion?.dni, "No registrado");
    const cuentaContrato = textoSeguro(venta.cuenta_contrato ?? venta.cta_contrato ?? cliente?.cuenta_contrato ?? cotizacion?.cuenta_contrato, "No registrada");
    const proveedorNombre = textoSeguro(proveedor?.razon_social ?? proveedor?.nombre_comercial ?? venta.proveedor_nombre ?? cotizacion?.proveedor_nombre);
    const asesorNombre = textoSeguro(asesor?.nombre ?? venta.asesor_nombre);
    const codigoCotizacion = textoSeguro(cotizacion?.codigo ?? cotizacion?.numero ?? venta.cotizacion_codigo ?? idCotizacion);
    const rawFecha = venta.created_at ?? venta.fecha_venta;
    const fechaVenta = rawFecha
      ? new Date(String(rawFecha)).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" })
      : "—";
    const items = (itemsVenta ?? []) as Record<string, unknown>[];
    const sumaItems = items.reduce((suma, item) => suma + Number(item.subtotal ?? 0), 0);
    const montoFinanciado = Number(venta.monto_financiado ?? venta.capital_financiado ?? 0);
    const anticipo = Number(venta.anticipo ?? venta.cuota_inicial ?? 0);
    const totalProductos = sumaItems > 0 ? sumaItems : Number(venta.monto_total ?? venta.total ?? cotizacion?.total ?? montoFinanciado + anticipo);
    const formatoDinero = (monto: number) => `S/ ${monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const numeroCuotas = textoSeguro(venta.nro_cuotas ?? venta.numero_cuotas ?? venta.cuotas ?? venta.cuotas_elegidas ?? cotizacion?.cuotas_elegidas);
    const pv = textoSeguro(venta.numero_pedido, params.id);
    const documento = await PDFDocument.create();
    const font = await documento.embedFont(StandardFonts.Helvetica);
    const bold = await documento.embedFont(StandardFonts.HelveticaBold);
    let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | undefined;
    try { logo = await documento.embedPng(await readFile(join(process.cwd(), "public", "logo-calidda.png"))); } catch { /* el expediente conserva el encabezado de marca en texto */ }

    const page = documento.addPage(A4);
    dibujarEncabezado(page, "Expediente de instalación", pv, font, bold, logo);
    const texto = (p: typeof page, value: string, x: number, y: number, size = 9, isBold = false, maxWidth = 240, color = COLOR.texto) => {
      const f = isBold ? bold : font;
      envolver(value, f, size, maxWidth, 2).forEach((line, index) => p.drawText(line, { x, y: y - index * (size + 3), size, font: f, color }));
    };
    const seccion = (p: typeof page, x: number, y: number, width: number, height: number, titulo: string) => {
      p.drawRectangle({ x, y, width, height, color: COLOR.blanco, borderColor: COLOR.borde, borderWidth: 0.8 });
      p.drawRectangle({ x, y: y + height - 25, width, height: 25, color: COLOR.fondo });
      p.drawText(titulo.toUpperCase(), { x: x + 12, y: y + height - 17, size: 8, font: bold, color: COLOR.azul });
    };
    const etiquetaDato = (p: typeof page, label: string, value: string, x: number, y: number, width: number) => {
      p.drawText(label.toUpperCase(), { x, y, size: 6.5, font: bold, color: COLOR.tenue });
      texto(p, value, x, y - 14, 9, false, width);
    };
    seccion(page, 36, 568, 261.5, 133, "1. Datos del cliente");
    etiquetaDato(page, "Cliente", clienteNombre, 48, 678, 228);
    etiquetaDato(page, "Documento", documentoCliente, 48, 638, 105);
    etiquetaDato(page, "Cuenta contrato", cuentaContrato, 164, 638, 112);
    seccion(page, 297.5, 568, 261.5, 133, "2. Datos de la venta");
    etiquetaDato(page, "Proveedor", proveedorNombre, 316, 678, 230);
    etiquetaDato(page, "Asesor", asesorNombre, 316, 638, 105);
    etiquetaDato(page, "Cotización", codigoCotizacion, 430, 638, 118);
    etiquetaDato(page, "Fecha de venta", fechaVenta, 316, 598, 230);
    seccion(page, 36, 449, 523, 103, "3. Resumen económico");
    etiquetaDato(page, "Total de productos", formatoDinero(totalProductos), 49, 526, 145);
    etiquetaDato(page, "Anticipo", formatoDinero(anticipo), 210, 526, 110);
    etiquetaDato(page, "Monto financiado", formatoDinero(montoFinanciado || Math.max(totalProductos - anticipo, 0)), 337, 526, 125);
    etiquetaDato(page, "Cuotas", numeroCuotas, 475, 526, 68);
    etiquetaDato(page, "Ambiente", textoSeguro(venta.ambiente), 49, 483, 145);
    etiquetaDato(page, "Pedido de abono", textoSeguro(venta.pv_abono ?? venta.numero_pedido_abono), 210, 483, 160);
    const detalles = textoSeguro(venta.detalles_adicionales ?? venta.detalle_adicional ?? venta.observaciones ?? cotizacion?.observaciones, "Sin detalles adicionales");
    seccion(page, 36, 382, 523, 54, "4. Detalles adicionales");
    texto(page, detalles, 48, 403, 8, false, 493);

    let hojaItems = page;
    let yItems = 360;
    const pintarCabeceraItems = (continuacion = false) => {
      hojaItems.drawText(continuacion ? "MATERIALES DE LA VENTA · CONTINUACIÓN" : "5. MATERIALES DE LA VENTA", { x: 36, y: yItems, size: 9, font: bold, color: COLOR.azulNoche });
      yItems -= 20;
      hojaItems.drawRectangle({ x: 36, y: yItems - 5, width: 523, height: 22, color: COLOR.azul });
      hojaItems.drawText("MATERIAL", { x: 44, y: yItems + 2, size: 6.8, font: bold, color: COLOR.blanco });
      hojaItems.drawText("CANT.", { x: 318, y: yItems + 2, size: 6.8, font: bold, color: COLOR.blanco });
      hojaItems.drawText("SUBTOTAL", { x: 358, y: yItems + 2, size: 6.8, font: bold, color: COLOR.blanco });
      hojaItems.drawText("PEDIDO VENTA", { x: 425, y: yItems + 2, size: 6.3, font: bold, color: COLOR.blanco });
      hojaItems.drawText("PEDIDO ABONO", { x: 494, y: yItems + 2, size: 6.3, font: bold, color: COLOR.blanco });
      yItems -= 22;
    };
    pintarCabeceraItems();
    for (const [index, item] of items.entries()) {
      const tipo = String(item.tipo_pedido ?? "VENTA").toUpperCase();
      const nombre = textoSeguro(item.material_nombre ?? item.nombre_material, "Material");
      const renglones = envolver(nombre, font, 7.2, 263, 2);
      const altoFila = Math.max(27, 12 + renglones.length * 9);
      if (yItems - altoFila < 53) {
        hojaItems = documento.addPage(A4);
        dibujarEncabezado(hojaItems, "Materiales de venta · continuación", pv, font, bold, logo);
        yItems = 685;
        pintarCabeceraItems(true);
      }
      hojaItems.drawRectangle({ x: 36, y: yItems - altoFila + 3, width: 523, height: altoFila, color: index % 2 ? COLOR.blanco : COLOR.fila });
      renglones.forEach((line, lineIndex) => hojaItems.drawText(line, { x: 44, y: yItems - 10 - lineIndex * 9, size: 7.2, font, color: COLOR.texto }));
      hojaItems.drawText(String(item.cantidad ?? "—"), { x: 318, y: yItems - 10, size: 7.2, font, color: COLOR.texto });
      hojaItems.drawText(formatoDinero(Number(item.subtotal ?? 0)), { x: 358, y: yItems - 10, size: 7, font, color: COLOR.texto });
      hojaItems.drawText(tipo === "VENTA" ? String(item.numero_pedido_venta ?? venta.numero_pedido ?? "—").slice(0, 15) : "—", { x: 425, y: yItems - 10, size: 6.7, font, color: COLOR.texto });
      hojaItems.drawText(tipo === "ABONO" ? String(item.numero_pedido_abono ?? venta.pv_abono ?? "—").slice(0, 15) : "—", { x: 494, y: yItems - 10, size: 6.7, font, color: COLOR.texto });
      yItems -= altoFila;
    }
    for (const p of [page, ...documento.getPages().slice(1)]) {
      p.drawLine({ start: { x: 36, y: 33 }, end: { x: A4[0] - 36, y: 33 }, thickness: 0.6, color: COLOR.borde });
      p.drawText(`CÁLIDDA  ·  PLATAFORMA AMCA                                      Expediente PV ${pv}`, { x: 36, y: 21, size: 6.5, font, color: COLOR.tenue });
    }

    for (const [indice, [tipo, etiqueta]] of EVIDENCIAS_ORDEN.entries()) {
      const item = evidencias.get(tipo)!;
      const url = new URL(item.url);
      if (url.protocol !== "https:" || url.host !== storageHost) throw new Error(`El archivo de ${etiqueta} no pertenece al Storage configurado`);
      const respuesta = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!respuesta.ok) throw new Error(`No se pudo leer el archivo: ${etiqueta}`);
      const bytes = Buffer.from(await respuesta.arrayBuffer());
      if (bytes.length > 12 * 1024 * 1024) throw new Error(`El archivo ${etiqueta} supera el tamaño permitido para el expediente`);
      const contentType = respuesta.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("application/pdf") || url.pathname.toLowerCase().endsWith(".pdf")) {
        const fuente = await PDFDocument.load(bytes);
        const paginas = await documento.copyPages(fuente, fuente.getPageIndices());
        const portadaArchivo = documento.addPage(A4);
        dibujarEncabezado(portadaArchivo, `Anexo ${indice + 1} · ${etiqueta}`, pv, font, bold, logo);
        portadaArchivo.drawText("Documento adjunto aprobado para el expediente", { x: 42, y: A4[1] - 101, size: 9, font, color: COLOR.tenue });
        paginas.forEach((p) => documento.addPage(p));
      } else {
        const png = await sharp(bytes).rotate().png().toBuffer();
        const imagen = await documento.embedPng(png);
        const fotoPage = documento.addPage(A4);
        dibujarEncabezado(fotoPage, `Anexo ${indice + 1} · ${etiqueta}`, pv, font, bold, logo);
        const margen = 42;
        const ancho = A4[0] - margen * 2;
        const alto = A4[1] - 160;
        const escala = Math.min(ancho / imagen.width, alto / imagen.height);
        fotoPage.drawImage(imagen, { x: (A4[0] - imagen.width * escala) / 2, y: 56 + (alto - imagen.height * escala) / 2, width: imagen.width * escala, height: imagen.height * escala });
      }
    }

    const archivo = Buffer.from(await documento.save());
    const nombrePv = String(venta.numero_pedido ?? params.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    return new Response(archivo, { status: 200, headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="expediente-${nombrePv}.pdf"`,
      "Content-Length": String(archivo.length),
      "Cache-Control": "no-store",
    } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo generar el expediente" }, { status: 500 });
  }
}
