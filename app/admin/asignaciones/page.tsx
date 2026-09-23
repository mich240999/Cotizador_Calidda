"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion } from "@/components/Tablas";

type Asignacion = Record<string, unknown> & { id: string | number; estado?: string };

export default function AsignacionesPage() {
  const [rows, setRows] = useState<Asignacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarAsignaciones", {});
      setRows(Array.isArray(datos) ? (datos as Asignacion[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const conteos = useMemo(() => {
    const norm = (a: Asignacion) => String(a.estado ?? "VIGENTE").toUpperCase();
    return {
      vigentes: rows.filter((a) => norm(a) === "VIGENTE").length,
      programadas: rows.filter((a) => norm(a) === "PROGRAMADA").length,
      finalizadas: rows.filter((a) => norm(a) === "FINALIZADA").length,
      canceladas: rows.filter((a) => norm(a) === "CANCELADA").length,
    };
  }, [rows]);

  const TABS = [
    `Vigentes (${conteos.vigentes})`,
    `Programadas (${conteos.programadas})`,
    `Finalizadas (${conteos.finalizadas})`,
    `Canceladas (${conteos.canceladas})`,
  ];
  const ESTADOS = ["VIGENTE", "PROGRAMADA", "FINALIZADA", "CANCELADA"];

  const visibles = useMemo(
    () => rows.filter((a) => String(a.estado ?? "VIGENTE").toUpperCase() === ESTADOS[tab]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, tab]
  );

  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="flex items-center justify-between mt-1">
      <h1 className="text-2xl font-extrabold">Asignaciones asesores</h1>
      <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
    </div>
    <div className="flex gap-2 mt-3 flex-wrap">{TABS.map((t, i) => (<button key={t} onClick={() => setTab(i)} className={`px-4 py-2 rounded-xl text-sm font-semibold ${i === tab ? "bg-[#0099D8] text-white" : "bg-white border text-slate-600"}`}>{t}</button>))}</div>
    {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
    {loading ? (
      <div className="card p-8 mt-4 text-center text-sm text-slate-500">Cargando asignaciones…</div>
    ) : (
      <div className="card p-8 mt-4 text-center text-sm text-slate-400">
        {visibles.length === 0
          ? `${conteos.vigentes + conteos.programadas + conteos.finalizadas + conteos.canceladas} asignaciones en total · 0 en esta bandeja.`
          : `${visibles.length} asignaciones en esta bandeja.`}
      </div>
    )}
    {visibles.length > 0 && (
      <div className="table-wrap mt-4"><table className="tabla">
        <thead><tr><th>ID</th><th>ESTADO</th><th>DETALLE</th></tr></thead>
        <tbody>
          {visibles.map((a) => (
            <tr key={String(a.id)}>
              <td className="font-mono text-xs">{String(a.id).slice(0, 8)}</td>
              <td>{String(a.estado ?? "—")}</td>
              <td className="font-mono text-xs">{JSON.stringify(a).slice(0, 120)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    )}
  </Shell></AuthGate>);
}
