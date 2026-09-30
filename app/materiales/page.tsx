"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Material = {
  id: string;
  codigo?: string;
  nombre: string;
  unidad?: string;
  precio_unit?: number;
  precio_vigente?: number;
  tarifa_vigente?: boolean;
  fecha_tarifa?: string;
  activo?: boolean;
};

function NuevoMaterialModal({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [precio, setPrecio] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setMsg(null);
    if (nombre.trim().length < 2) {
      setMsg("El nombre es obligatorio");
      return;
    }
    const p = Number(precio);
    if (!Number.isFinite(p) || p < 0) {
      setMsg("Precio inválido");
      return;
    }
    setGuardando(true);
    try {
      await apiOperacion("crearMaterial", { nombre: nombre.trim(), codigo: codigo.trim(), precio_unit: p });
      onGuardado();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-extrabold">Nuevo material</h2>
        <div className="grid gap-3 mt-4">
          <div><label className="label">Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div><label className="label">Código</label><input className="input" placeholder="MAT-…" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></div>
          <div><label className="label">Precio unitario (S/)</label><input className="input" placeholder="0.00" value={precio} onChange={(e) => setPrecio(e.target.value)} /></div>
        </div>
        {msg && <p className="mt-3 text-xs text-slate-600">{msg}</p>}
        <div className="flex gap-2 mt-4">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Crear material"}</button>
        </div>
      </div>
    </div>
  );
}

export default function MaterialesPage() {
  const [modal, setModal] = useState<null | "material">(null);
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarMaterialesSGT", { q, limit: 200 });
      setRows(Array.isArray(datos) ? (datos as Material[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const s = q.toLowerCase();
    return rows.filter((m) => {
      if (s && !m.nombre.toLowerCase().includes(s) && !String(m.codigo ?? "").toLowerCase().includes(s)) return false;
      if (estado === "Activo" && m.activo === false) return false;
      if (estado === "Inactivo" && m.activo !== false) return false;
      return true;
    });
  }, [rows, q, estado]);

  const limpiar = () => {
    setQ("");
    setEstado("");
  };

  return (
    <AuthGate>
      <Shell>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">Materiales</h1>
          <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
        </div>

        <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
          <div><label className="label">Buscar</label><input className="input !w-56" placeholder="Código o nombre…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div><label className="label">Estado</label><select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option><option>Activo</option><option>Inactivo</option></select></div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-green" onClick={() => setModal("material")}>+ Nuevo material</button>
          </div>
        </div>
        <div className="mt-2"><button className="btn-white !py-1.5 !text-xs" onClick={limpiar}>Limpiar filtros</button></div>

        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}

        {loading ? (
          <div className="card p-10 mt-4 text-center text-slate-500">Cargando materiales…</div>
        ) : filtrados.length === 0 ? (
          <div className="mt-4"><EmptyState titulo="Sin materiales" detalle="Usa «Nuevo material»." /></div>
        ) : (
          <div className="table-wrap mt-4">
            <table className="tabla">
              <thead><tr><th>ID</th><th>CÓDIGO</th><th>MATERIAL</th><th>MEDIDA</th><th>PRECIO VIGENTE</th><th>ESTADO</th></tr></thead>
              <tbody>
                {filtrados.map((m) => (
                  <tr key={m.id}>
                    <td className="font-mono text-xs">{String(m.id).slice(0, 8)}</td>
                    <td>{m.codigo ?? "—"}</td>
                    <td>{m.nombre}</td>
                    <td>{m.unidad ?? "—"}</td>
                    <td>S/ {Number(m.precio_vigente ?? m.precio_unit ?? 0).toFixed(2)}</td>
                    <td>{m.activo === false ? "Inactivo" : "Activo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {modal === "material" && <NuevoMaterialModal onClose={() => setModal(null)} onGuardado={cargar} />}
      </Shell>
    </AuthGate>
  );
}
