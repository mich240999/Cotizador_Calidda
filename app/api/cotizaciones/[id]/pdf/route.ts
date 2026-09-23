import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";
import { obtenerDatosPdf, buildCotizacionPdf } from "@/lib/cotizacionPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cotizaciones/[id]/pdf → application/pdf (2 páginas estilo captura).
 * SOLO SERVER: sesión + service_role. No importa nada de cliente.
 * Pág.1: header Cálidda + COTIZACIÓN COT-AMCA-xxxxx, CLIENTE Y CONTACTO
 * COMERCIAL, MATERIALES Y SERVICIOS (ITEM/MATERIAL/CANT/P.UNITARIO/DSCTO/NETO
 * + Subtotal/Descuento/Total). Pág.2: FINANCIAMIENTO + tabla 3-60 con elegida
 * resaltada, CONSIDERACIONES (7) + banda NO ES UN CONTRATO, footer.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sesion = await getSession();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }
  const id = params?.id;
  if (!id) return NextResponse.json({ ok: false, error: "Falta id" }, { status: 400 });

  try {
    const service = createSupabaseServiceRole();
    const datos = await obtenerDatosPdf(service, id);
    const doc = buildCotizacionPdf(datos);
    const buf = Buffer.from(doc.output("arraybuffer"));
    const filename = `cotizacion-${datos.codigo}.pdf`;

    await service.from("sesiones_app")
      .update({ ultima_actividad: new Date().toISOString() })
      .eq("user_id", sesion.userId).eq("activa", true)
      .then(() => undefined, () => undefined);

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    const msg = (e as Error).message || "Error generando PDF";
    const status = /no encontrada/i.test(msg) ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
