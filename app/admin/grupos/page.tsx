"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Grupo = {
  id: string;
  codigo?: string | null;
  codigo_sap?: string | null;
  nombre?: string | null;
  grupo?: string | null;
  proveedor?: string | null;
  oficina?: string | null;
  oficina_sap?: string | null;
  estado?: string | null;
};

type Vinculacion = {
  id: string;
  estado?: string | null;
  proveedor?: string | null;
  proveedor_ruc?: string | null;
  oficina?: string | null;
  oficina_sap?: string | null;
};

const nombreGrupo = (g: Grupo) => g.nombre ?? g.grupo ?? "—";
const sapGrupo = (g: Grupo) => g.codigo_sap ?? g.codigo ?? "—";

export default function GruposPage() {
  const [rows, setRows] = useState<Grupo[]>([]);
  const [vincs, setVincs] = useState<Vinculacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fProv, setFProv] = useState("TODOS");
  const [fOfi, setFOfi] = useState("TODAS");
  const [fEst, setFEst] = useState("TODOS");
  const [showNuevo, setShowNuevo] = useState(false);
  const [showEditar, setShowEditar] = useState<Grupo | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ vinculacion_id: "", codigo_sap: "", nombre: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, v] = await Promise.all([
        apiOperacion<unknown>("listarGruposVendedores", { limit: 200 }),
        apiOperacion<unknown>("listarVinculaciones", { limit: 500 }).catch(() => []),
      ]);
      setRows(Array.isArray(g) ? (g as Grupo[]) : []);
      setVincs(Array.isArray(v) ? (v as Vinculacion[]) : []);
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

  const vincActivas = useMemo(
    () => vincs.filter((v) => String(v.estado ?? "").toUpperCase() === "ACTIVO"),
    [vincs]
  );

  const proveedores = useMemo(() => [...new Set(rows.map((g) => g.proveedor ?? "—"))], [rows]);
  const oficinas = useMemo(() => [...new Set(rows.map((g) => g.oficina ?? "—"))], [rows]);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((g) => {
      if (s && ![nombreGrupo(g), sapGrupo(g), g.proveedor ?? "", g.oficina ?? "", String(g.id)].join(" ").toLowerCase().includes(s)) return false;
      if (fProv !== "TODOS" && (g.proveedor ?? "—") !== fProv) return false;
      if (fOfi !== "TODAS" && (g.oficina ?? "—") !== fOfi) return false;
      if (fEst !== "TODOS" && String(g.estado ?? "").toUpperCase() !== fEst) return false;
      return true;
    });
  }, [rows, q, fProv, fOfi, fEst]);

  const guardarNuevo = async () => {
    setFormError(null);
    if (!form.vinculacion_id) {
      setFormError("Selecciona una vinculación activa proveedor ↔ oficina.");
      return;
    }
    if (!form.codigo_sap.trim() || !form.nombre.trim()) {
      setFormError("Código SAP y nombre del grupo son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      await apiOperacion("crearGrupoVendedores", {
        vinculacion_id: form.vinculacion_id,
        codigo_sap: form.codigo_sap.trim(),
        nombre: form.nombre.trim(),
      });
      setShowNuevo(false);
      setForm({ vinculacion_id: "", codigo_sap: "", nombre: "" });
      setInfo("Grupo guardado correctamente.");
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
      await apiOperacion("actualizarGrupoVendedores", { id: showEditar.id, nombre: nombreGrupo(showEditar) });
      setShowEditar(null);
      setInfo("Grupo actualizado. Proveedor y oficina son inmutables.");
      await cargar();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (g: Grupo) => {
    const nuevo = String(g.estado ?? "").toUpperCase() === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    try {
      await apiOperacion("actualizarGrupoVendedores", { id: g.id, estado: nuevo });
      setInfo(`Grupo ${nuevo === "ACTIVO" ? "activado" : "desactivado"}.`);
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
        <h1 className="text-2xl font-extrabold">Grupos de vendedores</h1>
        <p className="text-sm text-slate-500 mt-1">Administra los grupos comerciales asociados a una vinculación activa entre proveedor y oficina de ventas.</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button>
        <button
          className="btn-green disabled:opacity-40"
          disabled={vincActivas.length === 0}
          title={vincActivas.length === 0 ? "Requiere al menos una vinculación activa" : "Nuevo grupo"}
          onClick={() => { setForm({ vinculacion_id: "", codigo_sap: "", nombre: "" }); setFormError(null); setShowNuevo(true); }}
        >
          + Nuevo grupo
        </button>
      </div>
    </div>

    {!loading && vincActivas.length === 0 && (
      <p className="mt-4 rounded-xl border-l-4 border-l-red-500 bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
        Debe existir al menos una vinculación activa entre proveedor y oficina antes de crear un grupo.
      </p>
    )}

    <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-[200px]">
        <label className="label">Buscar grupo</label>
        <input className="input" placeholder="ID, código SAP, grupo, proveedor u oficina" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div>
        <label className="label">Proveedor</label>
        <select className="input !w-auto" value={fProv} onChange={(e) => setFProv(e.target.value)}>
          <option value="TODOS">Todos los proveedores</option>
          {proveedores.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Oficina de ventas</label>
        <select className="input !w-auto" value={fOfi} onChange={(e) => setFOfi(e.target.value)}>
          <option value="TODAS">Todas las oficinas</option>
          {oficinas.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Estado</label>
        <select className="input !w-auto" value={fEst} onChange={(e) => setFEst(e.target.value)}>
          <option value="TODOS">Todos</option>
          <option value="ACTIVO">Activo</option>
          <option value="INACTIVO">Inactivo</option>
        </select>
      </div>
      <button className="btn-white !py-2" onClick={() => { setQ(""); setFProv("TODOS"); setFOfi("TODAS"); setFEst("TODOS"); }}>Limpiar filtros</button>
    </div>

    {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
    {info && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}

    {loading ? (
      <div className="card p-6 mt-4 text-sm text-[#0099D8]">Cargando grupos…</div>
    ) : filtrados.length === 0 ? (
      <div className="mt-4"><EmptyState titulo="Sin grupos" detalle="No hay grupos registrados con esos filtros." /></div>
    ) : (
      <div className="card mt-4">
        <div className="px-5 py-3 border-b font-semibold">Grupos registrados · {filtrados.length}</div>
        <div className="overflow-x-auto"><table className="tabla">
          <thead><tr><th>ID</th><th>CÓDIGO SAP</th><th>GRUPO</th><th>PROVEEDOR</th><th>OFICINA DE VENTAS</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
          <tbody>
            {filtrados.map((g) => {
              const activo = String(g.estado ?? "").toUpperCase() === "ACTIVO";
              return (
                <tr key={String(g.id)}>
                  <td className="font-mono text-xs">{String(g.id)}</td>
                  <td className="font-medium">{sapGrupo(g)}</td>
                  <td className="font-medium">{nombreGrupo(g)}</td>
                  <td>{g.proveedor ?? "—"}</td>
                  <td>{g.oficina ?? "—"}{g.oficina_sap ? <span className="block text-[11px] text-slate-400">{g.oficina_sap}</span> : null}</td>
                  <td>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {activo ? "ACTIVO" : "INACTIVO"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="btn-white !py-1 !px-3 text-xs mr-2" onClick={() => { setShowEditar({ ...g }); setFormError(null); }}>Editar</button>
                    <button className={`!py-1 !px-3 text-xs rounded-lg border font-semibold ${activo ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`} onClick={() => cambiarEstado(g)}>
                      {activo ? "Desactivar" : "Activar"}
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
              <h2 className="font-bold text-lg">Nuevo grupo de vendedores</h2>
              <p className="text-sm text-slate-500">El grupo queda ligado a una vinculación activa. Proveedor y oficina no se podrán editar después.</p>
            </div>
            <button className="btn-white !px-3" onClick={() => setShowNuevo(false)}>✕</button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="label">Vinculación proveedor ↔ oficina *</label>
              <select className="input" value={form.vinculacion_id} onChange={(e) => setForm({ ...form, vinculacion_id: e.target.value })}>
                <option value="">— Seleccionar vinculación activa —</option>
                {vincActivas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.proveedor ?? v.id} — {v.oficina ?? ""} ({v.id})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Solo se muestran vinculaciones activas. Para corregir una vinculación, desactívala y registra la combinación correcta.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">Código SAP del grupo *</label>
                <input className="input" value={form.codigo_sap} onChange={(e) => setForm({ ...form, codigo_sap: e.target.value.toUpperCase() })} placeholder="Ej. AMCA-GVE0002" />
              </div>
              <div>
                <label className="label">Nombre del grupo *</label>
                <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Grupo Ventas Norte" />
              </div>
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
            <button className="btn-green" onClick={guardarNuevo} disabled={saving}>{saving ? "Guardando…" : "Guardar grupo"}</button>
          </div>
        </div>
      </div>
    )}

    {showEditar && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="card w-full max-w-xl p-6 space-y-4">
          <h2 className="font-bold text-lg">Editar grupo · {showEditar.id}</h2>
          <p className="text-[11px] text-slate-400 -mt-2">Proveedor y oficina son inmutables.</p>
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={nombreGrupo(showEditar)} onChange={(e) => setShowEditar({ ...showEditar, nombre: e.target.value })} />
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
