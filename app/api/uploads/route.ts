import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MB = 8;
const CARPETAS: Record<string, string> = {
  adjuntos: "adjuntos-ventas",
  comprobantes: "comprobantes",
  sustentos: "sustentos",
};

/**
 * POST /api/uploads (multipart: file + carpeta=adjuntos|comprobantes|sustentos)
 * Sube PDF/foto a Supabase Storage y devuelve la URL pública corta.
 * Requiere sesión (cualquier rol operativo).
 */
export async function POST(req: Request) {
  const sesion = await getSession();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Body debe ser multipart con file" }, { status: 400 });
  }

  const file = form.get("file");
  const carpeta = String(form.get("carpeta") ?? "adjuntos");
  const bucket = CARPETAS[carpeta];
  if (!bucket) {
    return NextResponse.json({ ok: false, error: "carpeta inválida (adjuntos|comprobantes|sustentos)" }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "Falta el archivo (file)" }, { status: 400 });
  }

  const nombre = (form.get("nombre") as string) || (file as File).name || "archivo";
  const tipo = (file as File).type || "";
  const esPdf = tipo.includes("pdf") || /\.pdf$/i.test(nombre);
  const esImg = tipo.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(nombre);
  if (!esPdf && !esImg) {
    return NextResponse.json({ ok: false, error: "Solo se aceptan PDF o fotos (PNG/JPG/WEBP)" }, { status: 400 });
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: `Archivo muy pesado (máx ${MAX_MB} MB)` }, { status: 400 });
  }

  const ext = nombre.includes(".") ? nombre.slice(nombre.lastIndexOf(".")) : (esPdf ? ".pdf" : ".jpg");
  const ruta = `${sesion.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

  const service = createSupabaseServiceRole();
  const { error } = await service.storage.from(bucket).upload(ruta, file, {
    contentType: tipo || (esPdf ? "application/pdf" : "image/jpeg"),
    upsert: false,
  });
  if (error) {
    const faltaBucket = /bucket|Bucket|not found/i.test(error.message);
    return NextResponse.json(
      { ok: false, error: faltaBucket ? "Buckets no creados: ejecute supabase/migracion_storage_01.sql" : error.message },
      { status: 500 }
    );
  }

  const { data } = service.storage.from(bucket).getPublicUrl(ruta);
  return NextResponse.json({ ok: true, url: data.publicUrl, ruta, bucket });
}
