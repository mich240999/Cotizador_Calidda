import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseServiceRole } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MB = 8;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const CARPETAS: Record<string, string> = {
  adjuntos: "adjuntos-ventas",
  comprobantes: "comprobantes",
  sustentos: "sustentos",
};

const TIPOS: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Extensión y content-type salen de una allowlist, nunca del nombre/MIME libre. */
function archivoPermitido(tipo: string, nombre: string): { ext: string; contentType: string } | null {
  const t = tipo.toLowerCase();
  if (t.includes("pdf")) return { ext: ".pdf", contentType: TIPOS[".pdf"] };
  if (t === "image/png") return { ext: ".png", contentType: TIPOS[".png"] };
  if (t === "image/jpeg" || t === "image/jpg") return { ext: ".jpg", contentType: TIPOS[".jpg"] };
  if (t === "image/webp") return { ext: ".webp", contentType: TIPOS[".webp"] };
  if (t === "image/gif") return { ext: ".gif", contentType: TIPOS[".gif"] };
  const m = nombre.toLowerCase().match(/\.(pdf|png|jpe?g|webp|gif)$/);
  if (!m) return null;
  const ext = m[1] === "jpeg" ? ".jpg" : `.${m[1]}`;
  return { ext, contentType: TIPOS[ext] };
}

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

  // Corta antes de bufferizar el body (multipart en memoria).
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declarado) && declarado > MAX_BYTES + 1024 * 1024) {
    return NextResponse.json({ ok: false, error: `Archivo muy pesado (máx ${MAX_MB} MB)` }, { status: 413 });
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

  const nombreRaw = form.get("nombre");
  const nombre = (typeof nombreRaw === "string" && nombreRaw) || (file as File).name || "archivo";
  const tipo = (file as File).type || "";
  const permitido = archivoPermitido(tipo, nombre);
  if (!permitido) {
    return NextResponse.json({ ok: false, error: "Solo se aceptan PDF o fotos (PNG/JPG/WEBP)" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `Archivo muy pesado (máx ${MAX_MB} MB)` }, { status: 400 });
  }

  const { ext, contentType } = permitido;
  const ruta = `${sesion.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

  const service = createSupabaseServiceRole();
  const { error } = await service.storage.from(bucket).upload(ruta, file, {
    contentType,
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
