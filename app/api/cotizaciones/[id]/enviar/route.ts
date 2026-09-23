import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";
import { obtenerDatosPdf, buildCotizacionPdf } from "@/lib/cotizacionPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EsquemaBody = z.object({
  para: z.string().trim().email().max(160)
});

/**
 * POST /api/cotizaciones/[id]/enviar { para }
 * SOLO SERVER: genera el PDF con service_role y lo envía por SMTP
 * (nodemailer) con el PDF adjunto.
 * Asunto: "Cotización COT-... Soluciones Hogar".
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

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return NextResponse.json({ ok: false, error: "SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASS)" }, { status: 500 });
  }

  try {
    const service = createSupabaseServiceRole();
    const datos = await obtenerDatosPdf(service, id);
    const doc = buildCotizacionPdf(datos);
    const pdf = Buffer.from(doc.output("arraybuffer"));
    const filename = `cotizacion-${datos.codigo}.pdf`;

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT || 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    const info = await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: body.para,
      subject: `Cotización ${datos.codigo} Soluciones Hogar`,
      text: `Estimado(a) ${datos.clienteNombre ?? ""}:\n\nAdjuntamos su cotización ${datos.codigo} de Soluciones Hogar Cálidda por un total de S/ ${datos.total.toFixed(2)}.\n\nFinanciamiento: cuota inicial S/ ${datos.cuotaInicial.toFixed(2)}, capital S/ ${datos.capital.toFixed(2)}, TEA ${(datos.tea * 100).toFixed(2)}%, ${datos.plazo} cuotas de S/ ${datos.cuotaMensual.toFixed(2)}.\n\n${datos.observaciones ?? ""}\n\nDocumento generado por Soluciones Hogar Cálidda.`,
      attachments: [{ filename, content: pdf, contentType: "application/pdf" }]
    });

    await service.from("audit_log").insert({
      user_id: sesion.userId,
      operacion: "enviarCotizacionPDF",
      modulo: "SGT",
      argumentos: { cotizacion_id: id, para: body.para, messageId: info.messageId }
    }).then(() => undefined, () => undefined);

    return NextResponse.json({ ok: true, datos: { messageId: info.messageId, accepted: info.accepted, filename } });
  } catch (e) {
    const msg = (e as Error).message || "Error enviando correo";
    const status = /no encontrada/i.test(msg) ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
