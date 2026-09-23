"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Proveedor = { id: string | number; nombre: string; ruc?: string };
type Oficina = { id: string | number; nombre: string; codigo?: string };

export default function VinculacionesPage() {
  const [open, setOpen] = useState(false);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [provSel, setProvSel] = useState("");
  const [ofiSel, setOfiSel] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, o] = await Promise.all([
        apiOperacion<unknown>("listarProveedoresSGT", { limit: 200 }),
        apiOperacion<unknown>("listarOficinasVentas", { limit: 200 }),
      ]);
      setProveedores(Array.isArray(p) ? (p as Proveedor[]) : []);
      setOficinas(Array.isArray(o) ? (o as Oficina[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setProveedores([]);
      setOficinas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const guardar = async () => {
    setError(null);
    setOk(null);
    if (!provSel || !ofiSel) {
      setError("Selecciona proveedor y oficina");
      return;
    }
    setGuardando(true);
    try {
      await apiOperacion("vincularProveedorOficina", {
        proveedor_id: Number(provSel),
        oficina_id: Number(ofiSel),
      });
      setOk("Vínculo creado correctamente");
      setOpen(false);
      setProvSel("");
      setOfiSel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el vínculo");
    } finally {
      setGuardando(false);
    }
  };

  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="flex items-center justify-between mt-1">
      <h1 className="text-2xl font-extrabold">Proveedores y oficinas</h1>
      <div className="flex gap-2">
        <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
        <button className="btn-green" onClick={() => setOpen(true)}>+ Nueva vinculación</button>
      </div>
    </div>
    {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
    {ok && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{ok}</p>}
    {loading ? (
      <div className="card p-10 mt-4 text-center text-slate-500">Cargando…</div>
    ) : (
      <div className="mt-4"><EmptyState titulo="Sin vinculaciones" detalle="Usa «Nueva vinculación» para crear el vínculo proveedor ↔ oficina en el backend." /></div>
    )}
    {open && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-extrabold">Nueva vinculación</h2>
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3">⚠ Este vínculo es <b>inmutable</b>: una vez creado no puede editarse, solo finalizarse y crear uno nuevo.</div>
        <div className="grid gap-3 mt-4">
          <div><label className="label">Proveedor</label>
            <select className="input" value={provSel} onChange={(e) => setProvSel(e.target.value)}>
              <option value="">Seleccionar…</option>
              {proveedores.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div><label className="label">Oficina</label>
            <select className="input" value={ofiSel} onChange={(e) => setOfiSel(e.target.value)}>
              <option value="">Seleccionar…</option>
              {oficinas.map((o) => (
                <option key={String(o.id)} value={String(o.id)}>{o.codigo ? `${o.codigo} · ${o.nombre}` : o.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button className="btn-white flex-1" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar vinculación"}</button>
        </div>
      </div></div>)}
  </Shell></AuthGate>);
}
