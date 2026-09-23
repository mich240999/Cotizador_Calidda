"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Oficina = {
  id: string;
  codigo?: string | null;
  codigo_sap?: string | null;
  nombre: string;
  descripcion?: string | null;
  estado?: string | null;
};

const sapDe = (o: Oficina) => o.codigo_sap ?? o.codigo ?? "—";

export default function OficinasPage() {
  const [rows, setRows] = useState<Oficina[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showNuevo, setShowNuevo] = useState(false);
  const [showEditar, setShowEditar] = useState<Oficina | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ codigo_sap: "", nombre: "", descripcion: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarOficinasVentas", { limit: 200 });
      setRows(Array.isArray(datos) ? (datos as Oficina[]) : []);
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
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (o) =>
        o.nombre.toLowerCase().includes(s) ||
        String(sapDe(o)).toLowerCase().includes(s) ||
        String(o.id).toLowerCase().includes(s)
    );
  }, [rows, q]);

  const guardarNueva = async () => {
    setFormError(null);
    if (!form.codigo_sap.trim() || !form.nombre.trim()) {
      setFormError("Código SAP y nombre son obligatorios.");
      return;
    }
    if (form.descripcion.length > 500) {
      setFormError("La descripción admite máximo 500 caracteres.");
      return;
    }
    setSaving(true);
    try {
      await apiOperacion("crearOficina", {
        codigo_sap: form.codigo_sap.trim(),
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
      });
      setShowNuevo(false);
      setForm({ codigo_sap: "", nombre: "", descripcion: "" });
      setInfo("Oficina guardada correctamente.");
      await cargar();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const guardarEdicion = async () => {
    if (!showEditar) return;
    setFormError(null);
    setSaving(true);
    try {
      await apiOperacion("actualizarOficina", {
        id: showEditar.id,
        nombre: showEditar.nombre,
        descripcion: showEditar.descripcion ?? "",
      });
      setShowEditar(null);
      setInfo("Oficina actualizada.");
      await cargar();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (o: Oficina) => {
    const nuevo = String(o.estado ?? "").toUpperCase() === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    setError(null);
    try {
      await apiOperacion("actualizarOficina", { id: o.id, estado: nuevo });
      setInfo(`Oficina ${nuevo === "ACTIVO" ? "activada" : "desactivada"}.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
    }
  };

  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="flex flex-wrap items-center justify-between gap-3 mt-1">
      <div>
        <p className="text-[11px] font-extrabold tracking-widest text-emerald-600">CONFIGURACIÓN COMERCIAL</p>
        <h1 className="text-2xl font-extrabold">Oficinas de ventas</h1>
        <p className="text-sm text-slate-500 mt-1">Administra las oficinas de ventas utilizadas para organizar proveedores, grupos de vendedores y asignaciones comerciales.</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button>
        <button className="btn-green" onClick={() => { setForm({ codigo_sap: "", nombre: "", descripcion: "" }); setFormError(null); setShowNuevo(true); }}>+ Nueva oficina</button>
      </div>
    </div>

    <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-[220px]">
        <label className="label">Buscar oficina</label>
        <input className="input" placeholder="ID, código SAP, nombre o descripción" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <button className="btn-white !py-2" onClick={() => setQ("")}>Limpiar filtros</button>
    </div>

    {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
    {info && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}

    {loading ? (
      <div className="card p-6 mt-4 text-sm text-[#0099D8]">Cargando oficinas de ventas…</div>
    ) : filtradas.length === 0 ? (
      <div className="mt-4"><EmptyState titulo="Sin oficinas" detalle="No hay oficinas registradas. Crea la primera con Nueva oficina." /></div>
    ) : (
      <div className="card mt-4">
        <div className="px-5 py-3 border-b font-semibold">Listado de oficinas · {filtradas.length}</div>
        <div className="overflow-x-auto"><table className="tabla">
          <thead><tr><th>ID</th><th>CÓDIGO SAP</th><th>OFICINA</th><th>DESCRIPCIÓN</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
          <tbody>
            {filtradas.map((o) => {
              const activa = String(o.estado ?? "").toUpperCase() === "ACTIVO";
              return (
                <tr key={String(o.id)}>
                  <td className="font-mono text-xs">{String(o.id)}</td>
                  <td className="font-medium">{sapDe(o)}</td>
                  <td className="font-medium">{o.nombre}</td>
                  <td className="max-w-[280px] truncate text-slate-500">{o.descripcion || "—"}</td>
                  <td>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${activa ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {activa ? "ACTIVO" : "INACTIVO"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="btn-white !py-1 !px-3 text-xs mr-2" onClick={() => { setShowEditar({ ...o }); setFormError(null); }}>Editar</button>
                    <button className={`!py-1 !px-3 text-xs rounded-lg border font-semibold ${activa ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`} onClick={() => cambiarEstado(o)}>
                      {activa ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    )}

    {showNuevo && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="card w-full max-w-2xl p-0 overflow-hidden">
          <div className="flex items-start justify-between px-6 py-4 border-b bg-slate-50">
            <div>
              <h2 className="font-bold text-lg">Nueva oficina de ventas</h2>
              <p className="text-sm text-slate-500">Completa los datos obligatorios para guardar la oficina.</p>
            </div>
            <button className="btn-white !px-3" onClick={() => setShowNuevo(false)}>✕</button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">Código de oficina SAP *</label>
                <input className="input" value={form.codigo_sap} onChange={(e) => setForm({ ...form, codigo_sap: e.target.value.toUpperCase() })} placeholder="Ej. AMCA-OFV0002" />
                <p className="text-[11px] text-slate-400 mt-1">Debe coincidir con el código utilizado en SAP.</p>
              </div>
              <div>
                <label className="label">Nombre de la oficina *</label>
                <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Ambientes Cálidos Norte" />
              </div>
            </div>
            <div>
              <label className="label">Descripción</label>
              <textarea className="input" rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} maxLength={500} />
              <p className="text-[11px] text-slate-400 mt-1">Máximo 500 caracteres ({form.descripcion.length}/500).</p>
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input !w-56" disabled value="ACTIVO">
                <option value="ACTIVO">Activo</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">En edición, el estado se cambia desde el listado.</p>
            </div>
            {formError && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{formError}</p>}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
            <button className="btn-white" onClick={() => setShowNuevo(false)}>Cancelar</button>
            <button className="btn-green" onClick={guardarNueva} disabled={saving}>{saving ? "Guardando…" : "Guardar oficina"}</button>
          </div>
        </div>
      </div>
    )}

    {showEditar && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="card w-full max-w-2xl p-6 space-y-4">
          <h2 className="font-bold text-lg">Editar oficina · {showEditar.id}</h2>
          <p className="text-[11px] text-slate-400 -mt-2">El código SAP <span className="font-mono font-bold">{sapDe(showEditar)}</span> es inmutable.</p>
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={showEditar.nombre} onChange={(e) => setShowEditar({ ...showEditar, nombre: e.target.value })} />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={3} value={showEditar.descripcion ?? ""} onChange={(e) => setShowEditar({ ...showEditar, descripcion: e.target.value })} maxLength={500} />
          </div>
          {formError && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-white" onClick={() => setShowEditar(null)}>Cancelar</button>
            <button className="btn-green" onClick={guardarEdicion} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
          </div>
        </div>
      </div>
    )}
  </Shell></AuthGate>);
}
