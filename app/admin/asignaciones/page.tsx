"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState } from "@/components/Tablas";
import { AccActivar, AccDesactivar, AccEditar } from "@/components/Accion";

type Asignacion = {
  id: string;
  id_asesor: string;
  id_supervisor?: string | null;
  id_proveedor?: string | null;
  id_oficina?: string | null;
  id_grupo?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  estado?: string | null;
  asesor_nombre?: string | null;
  supervisor_nombre?: string | null;
  proveedor_nombre?: string | null;
  oficina_nombre?: string | null;
  grupo_nombre?: string | null;
};

type Usuario = {
  id: string;
  nombre?: string | null;
  rol?: string | null;
  rol_codigo?: string | null;
};

type Proveedor = { id: string; nombre?: string | null; razon_social?: string | null };
type Oficina = { id: string; nombre?: string | null; codigo_sap?: string | null; codigo?: string | null };
type Grupo = { id: string; nombre?: string | null; grupo?: string | null };

const ESTADOS = ["VIGENTE", "PROGRAMADA", "FINALIZADA", "CANCELADA"] as const;

const normEstado = (a: Pick<Asignacion, "estado">) =>
  String(a.estado ?? "VIGENTE").toUpperCase();

const normRol = (u: Usuario) => String(u.rol ?? u.rol_codigo ?? "").toUpperCase();
const nombreUsuario = (u: Usuario) => u.nombre ?? u.id;
const nombreProveedor = (p: Proveedor) => p.nombre ?? p.razon_social ?? p.id;
const nombreOficina = (o: Oficina) => o.nombre ?? o.id;
const nombreGrupo = (g: Grupo) => g.nombre ?? g.grupo ?? g.id;

/** yyyy-mm-dd → dd.mm.yyyy para mostrar; si ya viene en otro formato se deja igual. */
const fmtFecha = (v?: string | null) => {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
};

const esErrorMigracion = (msg: string) =>
  /seg_asignaciones|migraci[oó]n|does not exist|could not find the table|42P01|schema cache/i.test(msg);

const FORM_INICIAL = {
  id_asesor: "",
  id_supervisor: "",
  id_proveedor: "",
  id_oficina: "",
  id_grupo: "",
  fecha_inicio: "",
  fecha_fin: "",
  estado: "VIGENTE",
};

export default function AsignacionesPage() {
  const [rows, setRows] = useState<Asignacion[]>([]);
  const [asesores, setAsesores] = useState<Usuario[]>([]);
  const [supervisores, setSupervisores] = useState<Usuario[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(0);
  const [modo, setModo] = useState<"nuevo" | "editar" | null>(null);
  const [editando, setEditando] = useState<Asignacion | null>(null);
  const [form, setForm] = useState({ ...FORM_INICIAL });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarAsignaciones", { limit: 200 });
      setRows(Array.isArray(datos) ? (datos as Asignacion[]) : []);
      // Selects (best-effort: no rompen el listado si fallan).
      const [us, prv, ofi, gru] = await Promise.all([
        apiOperacion<unknown>("listarUsuariosSGT", { limit: 500 }).catch(() => []),
        apiOperacion<unknown>("listarProveedoresSGT", { limit: 500 }).catch(() => []),
        apiOperacion<unknown>("listarOficinasVentas", { limit: 500 }).catch(() => []),
        apiOperacion<unknown>("listarGruposVendedores", { limit: 500 }).catch(() => []),
      ]);
      const usuarios = (Array.isArray(us) ? (us as Usuario[]) : []).filter((u) => u?.id);
      setAsesores(usuarios.filter((u) => normRol(u) === "ASESOR"));
      setSupervisores(usuarios.filter((u) => normRol(u) === "SUPERVISOR"));
      setProveedores(Array.isArray(prv) ? (prv as Proveedor[]) : []);
      setOficinas(Array.isArray(ofi) ? (ofi as Oficina[]) : []);
      setGrupos(Array.isArray(gru) ? (gru as Grupo[]) : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo cargar";
      setError(
        esErrorMigracion(msg)
          ? `${msg} — Ejecute supabase/migracion_admin_crud_01.sql para crear la tabla seg_asignaciones_asesores.`
          : msg
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conteos = useMemo(() => {
    const c: Record<string, number> = { VIGENTE: 0, PROGRAMADA: 0, FINALIZADA: 0, CANCELADA: 0 };
    for (const a of rows) {
      const e = normEstado(a);
      c[e] = (c[e] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const visibles = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((a) => {
      if (normEstado(a) !== ESTADOS[tab]) return false;
      if (!s) return true;
      const hay = [
        a.id,
        a.id_asesor,
        a.asesor_nombre ?? "",
        a.supervisor_nombre ?? "",
        a.proveedor_nombre ?? "",
        a.oficina_nombre ?? "",
        a.grupo_nombre ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q, tab]);

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ ...FORM_INICIAL });
    setFormError(null);
    setModo("nuevo");
  };

  const abrirEditar = (a: Asignacion) => {
    setEditando(a);
    setForm({
      id_asesor: a.id_asesor ?? "",
      id_supervisor: a.id_supervisor ?? "",
      id_proveedor: a.id_proveedor ?? "",
      id_oficina: a.id_oficina ?? "",
      id_grupo: a.id_grupo ?? "",
      fecha_inicio: (a.fecha_inicio ?? "").slice(0, 10),
      fecha_fin: (a.fecha_fin ?? "") ? String(a.fecha_fin).slice(0, 10) : "",
      estado: normEstado(a),
    });
    setFormError(null);
    setModo("editar");
  };

  const guardarNuevo = async () => {
    setFormError(null);
    if (!form.id_asesor) {
      setFormError("Selecciona el asesor (obligatorio).");
      return;
    }
    if (!form.fecha_inicio) {
      setFormError("La fecha de inicio es obligatoria (dd.mm.yyyy o yyyy-mm-dd).");
      return;
    }
    setSaving(true);
    try {
      await apiOperacion("crearAsignacion", {
        id_asesor: form.id_asesor,
        id_supervisor: form.id_supervisor || null,
        id_proveedor: form.id_proveedor || null,
        id_oficina: form.id_oficina || null,
        id_grupo: form.id_grupo || null,
        fecha_inicio: form.fecha_inicio.trim(),
        fecha_fin: form.fecha_fin.trim() || null,
        estado: form.estado,
      });
      setModo(null);
      setInfo("Asignación creada correctamente.");
      await cargar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar";
      setFormError(
        esErrorMigracion(msg)
          ? `${msg} — Ejecute supabase/migracion_admin_crud_01.sql para crear la tabla seg_asignaciones_asesores.`
          : msg
      );
    } finally {
      setSaving(false);
    }
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    setFormError(null);
    setSaving(true);
    try {
      await apiOperacion("actualizarAsignacion", {
        id: editando.id,
        id_supervisor: form.id_supervisor || null,
        id_proveedor: form.id_proveedor || null,
        id_oficina: form.id_oficina || null,
        id_grupo: form.id_grupo || null,
        fecha_inicio: form.fecha_inicio.trim() || undefined,
        fecha_fin: form.fecha_fin.trim() ? form.fecha_fin.trim() : null,
        estado: form.estado,
      });
      setModo(null);
      setEditando(null);
      setInfo("Asignación actualizada. El asesor es inmutable.");
      await cargar();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (a: Asignacion, nuevo: string) => {
    try {
      await apiOperacion("actualizarAsignacion", { id: a.id, estado: nuevo });
      setInfo(`Asignación ${a.id} → ${nuevo}.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
    }
  };

  const badge = (estado: string) => {
    const map: Record<string, string> = {
      VIGENTE: "bg-emerald-50 text-emerald-700 border-emerald-200",
      PROGRAMADA: "bg-blue-50 text-blue-700 border-blue-200",
      FINALIZADA: "bg-slate-100 text-slate-600 border-slate-200",
      CANCELADA: "bg-red-50 text-red-700 border-red-200",
    };
    return map[estado] ?? "bg-slate-100 text-slate-600 border-slate-200";
  };

  return (
    <AuthGate>
      <Shell>
        <Link href="/admin" className="text-xs font-bold text-[#0099D8]">
          ← Consola administrativa
        </Link>
        <div className="mt-1">
          <ModHead
            eyebrow="CONSOLA ADMINISTRATIVA"
            title="Asignaciones de asesores"
            desc="Vigencias de asesores con su supervisor y estructura comercial. Requiere supabase/migracion_admin_crud_01.sql."
            actions={
              <>
                <button className="btn-white" onClick={cargar} disabled={loading}>
                  {loading ? "Actualizando…" : "Actualizar"}
                </button>
                <button className="btn-green" onClick={abrirNuevo}>
                  + Nueva asignación
                </button>
              </>
            }
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {ESTADOS.map((e, i) => (
            <button
              key={e}
              onClick={() => setTab(i)}
              className={`card p-4 text-left transition ${
                tab === i ? "ring-2 ring-[#0099D8]" : "hover:shadow-md"
              }`}
            >
              <p className="text-[11px] font-extrabold tracking-widest text-slate-400">
                {e === "VIGENTE"
                  ? "VIGENTES"
                  : e === "PROGRAMADA"
                    ? "PROGRAMADAS"
                    : e === "FINALIZADA"
                      ? "FINALIZADAS"
                      : "CANCELADAS"}
              </p>
              <p className="text-2xl font-extrabold">{conteos[e] ?? 0}</p>
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-3 flex-wrap">
          {ESTADOS.map((e, i) => (
            <button
              key={e}
              onClick={() => setTab(i)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                i === tab ? "bg-[#0099D8] text-white" : "bg-white border text-slate-600"
              }`}
            >
              {e} ({conteos[e] ?? 0})
            </button>
          ))}
        </div>

        <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Buscar</label>
            <input
              className="input"
              placeholder="ID, asesor, supervisor, proveedor, oficina o grupo"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button
            className="btn-white !py-2"
            onClick={() => {
              setQ("");
            }}
          >
            Limpiar
          </button>
        </div>

        {error && (
          <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>
        )}
        {info && (
          <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">
            {info}
          </p>
        )}

        {loading ? (
          <div className="card p-6 mt-4 text-sm text-[#0099D8]">Cargando asignaciones…</div>
        ) : visibles.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              titulo="Sin asignaciones"
              detalle={
                rows.length === 0
                  ? "No hay asignaciones registradas. Si la tabla aún no existe, ejecute supabase/migracion_admin_crud_01.sql."
                  : "No hay asignaciones en esta bandeja con esos filtros."
              }
            />
          </div>
        ) : (
          <div className="card mt-4">
            <div className="px-5 py-3 border-b font-semibold">
              Asignaciones {ESTADOS[tab]} · {visibles.length}
            </div>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>ASESOR</th>
                    <th>SUPERVISOR</th>
                    <th>ESTRUCTURA</th>
                    <th>PERIODO</th>
                    <th>ESTADO</th>
                    <th>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((a) => {
                    const est = normEstado(a);
                    const cerrada = est === "CANCELADA" || est === "FINALIZADA";
                    const estructura = [
                      a.proveedor_nombre,
                      a.oficina_nombre,
                      a.grupo_nombre,
                    ].filter(Boolean);
                    return (
                      <tr key={String(a.id)}>
                        <td className="font-mono text-xs">{a.id}</td>
                        <td className="font-medium">
                          {a.asesor_nombre ?? a.id_asesor}
                          <span className="block text-[11px] text-slate-400 font-mono">
                            {a.id_asesor}
                          </span>
                        </td>
                        <td>{a.supervisor_nombre ?? a.id_supervisor ?? "—"}</td>
                        <td>
                          {estructura.length > 0 ? (
                            estructura.map((x) => (
                              <span key={String(x)} className="block text-xs">
                                {x}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-xs">
                          {fmtFecha(a.fecha_inicio)}
                          {" → "}
                          {a.fecha_fin ? fmtFecha(a.fecha_fin) : "abierto"}
                        </td>
                        <td>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${badge(est)}`}
                          >
                            {est}
                          </span>
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="flex gap-1.5">
                            <AccEditar
                              title={`Editar asignación ${a.id}`}
                              onClick={() => abrirEditar(a)}
                            />
                            {cerrada ? (
                              <AccActivar
                                title={`Reactivar asignación ${a.id} (→ VIGENTE)`}
                                onClick={() => cambiarEstado(a, "VIGENTE")}
                              />
                            ) : (
                              <AccDesactivar
                                title={`Cancelar asignación ${a.id} (→ CANCELADA)`}
                                onClick={() => cambiarEstado(a, "CANCELADA")}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {modo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="card w-full max-w-2xl p-0 overflow-hidden">
              <div className="flex items-start justify-between px-6 py-4 border-b bg-slate-50">
                <div>
                  <h2 className="font-bold text-lg">
                    {modo === "nuevo"
                      ? "Nueva asignación"
                      : `Editar asignación · ${editando?.id ?? ""}`}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {modo === "nuevo"
                      ? "El asesor queda fijo tras guardar (inmutable)."
                      : "El asesor es inmutable; el estado también se cambia desde el listado."}
                  </p>
                </div>
                <button className="btn-white !px-3" onClick={() => setModo(null)}>
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Asesor *</label>
                    {modo === "nuevo" ? (
                      <select
                        className="input"
                        value={form.id_asesor}
                        onChange={(e) => setForm({ ...form, id_asesor: e.target.value })}
                      >
                        <option value="">— Seleccionar asesor —</option>
                        {asesores.map((u) => (
                          <option key={u.id} value={u.id}>
                            {nombreUsuario(u)} ({u.id})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input bg-slate-50"
                        disabled
                        value={`${editando?.asesor_nombre ?? ""} (${form.id_asesor})`}
                      />
                    )}
                  </div>
                  <div>
                    <label className="label">Supervisor</label>
                    <select
                      className="input"
                      value={form.id_supervisor}
                      onChange={(e) => setForm({ ...form, id_supervisor: e.target.value })}
                    >
                      <option value="">— Sin supervisor —</option>
                      {supervisores.map((u) => (
                        <option key={u.id} value={u.id}>
                          {nombreUsuario(u)} ({u.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Proveedor</label>
                    <select
                      className="input"
                      value={form.id_proveedor}
                      onChange={(e) => setForm({ ...form, id_proveedor: e.target.value })}
                    >
                      <option value="">— Ninguno —</option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {nombreProveedor(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Oficina de ventas</label>
                    <select
                      className="input"
                      value={form.id_oficina}
                      onChange={(e) => setForm({ ...form, id_oficina: e.target.value })}
                    >
                      <option value="">— Ninguna —</option>
                      {oficinas.map((o) => (
                        <option key={o.id} value={o.id}>
                          {nombreOficina(o)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Grupo de vendedores</label>
                    <select
                      className="input"
                      value={form.id_grupo}
                      onChange={(e) => setForm({ ...form, id_grupo: e.target.value })}
                    >
                      <option value="">— Ninguno —</option>
                      {grupos.map((g) => (
                        <option key={g.id} value={g.id}>
                          {nombreGrupo(g)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Fecha inicio *</label>
                    <input
                      type="date"
                      className="input"
                      value={form.fecha_inicio}
                      onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Fecha fin</label>
                    <input
                      type="date"
                      className="input"
                      value={form.fecha_fin}
                      onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Estado</label>
                    <select
                      className="input"
                      value={form.estado}
                      onChange={(e) => setForm({ ...form, estado: e.target.value })}
                    >
                      {ESTADOS.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {formError && (
                  <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">
                    {formError}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
                <button className="btn-white" onClick={() => setModo(null)}>
                  Cancelar
                </button>
                <button
                  className="btn-green"
                  onClick={modo === "nuevo" ? guardarNuevo : guardarEdicion}
                  disabled={saving}
                >
                  {saving ? "Guardando…" : modo === "nuevo" ? "Crear asignación" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Shell>
    </AuthGate>
  );
}
