"use client";
import { useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";

export default function RecursosPage() {
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const actualizar = () => {
    // Sin endpoint de recursos en /api/operacion: recarga local con spinner.
    setLoading(true);
    setInfo(null);
    setTimeout(() => {
      setLoading(false);
      setInfo("El backend (/api/operacion) no expone operaciones de recursos visuales. Vista local sin datos quemados.");
    }, 400);
  };

  const subir = () => {
    setInfo("Carga de recursos visuales no disponible: sin operación en /api/operacion.");
  };

  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="flex items-center justify-between mt-1">
      <h1 className="text-2xl font-extrabold">Recursos visuales</h1>
      <button className="btn-white" onClick={actualizar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
    </div>
    {info && <p className="card p-4 mt-4 text-sm text-slate-600 bg-slate-50">{info}</p>}
    {loading ? (
      <div className="card p-10 mt-4 text-center text-slate-500">Cargando…</div>
    ) : (
      <div className="card p-10 mt-4 text-center">
        <p className="font-semibold text-slate-700">Sin recursos</p>
        <p className="mt-1 text-sm text-slate-500">No hay recursos visuales registrados en el backend.</p>
        <button className="btn-white mt-4 !py-2" onClick={subir}>Subir imagen</button>
      </div>
    )}
  </Shell></AuthGate>);
}
