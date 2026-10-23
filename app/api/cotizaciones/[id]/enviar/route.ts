import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";
import { obtenerDatosPdf, buildCotizacionPdf } from "@/lib/cotizacionPdf";
import { extraerDetalles } from "@/lib/detallesMueble";
import { resolverAlcance, puedeVerCotizacion } from "@/lib/alcance";
import { correoConfigurado, enviarCorreo, MSG_CORREO_NO_CONFIGURADO } from "@/lib/mailer";
import { interpolarPlantilla, obtenerConfigCorreoCotizacion } from "@/lib/correoCotizacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EsquemaBody = z.object({
  para: z.string().trim().email().max(160)
});

/**
 * POST /api/cotizaciones/[id]/enviar { para }
 * SOLO SERVER: genera el PDF con service_role y lo envía por SendGrid o Resend
 * (HTTPS) con el PDF adjunto. Si no hay API key, usa SMTP como respaldo.
 * Asunto: "Cotización COT-... Ambientes Cáliddos".
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sesion = await getSession();
  if (!sesion) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });

  const id = params?.id;
  if (!id) return NextResponse.json({ ok: false, error: "Falta id" }, { status: 400 });

  let body: z.infer<typeof EsquemaBody>;
  try {
    body = EsquemaBody.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido: { para: email }" }, { status: 400 });
  }

  if (!correoConfigurado()) {
    return NextResponse.json({ ok: false, error: MSG_CORREO_NO_CONFIGURADO }, { status: 500 });
  }

  try {
    const service = createSupabaseServiceRole();
    const { data: cot } = await service.from("cotizaciones").select("id,created_by,asesor,proveedor").eq("id", id).maybeSingle();
    if (!cot) return NextResponse.json({ ok: false, error: "Cotización no encontrada" }, { status: 404 });
    const alcance = await resolverAlcance(service, sesion);
    if (!puedeVerCotizacion(alcance, cot as Record<string, any>)) {
      return NextResponse.json({ ok: false, error: "Sin permiso sobre esta cotización" }, { status: 403 });
    }
    const datos = await obtenerDatosPdf(service, id);
    const doc = await buildCotizacionPdf(datos);
    const pdf = Buffer.from(doc.output("arraybuffer"));
    const filename = `cotizacion-${datos.codigo}.pdf`;

    const { config } = await obtenerConfigCorreoCotizacion(service);
    const fmt = (n: number) =>
      Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const detalles = datos.detalles.length > 0
      ? `Detalles del mueble:\n${datos.detalles.map((t) => `- ${t.etiqueta}: ${t.valor}`).join("\n")}`
      : "";
    const vars = {
      cliente: datos.clienteNombre ?? "",
      codigo: datos.codigo,
      total: fmt(datos.total),
      adelanto: fmt(datos.cuotaInicial),
      cuota_inicial: fmt(datos.cuotaInicial),
      capital: fmt(datos.capital),
      valor_financiar: fmt(datos.capital),
      tea: (datos.tea * 100).toFixed(2),
      plazo: datos.plazo,
      cuota: fmt(datos.cuotaMensual),
      cuota_mensual: fmt(datos.cuotaMensual),
      detalles,
      observaciones: extraerDetalles(datos.observaciones).resto
    };
    const asunto = interpolarPlantilla(config.asunto, vars).trim();
    const mensaje = interpolarPlantilla(config.mensaje, vars).trim();

    const info = await enviarCorreo({
      to: body.para,
      subject: asunto,
      text: mensaje,
      attachments: [{ filename, content: pdf, contentType: "application/pdf" }]
    });

    await service.from("audit_log").insert({
      user_id: sesion.userId,
      operacion: "enviarCotizacionPDF",
      modulo: "SGT",
      argumentos: { cotizacion_id: id, para: body.para, messageId: info.messageId, proveedor: info.proveedor }
    }).then(() => undefined, () => undefined);

    return NextResponse.json({
      ok: true,
      datos: { messageId: info.messageId, accepted: info.accepted, filename, proveedor: info.proveedor }
    });
  } catch (e) {
    const msg = (e as Error).message || "Error enviando correo";
    const status = /no encontrada/i.test(msg) ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
