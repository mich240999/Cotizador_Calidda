import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";
import { finSesion, leerConfigSesiones, type SesionApp } from "@/lib/sesiones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/sesion/heartbeat: renueva ultima_actividad de la sesión de este equipo. */
export async function POST() {
  const sesion = await getSession();
  if (!sesion) {
    return NextResponse.json(
      { ok: false, codigo: "SESION_CERRADA", error: "La sesión ya no está activa." },
      { status: 401 }
    );
  }

  const sesionId = cookies().get("calidda_sesion")?.value;
  if (!sesionId) {
    return NextResponse.json({ ok: true, legado: true, expiraEn: null });
  }

  const service = createSupabaseServiceRole();
  const ahora = new Date().toISOString();
  let { data, error } = await service
    .from("sesiones_app")
    .update({ ultima_actividad: ahora })
    .eq("id", sesionId)
    .eq("user_id", sesion.userId)
    .eq("activa", true)
    .select("expira_en")
    .maybeSingle();

  if (error && /column|schema cache|42703|PGRST204/i.test(error.message)) {
    ({ data, error } = await service
      .from("sesiones_app")
      .update({ ultima_actividad: ahora })
      .eq("id", sesionId)
      .eq("user_id", sesion.userId)
      .eq("activa", true)
      .select("id,created_at,ultima_actividad")
      .maybeSingle());
  }

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, codigo: "SESION_CERRADA", error: "La sesión fue cerrada." },
      { status: 401 }
    );
  }

  let expiraEn = (data as { expira_en?: string | null }).expira_en ?? null;
  if (!expiraEn) {
    const { config } = await leerConfigSesiones(service);
    expiraEn = finSesion(data as unknown as SesionApp, config).toISOString();
  }
  return NextResponse.json({ ok: true, expiraEn, ultimaActividad: ahora });
}
