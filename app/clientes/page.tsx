"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Cliente = {
  id: string;
  nombres?: string;
  nombre?: string;
  dni?: string;
  documento?: string;
  telefono?: string;
  email?: string;
};

function NuevoClienteModal({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [nombres, setNombres] = useState("");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setMsg(null);
    if (nombres.trim().length < 2) {
      setMsg("El nombre es obligatorio");
      return;
    }
    setGuardando(true);
    try {
      await apiOperacion("crearCliente", {
        nombres: nombres.trim(),
        dni: dni.trim(),
        telefono: telefono.trim(),
        email: email.trim(),
      });
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
        <h2 className="text-lg font-extrabold">Nuevo cliente</h2>
        <div className="grid gap-3 mt-4">
          <div><label className="label">Nombres</label><input className="input" value={nombres} onChange={(e) => setNombres(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Documento</label><input className="input" value={dni} onChange={(e) => setDni(e.target.value)} /></div>
            <div><label className="label">Teléfono</label><input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          </div>
          <div><label className="label">Correo</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        {msg && <p className="mt-3 text-xs text-slate-600">{msg}</p>}
        <div className="flex gap-2 mt-4">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Crear cliente"}</button>
        </div>
      </div>
    </div>
  );
}

export default function ClientesPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarClientes", { q, limit: 200 });
      setRows(Array.isArray(datos) ? (datos as Cliente[]) : []);
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
    if (!s) return rows;
    return rows.filter(
      (c) =>
        String(c.nombres ?? c.nombre ?? "").toLowerCase().includes(s) ||
        String(c.dni ?? c.documento ?? "").toLowerCase().includes(s) ||
        String(c.email ?? "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  const limpiar = () => setQ("");

  return (
    <AuthGate>
      <Shell>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-slate-400">GESTIÓN COMERCIAL</p>
            <h1 className="text-2xl font-extrabold mt-1">Clientes</h1>
          </div>
          <div className="flex gap-2">
            <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
            <button className="btn-green" onClick={() => setOpen(true)}>+ Nuevo cliente</button>
          </div>
        </div>

        <div className="card p-4 mt-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="label">Buscar cliente</label>
              <input className="input" placeholder="Nombre, documento o correo…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button onClick={limpiar} className="btn-white !py-1.5">Limpiar filtros</button>
            <button onClick={cargar} className="btn-white !py-1.5" disabled={loading}>{loading ? "Cargando…" : "Buscar en backend"}</button>
          </div>
        </div>

        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}

        {loading ? (
          <div className="card p-10 mt-4 text-center text-slate-500">Cargando clientes…</div>
        ) : filtrados.length === 0 ? (
          <div className="mt-4"><EmptyState titulo="Sin clientes" detalle="No hay clientes registrados en el backend." /></div>
        ) : (
          <div className="table-wrap mt-4">
            <table className="tabla">
              <thead><tr><th>ID</th><th>DOCUMENTO</th><th>CLIENTE</th><th>CONTACTO</th></tr></thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono text-xs">{c.id.slice(0, 8)}</td>
                    <td>{c.dni ?? c.documento ?? "—"}</td>
                    <td>{c.nombres ?? c.nombre ?? "—"}</td>
                    <td>{[c.telefono, c.email].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
          <span>Mostrando {filtrados.length} de {rows.length} registros</span>
        </div>
        {open && <NuevoClienteModal onClose={() => setOpen(false)} onGuardado={cargar} />}
      </Shell>
    </AuthGate>
  );
}
