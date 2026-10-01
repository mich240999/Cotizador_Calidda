"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Rol = {
  codigo?: string;
  nombre?: string;
  descripcion?: string | null;
  nivel?: number | null;
  alcance?: string | null;
  estado?: string | null;
  usuarios_activos?: number | null;
};

const codDe = (r: Rol) => String(r.codigo ?? r.nombre ?? "—").toUpperCase();

function RolModal({ initial, onClose, onGuardado }: { initial: Rol | null; onClose: () => void; onGuardado: () => void }) {
  const editando = !!initial;
  const [codigo, setCodigo] = useState(initial ? codDe(initial) : "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [nivel, setNivel] = useState(String(initial?.nivel ?? 60));
  const [alcance, setAlcance] = useState(String(initial?.alcance ?? "PROPIO"));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setError(null);
    if (!editando && !codigo.trim()) { setError("El código es obligatorio (ej. VENTAS)."); return; }
    setGuardando(true);
    try {
      if (editando && initial) {
        await apiOperacion("actualizarRolSGT", {
          codigo: codDe(initial),
          descripcion: descripcion.trim(),
          nivel: Number(nivel),
          alcance: alcance.trim(),
        });
      } else {
        await apiOperacion("crearRolSGT", {
          codigo: codigo.trim(),
          descripcion: descripcion.trim(),
          nivel: Number(nivel),
          alcance: alcance.trim(),
        });
      }
      onGuardado();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar (¿ejecutaste migracion_roles_01.sql?)");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-extrabold">{editando ? `Editar rol · ${initial ? codDe(initial) : ""}` : "Nuevo rol"}</h2>
        <p className="text-xs text-slate-500 mt-1">{editando ? "El código es inmutable (lo usa la matriz de permisos)." : "Define código, nivel y alcance. Luego asigna sus permisos en Permisos."}</p>
        <div className="grid md:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="label">Código *</label>
            <input className="input font-mono" placeholder="Ej. VENTAS" value={codigo} disabled={editando} onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">Nivel (1-100)</label>
            <input type="number" min={1} max={100} className="input" value={nivel} onChange={(e) => setNivel(e.target.value)} />
          </div>
          <div>
            <label className="label">Alcance</label>
            <select className="input" value={alcance} onChange={(e) => setAlcance(e.target.value)}>
              {["GLOBAL", "EMPRESA", "EQUIPO", "PROPIO"].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Descripción</label>
            <input className="input" placeholder="Ej. Equipo de ventas" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
        </div>
        {error && <p className="mt-3 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear rol"}</button>
        </div>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const [rows, setRows] = useState<Rol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { mode: "nuevo" } | { mode: "editar"; r: Rol }>(null);
  const [accionando, setAccionando] = useState<string | null>(null);

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

  const cambiarEstado = async (r: Rol) => {
    const cod = codDe(r);
    const nuevo = String(r.estado ?? "").toUpperCase() === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    setAccionando(cod);
    try {
      await apiOperacion("actualizarRolSGT", { codigo: cod, estado: nuevo });
      setInfo(`Rol ${nuevo === "ACTIVO" ? "activado" : "desactivado"}.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setAccionando(null);
    }
  };

  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="mt-1"><ModHead
      eyebrow="CONSOLA ADMINISTRATIVA"
      title="Roles"
      desc="Define la jerarquía y el alcance de los perfiles. Los permisos por función se administran en Permisos."
      actions={<>
        <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
        <button className="btn-green" onClick={() => setModal({ mode: "nuevo" })}>+ Nuevo rol</button>
      </>}
    /></div>
    {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
    {info && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}
    {loading ? (
      <div className="card p-10 mt-4 text-center text-slate-500">Cargando roles…</div>
    ) : rows.length === 0 ? (
      <div className="mt-4"><EmptyState titulo="Sin roles" detalle="No hay roles en el backend." /></div>
    ) : (
      <div className="grid md:grid-cols-2 gap-4 mt-4">{rows.map((r) => {
        const cod = codDe(r);
        const activo = String(r.estado ?? "ACTIVO").toUpperCase() === "ACTIVO";
        return (
          <div key={cod} className="card p-5">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-extrabold">{cod}</p>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {activo ? "ACTIVO" : "INACTIVO"}
              </span>
              <span className="ml-auto text-[11px] text-slate-400">Nivel {r.nivel ?? "—"} · {String(r.alcance ?? "—")}</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">{r.descripcion || "Rol del sistema."}</p>
            <p className="text-xs text-slate-400 mt-1">{r.usuarios_activos ?? 0} usuarios activos</p>
            <div className="flex gap-2 mt-3">
              <button className="btn-white !py-1.5 !text-xs" disabled={accionando === cod} onClick={() => setModal({ mode: "editar", r })}>Editar</button>
              <button
                className={`!py-1.5 !text-xs rounded-xl border font-semibold px-4 ${activo ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                disabled={accionando === cod}
                onClick={() => cambiarEstado(r)}
              >{accionando === cod ? "…" : activo ? "Desactivar" : "Activar"}</button>
              <Link href="/admin/permisos" className="btn-white !py-1.5 !text-xs !no-underline ml-auto">Permisos →</Link>
            </div>
          </div>
        );
      })}</div>
    )}
    {modal?.mode === "nuevo" && (
      <RolModal initial={null} onClose={() => setModal(null)} onGuardado={() => { setInfo("Rol creado. Asigna sus permisos en Permisos."); cargar(); }} />
    )}
    {modal?.mode === "editar" && (
      <RolModal initial={modal.r} onClose={() => setModal(null)} onGuardado={() => { setInfo("Rol actualizado."); cargar(); }} />
    )}
  </Shell></AuthGate>);
}
