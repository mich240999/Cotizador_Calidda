import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseServiceRole } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mi-perfil → { nombre, rol, estado } del usuario logueado.
 * Los usuarios SGT usan su ficha real para nombre y rol; el resto usa profiles/Auth.
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
  const metadata = data.user.user_metadata ?? {};
  const nombreAuth = String(metadata.nombre ?? metadata.full_name ?? metadata.name ?? "").trim();
  let nombrePerfil = "";
  let rolPerfil = "";
  let perfilActivo = true;

  // 1) profiles + roles (schema base).
  try {
    const { data: p } = await service
      .from("profiles")
      .select("nombre,activo,roles(nombre)")
      .eq("id", uid)
      .maybeSingle();
    if (p) {
      const r = p as { nombre?: string; activo?: boolean; roles?: { nombre?: string } | { nombre?: string }[] };
      const nombre = Array.isArray(r.roles) ? r.roles[0]?.nombre : r.roles?.nombre;
      nombrePerfil = String(r.nombre ?? "").trim();
      rolPerfil = String(nombre ?? "").trim().toUpperCase();
      perfilActivo = r.activo !== false;
    }
  } catch { /* sigue a SGT */ }

  // 2) seg_usuarios por correo (SGT360), que tiene el nombre/rol operativo.
  try {
    const { data: s } = await service
      .from("seg_usuarios")
      .select("nombre,rol_codigo,estado")
      .eq("correo", email)
      .maybeSingle();
    if (s) {
      const u = s as { nombre?: string; rol_codigo?: string; estado?: string };
      const estadoSgt = String(u.estado ?? "").toUpperCase() === "ACTIVO";
      const rolSgt = String(u.rol_codigo ?? "").toUpperCase();
      const rolPrincipal = rolPerfil === "ADMIN" || rolSgt === "ADMIN"
        ? "ADMIN"
        : ["PROVEEDOR", "SUPERVISOR"].includes(rolSgt) ? rolSgt : rolPerfil || rolSgt || "—";
      return NextResponse.json({
        ok: true,
        nombre: nombrePerfil || String(u.nombre ?? "").trim() || nombreAuth || email.split("@")[0] || "Usuario",
        rol: rolPrincipal,
        estado: perfilActivo && estadoSgt ? "Activa" : "Inactivo",
      }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch { /* sin SGT */ }

  return NextResponse.json({
    ok: true,
    nombre: nombrePerfil || nombreAuth || email.split("@")[0] || "Usuario",
    rol: rolPerfil || "—",
    estado: perfilActivo ? "Activa" : "Inactivo",
  }, { headers: { "Cache-Control": "no-store" } });
}
