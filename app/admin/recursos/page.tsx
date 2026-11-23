"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion } from "@/components/Tablas";
import { aplicarTema, leerTema, THEMES, type ThemeName } from "@/lib/theme";

type Recurso = {
  clave: string;
  url: string;
  version?: number | null;
};

type DefRecurso = {
  clave: string;
  titulo: string;
  detalle: string;
};

const DEFINICIONES: DefRecurso[] = [
  { clave: "logo_header", titulo: "Logo del encabezado", detalle: "Se muestra en la cabecera de la aplicación." },
  { clave: "login_image", titulo: "Imagen de inicio de sesión", detalle: "Ilustración de la pantalla de acceso." },
  { clave: "pdf_image", titulo: "Imagen del PDF", detalle: "Cabecera de las cotizaciones exportadas en PDF." },
  { clave: "favicon", titulo: "Ícono / favicon", detalle: "Ícono de la pestaña del navegador." },
];

const TIPOS_OK = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

export default function RecursosPage() {
  const [rows, setRows] = useState<Recurso[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<Record<string, boolean>>({});
  const [subiendo, setSubiendo] = useState<Record<string, boolean>>({});
  const [tema, setTema] = useState<ThemeName>("light");

  const cargar = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const datos = await apiOperacion<Recurso[]>("listarRecursosVisuales", {});
      const lista = Array.isArray(datos) ? datos : [];
      setRows(lista);
      setUrls((prev) => {
        const next: Record<string, string> = { ...prev };
        for (const r of lista) {
          if (!(r.clave in next)) next[r.clave] = r.url ?? "";
        }
        for (const d of DEFINICIONES) {
          if (!(d.clave in next)) next[d.clave] = "";
        }
        return next;
      });
      if (lista.length === 0) setInfo("Sin recursos visuales registrados en el backend.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los recursos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTema(leerTema());
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const porClave = (clave: string): Recurso | undefined =>
    rows.find((r) => r.clave === clave);

  const subirArchivo = async (clave: string, file: File | undefined) => {
    if (!file) return;
    setError(null);
    setInfo(null);
    if (!TIPOS_OK.includes(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      setError(`Archivo no válido en "${clave}": solo PNG/JPG/WEBP.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Archivo muy pesado en "${clave}" (máx 8 MB).`);
      return;
    }
    setSubiendo((p) => ({ ...p, [clave]: true }));
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("carpeta", "adjuntos");
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "No se pudo subir el archivo");
      }
      const url = String(json?.url ?? "");
      if (!url) throw new Error("El servidor no devolvió URL");
      setUrls((p) => ({ ...p, [clave]: url }));
      setInfo(`Archivo subido para "${clave}". Revise la vista previa y pulse Guardar.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo((p) => ({ ...p, [clave]: false }));
    }
  };

  const guardar = async (clave: string) => {
    const url = (urls[clave] ?? "").trim();
    setError(null);
    setInfo(null);
    if (url.length < 8) {
      setError(`La URL de "${clave}" es obligatoria (mínimo 8 caracteres).`);
      return;
    }
    setGuardando((p) => ({ ...p, [clave]: true }));
    try {
      await apiOperacion("actualizarRecursoVisual", { clave, url });
      setInfo(`Recurso "${clave}" actualizado.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : `No se pudo guardar "${clave}"`);
    } finally {
      setGuardando((p) => ({ ...p, [clave]: false }));
    }
  };

  return (
    <AuthGate><Shell>
      <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
      <div className="mt-1"><ModHead
        eyebrow="CONSOLA ADMINISTRATIVA"
        title="Recursos visuales"
        actions={<button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>}
      /></div>

      {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
      {info && <p className="card p-4 mt-4 text-sm text-slate-600 bg-slate-50">{info}</p>}

      <section className="card mt-4 p-4 sm:p-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">Temas de la plataforma</h2>
          <p className="mt-1 text-sm text-slate-500">Elige una apariencia. Se aplica al instante y queda guardada en este dispositivo, en móvil y computadora.</p>
        </div>
        <div role="radiogroup" aria-label="Seleccionar tema" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {THEMES.map((opcion) => {
            const seleccionado = tema === opcion.id;
            return (
              <button
                key={opcion.id}
                type="button"
                role="radio"
                aria-checked={seleccionado}
                onClick={() => setTema(aplicarTema(opcion.id))}
                className={`overflow-hidden rounded-2xl border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${seleccionado ? "border-sky-500 ring-2 ring-sky-200" : "border-slate-200 hover:border-sky-300"}`}
              >
                <div className={`h-24 p-3 ${opcion.id === "light" ? "bg-slate-100" : opcion.id === "dark" ? "bg-slate-900" : opcion.id === "liquid-light" ? "bg-gradient-to-br from-sky-100 via-cyan-50 to-indigo-100" : "bg-gradient-to-br from-slate-950 via-slate-800 to-cyan-950"}`}>
                  <div className={`h-full rounded-xl border p-2 shadow-sm backdrop-blur-xl ${opcion.dark ? "border-white/20 bg-slate-800/60" : "border-white/80 bg-white/70"}`}>
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-sky-500" />
                      <span className={`h-1.5 w-16 rounded-full ${opcion.dark ? "bg-slate-400" : "bg-slate-300"}`} />
                    </div>
                    <div className="flex gap-1.5">
                      <span className="h-7 flex-1 rounded-md bg-sky-500/80" />
                      <span className={`h-7 flex-1 rounded-md border ${opcion.dark ? "border-white/10 bg-white/10" : "border-white bg-white/80"}`} />
                      <span className={`h-7 flex-1 rounded-md border ${opcion.dark ? "border-white/10 bg-white/10" : "border-white bg-white/80"}`} />
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <span className="flex items-center justify-between gap-2 font-bold text-slate-800">
                    {opcion.label}
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${seleccionado ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 text-transparent"}`} aria-hidden>{seleccionado ? "✓" : "·"}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500">{opcion.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {loading ? (
        <div className="card p-10 mt-4 text-center text-slate-500">Cargando…</div>
      ) : (
        <div className="grid gap-4 mt-4 md:grid-cols-2">
          {DEFINICIONES.map((def) => {
            const actual = porClave(def.clave);
            const draft = (urls[def.clave] ?? "").trim();
            const preview = draft || actual?.url || "";
            return (
              <div key={def.clave} className="card p-4">
                <p className="font-semibold text-slate-800">{def.titulo}</p>
                <p className="text-xs text-slate-500">{def.detalle} · clave <code>{def.clave}</code>
                  {actual?.version != null && <> · v{String(actual.version)}</>}
                </p>
                <div className="mt-3 flex items-center justify-center rounded-lg border bg-slate-50 min-h-[140px] p-3">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt={def.titulo} className="max-h-40 object-contain" />
                  ) : (
                    <span className="text-sm text-slate-400">Sin imagen</span>
                  )}
                </div>
                <label className="mt-3 block text-xs font-semibold text-slate-600">URL</label>
                <input
                  className="input mt-1 !w-full"
                  placeholder="https://…"
                  value={urls[def.clave] ?? ""}
                  onChange={(e) => setUrls((p) => ({ ...p, [def.clave]: e.target.value }))}
                />
                <label className="mt-3 block text-xs font-semibold text-slate-600">Archivo (PNG/JPG/WEBP máx 8 MB)</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  className="mt-1 block w-full text-sm text-slate-600"
                  disabled={!!subiendo[def.clave]}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    subirArchivo(def.clave, f);
                    e.target.value = "";
                  }}
                />
                <button
                  className="btn-green mt-3 !py-2"
                  onClick={() => guardar(def.clave)}
                  disabled={!!guardando[def.clave] || !!subiendo[def.clave]}
                >
                  {guardando[def.clave] ? "Guardando…" : subiendo[def.clave] ? "Subiendo…" : "Guardar"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Shell></AuthGate>
  );
}
