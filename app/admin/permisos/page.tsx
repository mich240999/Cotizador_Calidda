"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion } from "@/components/Tablas";

export default function PermisosPage() {
  const [matriz, setMatriz] = useState<Record<string, unknown>>({});
  const [fuente, setFuente] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<{ fuente?: string; matriz?: unknown }>("getMatrizPermisos", {});
      const m = (datos?.matriz ?? {}) as Record<string, unknown>;
      setMatriz(m);
      setFuente(datos?.fuente ?? "");
      const keys = Object.keys(m);
      setOpen((prev) => prev ?? (keys[0] ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setMatriz({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const roles = useMemo(() => Object.keys(matriz), [matriz]);
  const concedidos = useMemo(() => {
    let n = 0;
    for (const v of Object.values(matriz)) {
      if (Array.isArray(v)) n += v.length;
      else if (v && typeof v === "object") n += Object.values(v as Record<string, unknown>).filter(Boolean).length;
      else if (v) n += 1;
    }
    return n;
  }, [matriz]);

  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="flex items-center justify-between mt-1">
      <h1 className="text-2xl font-extrabold">Permisos detallados</h1>
      <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
    </div>
    <p className="text-xs text-slate-500 mt-1">
      {loading ? "Cargando matriz…" : `Matriz por rol · ${roles.length} roles · ${concedidos} concedidos${fuente ? ` · fuente: ${fuente}` : ""}. Solo lectura (el backend no expone escritura de permisos).`}
    </p>
    {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
    {loading ? (
      <div className="card p-10 mt-4 text-center text-slate-500">Cargando permisos…</div>
    ) : (
      <div className="space-y-3 mt-4">{roles.map((rol) => (
        <div key={rol} className="card overflow-hidden">
          <button onClick={() => setOpen(open === rol ? null : rol)} className="w-full flex items-center justify-between px-5 py-3 font-bold text-sm">
            {rol}<span className="text-slate-400">{open === rol ? "−" : "+"}</span>
          </button>
          {open === rol && (
            <div className="px-5 pb-4 text-xs font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(matriz[rol], null, 2)}
            </div>
          )}
        </div>))}
        {roles.length === 0 && <div className="card p-8 text-center text-sm text-slate-400">Sin datos de permisos en el backend.</div>}
      </div>
    )}
  </Shell></AuthGate>);
}
