import { NextResponse } from "next/server";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";
import { procesarCorte } from "@/lib/operacionesVentas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cortes?tipo=ventas|instalaciones|todos
 * Lo llama pg_cron cada 15 min (ver supabase/cortes_pg_cron.sql).
 * Envía solo en las horas configuradas en Administración > Cortes.
 * Header: Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET ?? "";
  if (!secreto) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const tipo = new URL(req.url).searchParams.get("tipo") ?? "todos";
  const claves = tipo === "ventas"
    ? ["ventas_pv"] as const
    : tipo === "instalaciones"
      ? ["instalaciones_liq"] as const
      : ["ventas_pv", "instalaciones_liq"] as const;
  try {
    const service = createSupabaseServiceRole() as unknown as { from(t: string): unknown };
    const resultados = [];
    for (const clave of claves) {
      try {
        resultados.push(await procesarCorte(service as never, clave, false));
      } catch (e) {
        resultados.push({ clave, enviado: false, motivo: (e as Error).message });
      }
    }
    return NextResponse.json({ ok: true, datos: resultados });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
