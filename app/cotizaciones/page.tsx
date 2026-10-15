"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import CotizacionModal from "@/components/CotizacionModal";
import { apiOperacion, EmptyState } from "@/components/Tablas";
import { AccAbrir } from "@/components/Accion";

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
  creador_nombre?: string | null;
  creador_email?: string | null;
  created_at?: string;
  updated_at?: string;
  clientes?: { nombres?: string; nombre?: string } | null;
};

type Proveedor = { id: string | number; nombre: string };

function nombreCliente(c: Cot): string {
  return c.clientes?.nombres ?? c.clientes?.nombre ?? "—";
}

/** Fecha corta de la cotización (solo fecha, sin hora). */
function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("es-PE");
}

/** Usuario de venta: nombre del asesor o del usuario creador (nunca el UUID). */
function usuarioVenta(c: Cot): string {
  const asesor = String(c.asesor ?? "").trim();
  if (asesor) return asesor;
  const creador = String(c.creador_nombre ?? "").trim();
  if (creador) return creador;
  return "—";
}

export default function CotizacionesPage() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Cot[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
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

  // Opciones del filtro de usuario: nombres de venta presentes en las filas
  // (funciona para todos los roles, sin depender de adminListarUsuarios).
  const usuariosFiltro = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      const n = usuarioVenta(r);
      if (n !== "—") set.set(n.toLowerCase(), n);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const filtradas = useMemo(() => {
    const s = q.toLowerCase();
    return rows.filter((r) => {
      const num = String(r.codigo ?? r.numero ?? "").toLowerCase();
      const cli = nombreCliente(r).toLowerCase();
      if (s && !num.includes(s) && !cli.includes(s)) return false;
      if (estado && String(r.estado ?? "").toUpperCase() !== estado) return false;
      if (prov && String(r.proveedor ?? "") !== prov) return false;
      if (usuario && usuarioVenta(r) !== usuario) return false;
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
        <ModHead
          eyebrow="GESTIÓN COMERCIAL"
          title="Cotizaciones"
          actions={<button className="btn-green" onClick={() => setOpen(true)}>+ Nueva cotización</button>}
        />

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
            {usuariosFiltro.map((n) => (
              <option key={n} value={n}>{n}</option>
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
              <thead><tr><th>NÚMERO</th><th>FECHA</th><th>CLIENTE</th><th>PROVEEDOR</th><th>USUARIO DE VENTA</th><th>ESTADO</th><th>TOTAL</th><th>CUOTAS</th><th>ACTUALIZACIÓN</th><th>ACCIONES</th></tr></thead>
              <tbody>
                {filtradas.map((r) => (
                  <tr key={r.id}>
                    <td className="font-bold text-[#0099D8]">{r.codigo ?? r.numero ?? r.id.slice(0, 8)}</td>
                    <td className="whitespace-nowrap">{fechaCorta(r.created_at)}</td>
                    <td>{nombreCliente(r)}</td>
                    <td>{r.proveedor ?? "—"}</td>
                    <td>{usuarioVenta(r)}</td>
                    <td><span className="text-[11px] font-bold bg-amber-100 text-amber-700 rounded-lg px-2 py-1">{String(r.estado ?? "—").toUpperCase()}</span></td>
                    <td>S/ {Number(r.total ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>{r.plazo ? `${r.plazo} cuotas` : "—"}</td>
                    <td>{r.updated_at ?? r.created_at ?? "—"}</td>
                    <td><AccAbrir title="Abrir cotización" href={`/cotizaciones/${r.id}`} /></td>
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
