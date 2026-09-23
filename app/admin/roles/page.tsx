"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Rol = { id?: string | number; nombre: string; descripcion?: string; permisos?: unknown };

export default function RolesPage() {
  const [rows, setRows] = useState<Rol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarRolesSGT", {});
      setRows(Array.isArray(datos) ? (datos as Rol[]) : []);
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

  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="flex items-center justify-between mt-1">
      <h1 className="text-2xl font-extrabold">Roles</h1>
      <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
    </div>
    {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
    {loading ? (
      <div className="card p-10 mt-4 text-center text-slate-500">Cargando roles…</div>
    ) : rows.length === 0 ? (
      <div className="mt-4"><EmptyState titulo="Sin roles" detalle="No hay roles en el backend." /></div>
    ) : (
      <div className="grid md:grid-cols-2 gap-4 mt-4">{rows.map((r) => (
        <div key={String(r.id ?? r.nombre)} className="card p-5">
          <div className="flex items-center gap-2">
            <p className="font-extrabold">{String(r.nombre).toUpperCase()}</p>
          </div>
          <p className="text-xs text-slate-500 mt-2">{r.descripcion ?? "Rol del sistema."}</p>
        </div>))}
      </div>
    )}
  </Shell></AuthGate>);
}
