import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServer, createSupabaseServiceRole } from "@/lib/supabaseServer";
import { marcarSesionCerrada } from "@/lib/sesiones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/logout: cierra la sesión de este equipo y la marca como cerrada. */
export async function POST(req: NextRequest) {
  const sesionId = cookies().get("calidda_sesion")?.value;

  if (sesionId) {
    try {
      await marcarSesionCerrada(createSupabaseServiceRole(), sesionId, "manual");
    } catch {
      /* best-effort */
    }
  }

  try {
    const supabase = createSupabaseServer();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* las cookies se limpian igualmente */
  }

  const res = NextResponse.json({ ok: true });
  for (const c of req.cookies.getAll()) {
    if (c.name === "calidda_sesion" || /^sb-.*-auth-token/.test(c.name)) {
      res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }
  return res;
}
