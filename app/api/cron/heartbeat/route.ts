import { NextResponse } from "next/server";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INACTIVIDAD_MIN = 30;

/**
 * Mirror de Paso13D1 (heartbeat / limpieza de sesiones):
 *   GET /api/cron/heartbeat
 *
 *   1. Desactiva en sesiones_app las sesiones con ultima_actividad > 30 min.
 *   2. Retorna conteo de desactivadas y activas restantes.
 *
 * Seguridad: si existe CRON_SECRET, exige `Authorization: Bearer <secret>`.
 * Vercel Cron lo llama cada 5 min (ver vercel.json).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }
  }

  const service = createSupabaseServiceRole();
  const limite = new Date(Date.now() - INACTIVIDAD_MIN * 60_000).toISOString();

  // Desactivar inactivas
  const { data: desactivadas, error: e1 } = await service
    .from("sesiones_app")
    .update({ activa: false })
    .eq("activa", true)
    .lt("ultima_actividad", limite)
    .select("id");

  if (e1) {
    return NextResponse.json({ ok: false, error: e1.message }, { status: 500 });
  }

  const { count: activas, error: e2 } = await service
    .from("sesiones_app")
    .select("id", { count: "exact", head: true })
    .eq("activa", true);

  if (e2) {
    return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    desactivadas: desactivadas?.length ?? 0,
    activas: activas ?? 0,
    limite_inactividad: `${INACTIVIDAD_MIN}min`,
    timestamp: new Date().toISOString()
  });
}
