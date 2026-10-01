import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseServiceRole } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mi-perfil → { rol, estado } del usuario logueado.
 * Busca en profiles JOIN roles (base) y si no, en seg_usuarios (SGT360).
 * Solo server (service_role), nunca expone keys.
 */
export async function GET() {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }
  const service = createSupabaseServiceRole();
  const uid = data.user.id;
  const email = (data.user.email ?? "").toLowerCase();

  // 1) profiles + roles (schema base).
  try {
    const { data: p } = await service
      .from("profiles")
      .select("activo, roles!inner(nombre)")
      .eq("id", uid)
      .maybeSingle();
    if (p) {
      const r = p as { activo?: boolean; roles?: { nombre?: string } | { nombre?: string }[] };
      const nombre = Array.isArray(r.roles) ? r.roles[0]?.nombre : r.roles?.nombre;
      if (nombre) {
        return NextResponse.json({
          ok: true,
          rol: String(nombre).toUpperCase(),
          estado: r.activo === false ? "Inactivo" : "Activa",
        });
      }
    }
  } catch { /* sigue a SGT */ }

  // 2) seg_usuarios por correo (SGT360).
  try {
    const { data: s } = await service
      .from("seg_usuarios")
      .select("rol_codigo, estado")
      .eq("correo", email)
      .maybeSingle();
    if (s) {
      const u = s as { rol_codigo?: string; estado?: string };
      return NextResponse.json({
        ok: true,
        rol: String(u.rol_codigo ?? "—").toUpperCase(),
        estado: String(u.estado ?? "").toUpperCase() === "ACTIVO" ? "Activa" : "Inactivo",
      });
    }
  } catch { /* sin SGT */ }

  return NextResponse.json({ ok: true, rol: "—", estado: "Activa" });
}
