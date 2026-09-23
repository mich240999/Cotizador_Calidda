"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Usuario = {
  id: string;
  email?: string;
  nombre?: string;
  documento?: string;
  telefono?: string;
  rol?: string;
  roles?: { nombre?: string } | { nombre?: string }[] | null;
  proveedor?: string | null;
  activo?: boolean;
  created_at?: string;
};

function rolDe(u: Usuario): string {
  if (u.rol) return String(u.rol);
  const r = u.roles;
  if (!r) return "—";
  if (Array.isArray(r)) return String(r[0]?.nombre ?? "—");
  return String(r.nombre ?? "—");
}

function NuevoUsuarioModal({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("asesor");
  const [password, setPassword] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setError(null);
    if (!email.trim()) {
      setError("El correo es obligatorio");
      return;
    }
    setGuardando(true);
    try {
      await apiOperacion("adminCrearUsuario", {
        email: email.trim(),
        nombre: nombre.trim() || email.trim(),
        rol,
        ...(password ? { password } : {}),
      });
      onGuardado();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-extrabold">Nuevo usuario</h2>
        <div className="grid md:grid-cols-2 gap-3 mt-4">
          <div className="md:col-span-2"><label className="label">Nombre completo</label><input className="input" placeholder="Nombres y apellidos" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div><label className="label">Correo</label><input className="input" placeholder="usuario@empresa.pe" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="label">Contraseña (opcional, mín. 8)</label><input className="input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div><label className="label">Rol</label><select className="input" value={rol} onChange={(e) => setRol(e.target.value)}><option value="admin">admin</option><option value="asesor">asesor</option><option value="oficina">oficina</option></select></div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Registrar usuario"}</button>
        </div>
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [editRol, setEditRol] = useState("");

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("adminListarUsuarios", {});
      setRows(Array.isArray(datos) ? (datos as Usuario[]) : []);
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

  const cambiarActivo = async (u: Usuario, activo: boolean) => {
    setAccionando(u.id);
    setError(null);
    try {
      await apiOperacion("adminActualizarUsuario", { user_id: u.id, activo });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setAccionando(null);
    }
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    setAccionando(editando.id);
    setError(null);
    try {
      await apiOperacion("adminActualizarUsuario", { user_id: editando.id, rol: editRol });
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setAccionando(null);
    }
  };

  return (
    <AuthGate><Shell>
      <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
      <div className="flex items-center justify-between mt-1">
        <h1 className="text-2xl font-extrabold">Usuarios</h1>
        <div className="flex gap-2">
          <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
          <button className="btn-green" onClick={() => setOpen(true)}>+ Nuevo usuario</button>
        </div>
      </div>
      {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
      {loading ? (
        <div className="card p-10 mt-4 text-center text-slate-500">Cargando usuarios…</div>
      ) : rows.length === 0 ? (
        <div className="mt-4"><EmptyState titulo="Sin usuarios" detalle="No hay usuarios registrados en el backend." /></div>
      ) : (
        <div className="table-wrap mt-4">
          <table className="tabla">
            <thead><tr><th>ID</th><th>USUARIO</th><th>DOCUMENTO</th><th>CORREO</th><th>TELÉFONO</th><th>ROL</th><th>PROVEEDOR</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="font-mono text-xs">{u.id.slice(0, 8)}</td>
                  <td>{u.nombre ?? "—"}</td>
                  <td>{u.documento ?? "—"}</td>
                  <td>{u.email ?? "—"}</td>
                  <td>{u.telefono ?? "—"}</td>
                  <td>{rolDe(u)}</td>
                  <td>{u.proveedor ?? "—"}</td>
                  <td>{u.activo === false ? "Inactivo" : "Activo"}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn-white !py-1 !px-2 !text-xs"
                        disabled={accionando === u.id}
                        onClick={() => { setEditando(u); setEditRol(rolDe(u) === "—" ? "asesor" : rolDe(u)); }}
                      >Editar</button>
                      {u.activo === false ? (
                        <button className="btn-white !py-1 !px-2 !text-xs" disabled={accionando === u.id} onClick={() => cambiarActivo(u, true)}>
                          {accionando === u.id ? "…" : "Activar"}
                        </button>
                      ) : (
                        <button className="btn-white !py-1 !px-2 !text-xs" disabled={accionando === u.id} onClick={() => cambiarActivo(u, false)}>
                          {accionando === u.id ? "…" : "Desactivar"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <NuevoUsuarioModal onClose={() => setOpen(false)} onGuardado={cargar} />}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-extrabold">Editar rol</h2>
            <p className="text-xs text-slate-500 mt-1">{editando.email ?? editando.id}</p>
            <div className="mt-4"><label className="label">Rol</label>
              <select className="input" value={editRol} onChange={(e) => setEditRol(e.target.value)}>
                <option value="admin">admin</option>
                <option value="asesor">asesor</option>
                <option value="oficina">oficina</option>
              </select>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-white flex-1" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn-green flex-1" onClick={guardarEdicion} disabled={accionando === editando.id}>{accionando === editando.id ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </Shell></AuthGate>
  );
}
