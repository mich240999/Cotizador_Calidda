"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion } from "@/components/Tablas";

export default function DashboardPage() {
  const [nCot, setNCot] = useState<number | null>(null);
  const [nCli, setNCli] = useState<number | null>(null);
  const [nMat, setNMat] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, cl, m] = await Promise.allSettled([
        apiOperacion<unknown>("listarCotizaciones", { limit: 500 }),
        apiOperacion<unknown>("listarClientes", { limit: 500 }),
        apiOperacion<unknown>("listarMaterialesSGT", { limit: 500 }),
      ]);
      setNCot(c.status === "fulfilled" && Array.isArray(c.value) ? c.value.length : 0);
      setNCli(cl.status === "fulfilled" && Array.isArray(cl.value) ? cl.value.length : 0);
      setNMat(m.status === "fulfilled" && Array.isArray(m.value) ? m.value.length : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const cards = [
    { key: "COT", title: "Cotizaciones", desc: "Total registrado", total: nCot, color: "bg-sky-100 text-sky-700", dot: "bg-[#0099D8]" },
    { key: "CLI", title: "Clientes", desc: "Total registrado", total: nCli, color: "bg-emerald-100 text-emerald-700", dot: "bg-[#00A651]" },
    { key: "MAT", title: "Materiales", desc: "Total registrado", total: nMat, color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  ];

  return (
    <AuthGate>
      <Shell>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-slate-400">RESUMEN GENERAL</p>
            <h1 className="text-2xl font-extrabold mt-1">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Vista consolidada de la operación comercial.</p>
          </div>
          <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
        </div>
        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
        <div className="grid gap-4 md:grid-cols-3 mt-6">
          {cards.map((c) => (
            <div key={c.key} className="card p-5">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-extrabold rounded-lg px-2 py-1 ${c.color}`}>{c.key}</span>
                <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
              </div>
              <p className="mt-3 font-bold text-slate-800">{c.title}</p>
              <p className="text-xs text-slate-400">{c.desc}</p>
              <p className="mt-2 text-3xl font-extrabold">{c.total === null ? "…" : c.total}</p>
            </div>
          ))}
        </div>
        {!loading && (nCot ?? 0) === 0 && (nCli ?? 0) === 0 && (nMat ?? 0) === 0 && (
          <div className="card p-6 mt-4 text-sm text-slate-500">
            Sin movimientos registrados. Los totales se actualizan al registrar cotizaciones, clientes y materiales.
          </div>
        )}
      </Shell>
    </AuthGate>
  );
}
