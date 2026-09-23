"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Proveedor = {
  id: string | number;
  nombre: string;
  ruc?: string;
  interlocutor?: string | null;
  contacto?: string | null;
  email?: string | null;
  telefono?: string | null;
};

export default function ProveedoresPage() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // Form nuevo proveedor
  const [nombre, setNombre] = useState("");
  const [ruc, setRuc] = useState("");
  const [interlocutor, setInterlocutor] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarProveedoresSGT", { q, limit: 200 });
      setRows(Array.isArray(datos) ? (datos as Proveedor[]) : []);
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
      (p) =>
        p.nombre.toLowerCase().includes(s) ||
        String(p.ruc ?? "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  const limpiar = () => setQ("");

  const guardar = async () => {
    setFormError(null);
    if (nombre.trim().length < 2) {
      setFormError("La razón social es obligatoria");
      return;
    }
    if (!/^\d{11}$/.test(ruc)) {
      setFormError("El RUC debe tener 11 dígitos");
      return;
    }
    if (interlocutor.trim().length < 2) {
      setFormError("El interlocutor es obligatorio");
      return;
    }
    setGuardando(true);
    try {
      await apiOperacion("crearProveedorSGT", {
        nombre: nombre.trim(),
        ruc,
        interlocutor: interlocutor.trim(),
        email: email.trim(),
        telefono: telefono.trim(),
      });
      setOpen(false);
      setNombre("");
      setRuc("");
      setInterlocutor("");
      setEmail("");
      setTelefono("");
      await cargar();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AuthGate><Shell>
      <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
      <div className="flex items-center justify-between mt-1">
        <h1 className="text-2xl font-extrabold">Proveedores</h1>
        <div className="flex gap-2">
          <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
          <button className="btn-green" onClick={() => setOpen(true)}>+ Nuevo proveedor</button>
        </div>
      </div>
      <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
        <input className="input !w-64" placeholder="Buscar por nombre o RUC…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-white !py-2" onClick={limpiar}>Limpiar filtros</button>
        <button className="btn-white !py-2" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Buscar en backend"}</button>
      </div>
      {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
      {loading ? (
        <div className="card p-10 mt-4 text-center text-slate-500">Cargando proveedores…</div>
      ) : filtrados.length === 0 ? (
        <div className="mt-4"><EmptyState titulo="Sin proveedores" detalle="No hay proveedores en el backend." /></div>
      ) : (
        <div className="table-wrap mt-4">
          <table className="tabla">
            <thead><tr><th>ID</th><th>RUC</th><th>RAZÓN SOCIAL</th><th>INTERLOCUTOR</th><th>CORREO</th><th>TELÉFONO</th></tr></thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={String(p.id)}>
                  <td className="font-mono text-xs">{String(p.id).slice(0, 8)}</td>
                  <td>{p.ruc ?? "—"}</td>
                  <td>{p.nombre}</td>
                  <td>{p.interlocutor ?? p.contacto ?? "—"}</td>
                  <td>{p.email ?? "—"}</td>
                  <td>{p.telefono ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl p-6">
            <h2 className="text-lg font-extrabold">Nuevo proveedor</h2>
            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <div className="md:col-span-2"><label className="label">Razón social</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
              <div><label className="label">Interlocutor</label><input className="input" placeholder="Nombre del interlocutor" value={interlocutor} onChange={(e) => setInterlocutor(e.target.value)} /></div>
              <div><label className="label">RUC (11 dígitos)</label><input className="input" maxLength={11} value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, ""))} placeholder="20123456789" />
                {ruc && ruc.length !== 11 && <p className="text-[11px] text-red-500 mt-1">El RUC debe tener 11 dígitos.</p>}</div>
              <div><label className="label">Correo</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><label className="label">Teléfono</label><input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
            </div>
            {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2 mt-5">
              <button className="btn-white flex-1" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Registrar proveedor"}</button>
            </div>
          </div>
        </div>
      )}
    </Shell></AuthGate>
  );
}
