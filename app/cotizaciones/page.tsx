"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import CotizacionModal from "@/components/CotizacionModal";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Cot = {
  id: string;
  codigo?: string;
  numero?: string;
  estado?: string;
  total?: number;
  capital?: number;
  cuota_mensual?: number;
  plazo?: number;
  proveedor?: string | null;
  asesor?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  clientes?: { nombres?: string; nombre?: string } | null;
};

type Proveedor = { id: string | number; nombre: string };
type Usuario = { id: string; email?: string; nombre?: string };

function nombreCliente(c: Cot): string {
  return c.clientes?.nombres ?? c.clientes?.nombre ?? "—";
}

export default function CotizacionesPage() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Cot[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [prov, setProv] = useState("");
  const [usuario, setUsuario] = useState("");

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      // No existe listarCotizacionesSGT en operacionesSGT: se usa listarCotizaciones.
      const lista = await apiOperacion<unknown>("listarCotizaciones", { limit: 200 });
      const arr = Array.isArray(lista) ? (lista as Cot[]) : [];
      setRows(arr);
      try {
        const provs = await apiOperacion<unknown>("listarProveedoresSGT", { limit: 200 });
        setProveedores(Array.isArray(provs) ? (provs as Proveedor[]) : []);
      } catch {
        setProveedores([]);
      }
      try {
        const us = await apiOperacion<unknown>("adminListarUsuarios", {});
        setUsuarios(Array.isArray(us) ? (us as Usuario[]) : []);
      } catch {
        setUsuarios([]);
      }
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

  const filtradas = useMemo(() => {
    const s = q.toLowerCase();
    return rows.filter((r) => {
      const num = String(r.codigo ?? r.numero ?? "").toLowerCase();
      const cli = nombreCliente(r).toLowerCase();
      if (s && !num.includes(s) && !cli.includes(s)) return false;
      if (estado && String(r.estado ?? "").toUpperCase() !== estado) return false;
      if (prov && String(r.proveedor ?? "") !== prov) return false;
      if (usuario && String(r.created_by ?? r.asesor ?? "") !== usuario) return false;
      return true;
    });
  }, [rows, q, estado, prov, usuario]);

  const limpiar = () => {
    setQ("");
    setEstado("");
    setProv("");
    setUsuario("");
  };

  return (
    <AuthGate>
      <Shell>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-slate-400">GESTIÓN COMERCIAL</p>
            <h1 className="text-2xl font-extrabold mt-1">Cotizaciones</h1>
          </div>
          <button className="btn-green" onClick={() => setOpen(true)}>+ Nueva cotización</button>
        </div>

        <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
          <input className="input !w-64" placeholder="Buscar por número o cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input !w-44" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Estado: Todos</option>
            <option value="BORRADOR">Pendiente</option>
            <option value="ENVIADA">Enviada</option>
            <option value="APROBADA">Aprobada</option>
            <option value="RECHAZADA">Rechazada</option>
          </select>
          <select className="input !w-44" value={prov} onChange={(e) => setProv(e.target.value)}>
            <option value="">Proveedor: Todos</option>
            {proveedores.map((p) => (
              <option key={String(p.id)} value={p.nombre}>{p.nombre}</option>
            ))}
          </select>
          <select className="input !w-44" value={usuario} onChange={(e) => setUsuario(e.target.value)}>
            <option value="">Usuario: Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre ?? u.email ?? u.id}</option>
            ))}
          </select>
          <button className="btn-white !py-2" onClick={limpiar}>Limpiar filtros</button>
          <button className="btn-white !py-2" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
        </div>

        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}

        {loading ? (
          <div className="card p-10 mt-4 text-center text-slate-500">Cargando cotizaciones…</div>
        ) : filtradas.length === 0 ? (
          <div className="mt-4"><EmptyState titulo="Sin cotizaciones" detalle="No hay registros en el backend para los filtros actuales." /></div>
        ) : (
          <div className="table-wrap mt-4">
            <table className="tabla">
              <thead><tr><th>NÚMERO</th><th>CLIENTE</th><th>PROVEEDOR</th><th>USUARIO DE VENTA</th><th>ESTADO</th><th>TOTAL</th><th>FINANCIAMIENTO</th><th>ACTUALIZACIÓN</th><th>ACCIONES</th></tr></thead>
              <tbody>
                {filtradas.map((r) => (
                  <tr key={r.id}>
                    <td className="font-bold text-[#0099D8]">{r.codigo ?? r.numero ?? r.id.slice(0, 8)}</td>
                    <td>{nombreCliente(r)}</td>
                    <td>{r.proveedor ?? "—"}</td>
                    <td>{r.asesor ?? r.created_by ?? "—"}</td>
                    <td><span className="text-[11px] font-bold bg-amber-100 text-amber-700 rounded-lg px-2 py-1">{String(r.estado ?? "—").toUpperCase()}</span></td>
                    <td>S/ {Number(r.total ?? 0).toFixed(2)}</td>
                    <td>{r.plazo ? `${r.plazo} cuotas S/ ${Number(r.cuota_mensual ?? 0).toFixed(2)}` : "—"}</td>
                    <td>{r.updated_at ?? r.created_at ?? "—"}</td>
                    <td><Link className="btn-white !py-1 !px-3 !text-xs" href={`/cotizaciones/${r.id}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {open && <CotizacionModal onClose={() => { setOpen(false); cargar(); }} />}
      </Shell>
    </AuthGate>
  );
}
