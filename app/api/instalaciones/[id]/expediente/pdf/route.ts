import { NextResponse } from "next/server";
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

function dibujarEtiqueta(page: ReturnType<PDFDocument["addPage"]>, texto: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>) {
  page.drawText(texto, { x: 42, y: A4[1] - 38, size: 13, font, color: rgb(0.02, 0.34, 0.55) });
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
    const documento = await PDFDocument.create();
    const font = await documento.embedFont(StandardFonts.Helvetica);
    const bold = await documento.embedFont(StandardFonts.HelveticaBold);
    const page = documento.addPage(A4);
    page.drawText("EXPEDIENTE DE INSTALACIÓN", { x: 42, y: 785, size: 19, font: bold, color: rgb(0.02, 0.34, 0.55) });
    page.drawText(`Pedido de venta: ${String(venta.numero_pedido ?? "—")}`, { x: 42, y: 750, size: 13, font: bold });

    const { data: cliente } = await service.from("mae_clientes").select("nombre_razon_social,nombres,nro_doc,cuenta_contrato").eq("id", String(venta.id_cliente ?? "")).maybeSingle();
    const { data: proveedor } = await service.from("mae_proveedores").select("razon_social,nombre_comercial").eq("id", String(venta.id_proveedor ?? "")).maybeSingle();
    const { data: cotizacion } = venta.cotizacion_id
      ? await service.from("cotizaciones").select("codigo").eq("id", String(venta.cotizacion_id)).maybeSingle()
      : { data: null };
    const { data: itemsVenta } = await service.from("vta_venta_items")
      .select("material_nombre,cantidad,subtotal,tipo_pedido,numero_pedido_venta,numero_pedido_abono")
      .eq("solicitud_id", params.id).order("id", { ascending: true });
    const { data: asesor } = venta.id_asesor
      ? await service.from("seg_usuarios").select("nombre").eq("id", String(venta.id_asesor)).maybeSingle()
      : { data: null };
    const clienteNombre = String(cliente?.nombre_razon_social ?? cliente?.nombres ?? venta.cliente_nombre ?? "—");
    const lineas = [
      `Cliente: ${clienteNombre}`,
      `Documento: ${String(cliente?.nro_doc ?? "—")}  |  Cuenta contrato: ${String(venta.cuenta_contrato ?? cliente?.cuenta_contrato ?? "—")}`,
      `Proveedor: ${String(proveedor?.razon_social ?? proveedor?.nombre_comercial ?? venta.proveedor_nombre ?? "—")}`,
      `Asesor: ${String(asesor?.nombre ?? venta.asesor_nombre ?? "—")}`,
      `Cotización: ${String(cotizacion?.codigo ?? venta.cotizacion_id ?? "—")}  |  Fecha: ${String(venta.created_at ?? "—")}`,
      `Ambiente: ${String(venta.ambiente ?? "—")}`,
      `Total productos: S/ ${Number(venta.monto_total ?? venta.total ?? 0).toFixed(2)}  |  Anticipo: S/ ${Number(venta.anticipo ?? 0).toFixed(2)}`,
      `Financiado: S/ ${Number(venta.monto_financiado ?? 0).toFixed(2)}  |  Cuotas: ${String(venta.nro_cuotas ?? "—")}`,
      `Pedido de abono: ${Number(venta.anticipo ?? 0) > 0 ? String(venta.pv_abono ?? "—") : "No corresponde"}`,
      `Detalles adicionales: ${String(venta.observaciones ?? "—").replace(/\s+/g, " ").slice(0, 150)}`,
    ];
    lineas.forEach((texto, i) => page.drawText(texto, { x: 42, y: 710 - i * 23, size: 10, font, maxWidth: 510 }));

    let hojaItems = page;
    let yItems = 468;
    const pintarCabeceraItems = () => {
      hojaItems.drawText("MATERIALES DE LA VENTA", { x: 42, y: yItems, size: 10, font: bold });
      yItems -= 18;
      hojaItems.drawText("MATERIAL", { x: 42, y: yItems, size: 7, font: bold });
      hojaItems.drawText("CANT.", { x: 300, y: yItems, size: 7, font: bold });
      hojaItems.drawText("SUBTOTAL", { x: 340, y: yItems, size: 7, font: bold });
      hojaItems.drawText("PV", { x: 414, y: yItems, size: 7, font: bold });
      hojaItems.drawText("PV ABONO", { x: 477, y: yItems, size: 7, font: bold });
      yItems -= 15;
    };
    pintarCabeceraItems();
    for (const item of (itemsVenta ?? []) as Record<string, unknown>[]) {
      if (yItems < 45) {
        hojaItems = documento.addPage(A4);
        yItems = A4[1] - 42;
        pintarCabeceraItems();
      }
      const tipo = String(item.tipo_pedido ?? "VENTA").toUpperCase();
      hojaItems.drawText(String(item.material_nombre ?? "Material").slice(0, 48), { x: 42, y: yItems, size: 7, font, maxWidth: 250 });
      hojaItems.drawText(String(item.cantidad ?? "—"), { x: 300, y: yItems, size: 7, font });
      hojaItems.drawText(`S/ ${Number(item.subtotal ?? 0).toFixed(2)}`, { x: 340, y: yItems, size: 7, font });
      hojaItems.drawText(tipo === "VENTA" ? String(item.numero_pedido_venta ?? venta.numero_pedido ?? "—").slice(0, 12) : "—", { x: 414, y: yItems, size: 7, font });
      hojaItems.drawText(tipo === "ABONO" ? String(item.numero_pedido_abono ?? venta.pv_abono ?? "—").slice(0, 12) : "—", { x: 477, y: yItems, size: 7, font });
      yItems -= 13;
    }

    for (const [tipo, etiqueta] of EVIDENCIAS_ORDEN) {
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
        dibujarEtiqueta(portadaArchivo, etiqueta, bold);
        portadaArchivo.drawText("Documento adjunto", { x: 42, y: A4[1] - 63, size: 9, font, color: rgb(0.35, 0.4, 0.48) });
        paginas.forEach((p) => documento.addPage(p));
      } else {
        const png = await sharp(bytes).rotate().png().toBuffer();
        const imagen = await documento.embedPng(png);
        const fotoPage = documento.addPage(A4);
        dibujarEtiqueta(fotoPage, etiqueta, bold);
        const margen = 42;
        const ancho = A4[0] - margen * 2;
        const alto = A4[1] - 90;
        const escala = Math.min(ancho / imagen.width, alto / imagen.height);
        fotoPage.drawImage(imagen, { x: (A4[0] - imagen.width * escala) / 2, y: (A4[1] - 40 - imagen.height * escala) / 2, width: imagen.width * escala, height: imagen.height * escala });
      }
    }

    const archivo = Buffer.from(await documento.save());
    const pv = String(venta.numero_pedido ?? params.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    return new Response(archivo, { status: 200, headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="expediente-${pv}.pdf"`,
      "Content-Length": String(archivo.length),
      "Cache-Control": "no-store",
    } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo generar el expediente" }, { status: 500 });
  }
}
