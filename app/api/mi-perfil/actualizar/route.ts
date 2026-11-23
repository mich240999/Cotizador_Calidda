import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseServer, createSupabaseServiceRole } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Telefono = z.string().trim().max(30).refine(
  (v) => !v || (/^[+()\d\s.-]+$/.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15),
  "Ingresa un teléfono válido (entre 7 y 15 dígitos)."
);

const ClaveSegura = z.string()
  .min(10, "La contraseña debe tener al menos 10 caracteres.")
  .max(128, "La contraseña no puede superar 128 caracteres.")
  .regex(/\p{Lu}/u, "La contraseña debe incluir al menos una letra mayúscula.")
  .regex(/[\p{P}\p{S}]/u, "La contraseña debe incluir al menos un símbolo.");

const DatosSchema = z.object({
  tipo: z.literal("datos"),
  contrasenaActual: z.string().min(1).max(128),
  email: z.string().trim().email().max(160),
  telefono: Telefono,
});

const ClaveSchema = z.object({
  tipo: z.literal("contrasena"),
  contrasenaActual: z.string().min(1).max(128),
  nuevaContrasena: ClaveSegura,
  repetirContrasena: z.string().min(1).max(128),
}).refine((v) => v.nuevaContrasena === v.repetirContrasena, {
  path: ["repetirContrasena"],
  message: "Las contraseñas nuevas no coinciden.",
});

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  // El navegador establece este encabezado usando la URL pública, incluso
  // cuando el proxy entrega a Next una URL interna con otro esquema o host.
  const mismoOrigen = fetchSite === "same-origin"
    || (!fetchSite && origin === new URL(req.url).origin);
  if (!mismoOrigen) {
    return NextResponse.json({ ok: false, error: "Origen no permitido." }, { status: 403 });
  }

  let body: z.infer<typeof DatosSchema> | z.infer<typeof ClaveSchema>;
  try {
    const raw = await req.json();
    const parsed = raw?.tipo === "datos" ? DatosSchema.safeParse(raw) : ClaveSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }

  const userClient = createSupabaseServer();
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user?.email) {
    return NextResponse.json({ ok: false, error: "La sesión expiró. Vuelve a iniciar sesión." }, { status: 401 });
  }

  // Comprueba la contraseña actual sin cambiar ni reemplazar la sesión del navegador.
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
    email: auth.user.email,
    password: body.contrasenaActual,
  });
  if (verifyError || verified.user?.id !== auth.user.id) {
    return NextResponse.json({ ok: false, error: "La contraseña actual es incorrecta." }, { status: 403 });
  }

  const service = createSupabaseServiceRole();
  if (body.tipo === "contrasena") {
    const { error } = await service.auth.admin.updateUserById(auth.user.id, {
      password: body.nuevaContrasena,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: "No se pudo actualizar la contraseña. Inténtalo nuevamente." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, mensaje: "Contraseña actualizada." });
  }

  const emailActual = auth.user.email.toLowerCase();
  const emailNuevo = body.email.toLowerCase();
  let emailEfectivo = emailActual;
  let emailConfirmationRequired = false;
  if (emailNuevo !== emailActual) {
    const { data: cambioEmail, error } = await userClient.auth.updateUser({ email: emailNuevo });
    if (error) {
      return NextResponse.json({ ok: false, error: "No se pudo solicitar el cambio de correo. Verifica que no esté en uso." }, { status: 400 });
    }
    emailEfectivo = String(cambioEmail.user?.email ?? emailActual).toLowerCase();
    emailConfirmationRequired = emailEfectivo !== emailNuevo;
    if (!emailConfirmationRequired) {
      await service.from("profiles").update({ email: emailNuevo }).eq("id", auth.user.id);
      await service.from("seg_usuarios").update({ correo: emailNuevo }).eq("correo", emailActual);
    }
  }

  const metadata = { ...(auth.user.user_metadata ?? {}), telefono: body.telefono };
  const { error: eMeta } = await service.auth.admin.updateUserById(auth.user.id, { user_metadata: metadata });
  if (eMeta) {
    return NextResponse.json({ ok: false, error: "No se pudo guardar el teléfono." }, { status: 500 });
  }
  await service.from("seg_usuarios").update({ telefono: body.telefono || null }).eq("correo", emailActual);

  return NextResponse.json({
    ok: true,
    emailConfirmationRequired,
    email: emailEfectivo,
    telefono: body.telefono,
  });
}
