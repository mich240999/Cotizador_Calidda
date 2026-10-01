"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState } from "@/components/Tablas";
import { AccActivar, AccDesactivar, AccEditar } from "@/components/Accion";

type Proveedor = {
  id: string | number;
  razon_social?: string | null;
  nombre?: string | null;
  nombre_comercial?: string | null;
  interlocutor?: string | null;
  contacto?: string | null;
  ruc?: string | null;
  correo?: string | null;
  email?: string | null;
  telefono?: string | null;
  estado?: string | null;
};

const razonDe = (p: Proveedor) =>
  String(p.razon_social ?? p.nombre ?? "").trim() || "—";
const interlocutorDe = (p: Proveedor) => p.interlocutor ?? p.contacto ?? null;
const correoDe = (p: Proveedor) => p.correo ?? p.email ?? null;

export default function ProveedoresPage() {
  const [rows, setRows] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showNuevo, setShowNuevo] = useState(false);
  const [showEditar, setShowEditar] = useState<Proveedor | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({
    nombre: "",
    ruc: "",
    interlocutor: "",
    nombre_comercial: "",
    email: "",
    telefono: "",
  });

  const cargar = async (texto?: string) => {
    setLoading(true);
    setError(null);
    try {
      const term = (texto ?? q).trim();
      const datos = await apiOperacion<unknown>("listarProveedoresSGT", {
        ...(term ? { q: term } : {}),
        limit: 200,
      });
      setRows(Array.isArray(datos) ? (datos as Proveedor[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((p) =>
      [razonDe(p), String(p.ruc ?? ""), String(interlocutorDe(p) ?? "")]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [rows, q]);

  const limpiar = () => {
    setQ("");
    setInfo(null);
    setError(null);
    void cargar("");
  };

  const guardarNuevo = async () => {
    setFormError(null);
    if (nuevo.nombre.trim().length < 2) {
      setFormError("La razón social es obligatoria.");
      return;
    }
    if (nuevo.interlocutor.trim().length < 2) {
      setFormError("El interlocutor es obligatorio.");
      return;
    }
    if (!/^\d{11}$/.test(nuevo.ruc.trim())) {
      setFormError("El RUC debe tener 11 dígitos.");
      return;
    }
    setSaving(true);
    try {
      await apiOperacion("crearProveedorSGT", {
        nombre: nuevo.nombre.trim(),
        ruc: nuevo.ruc.trim(),
        interlocutor: nuevo.interlocutor.trim(),
        ...(nuevo.nombre_comercial.trim()
          ? { nombre_comercial: nuevo.nombre_comercial.trim() }
          : {}),
        ...(nuevo.email.trim() ? { email: nuevo.email.trim() } : {}),
        ...(nuevo.telefono.trim() ? { telefono: nuevo.telefono.trim() } : {}),
      });
      setShowNuevo(false);
      setNuevo({
        nombre: "",
        ruc: "",
        interlocutor: "",
        nombre_comercial: "",
        email: "",
        telefono: "",
      });
      setInfo("Proveedor registrado correctamente.");
      await cargar(q);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setSaving(false);
    }
  };

  const guardarEdicion = async () => {
    if (!showEditar) return;
    setFormError(null);
    if (String(showEditar.interlocutor ?? showEditar.contacto ?? "").trim().length < 2) {
      setFormError("El interlocutor es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      await apiOperacion("actualizarProveedorSGT", {
        id: String(showEditar.id),
        ...(showEditar.nombre_comercial !== undefined
          ? { nombre_comercial: String(showEditar.nombre_comercial ?? "") }
          : {}),
        interlocutor: String(interlocutorDe(showEditar) ?? "").trim(),
        ...(correoDe(showEditar) !== undefined
          ? { email: String(correoDe(showEditar) ?? "") }
          : {}),
        ...(showEditar.telefono !== undefined
          ? { telefono: String(showEditar.telefono ?? "") }
          : {}),
      });
      setShowEditar(null);
      setInfo("Proveedor actualizado.");
      await cargar(q);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (p: Proveedor) => {
    const nuevoEstado =
      String(p.estado ?? "").toUpperCase() === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    setError(null);
    setInfo(null);
    try {
      await apiOperacion("actualizarProveedorSGT", {
        id: String(p.id),
        estado: nuevoEstado,
      });
      setInfo(
        `Proveedor ${nuevoEstado === "ACTIVO" ? "activado" : "desactivado"}.`
      );
      await cargar(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
    }
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
            title="Proveedores"
            actions={
              <>
                <button className="btn-white" onClick={() => void cargar()} disabled={loading}>
                  {loading ? "Actualizando…" : "Actualizar"}
                </button>
                <button
                  className="btn-green"
                  onClick={() => {
                    setNuevo({
                      nombre: "",
                      ruc: "",
                      interlocutor: "",
                      nombre_comercial: "",
                      email: "",
                      telefono: "",
                    });
                    setFormError(null);
                    setShowNuevo(true);
                  }}
                >
                  + Nuevo proveedor
                </button>
              </>
            }
          />
        </div>

        <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="label">Buscar proveedor</label>
            <input
              className="input"
              placeholder="Razón social, RUC o interlocutor…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void cargar();
              }}
            />
          </div>
          <button className="btn-white !py-2" onClick={() => void cargar()} disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </button>
          <button className="btn-white !py-2" onClick={limpiar}>
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
          <div className="card p-10 mt-4 text-center text-slate-500">
            Cargando proveedores…
          </div>
        ) : filtrados.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              titulo="Sin proveedores"
              detalle="No hay proveedores que coincidan con el filtro. Ajusta la búsqueda o registra uno nuevo."
            />
          </div>
        ) : (
          <div className="table-wrap mt-4">
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>RUC</th>
                  <th>RAZÓN SOCIAL</th>
                  <th>NOMBRE COMERCIAL</th>
                  <th>INTERLOCUTOR</th>
                  <th>CORREO</th>
                  <th>TELÉFONO</th>
                  <th>ESTADO</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const activa = String(p.estado ?? "").toUpperCase() === "ACTIVO";
                  return (
                    <tr key={String(p.id)}>
                      <td className="font-mono text-xs">{String(p.id)}</td>
                      <td className="font-mono text-xs">{p.ruc ?? "—"}</td>
                      <td className="font-medium">{razonDe(p)}</td>
                      <td>{p.nombre_comercial || "—"}</td>
                      <td>{interlocutorDe(p) ?? "—"}</td>
                      <td>{correoDe(p) ?? "—"}</td>
                      <td>{p.telefono ?? "—"}</td>
                      <td>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            activa
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {activa ? "ACTIVO" : "INACTIVO"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1.5">
                          <AccEditar
                            title="Editar proveedor"
                            onClick={() => {
                              setShowEditar({ ...p });
                              setFormError(null);
                            }}
                          />
                          {activa ? (
                            <AccDesactivar
                              title="Desactivar proveedor"
                              onClick={() => void cambiarEstado(p)}
                            />
                          ) : (
                            <AccActivar
                              title="Activar proveedor"
                              onClick={() => void cambiarEstado(p)}
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
        )}

        {showNuevo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl p-6">
              <h2 className="text-lg font-extrabold">Nuevo proveedor</h2>
              <p className="text-[11px] text-slate-400 mt-1">
                Si el RUC o el interlocutor ya existen, el registro se rechaza (409).
              </p>
              <div className="grid md:grid-cols-2 gap-3 mt-4">
                <div className="md:col-span-2">
                  <label className="label">Razón social *</label>
                  <input
                    className="input"
                    value={nuevo.nombre}
                    onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                    placeholder="Ej. Proveedora del Sur S.A.C."
                  />
                </div>
                <div>
                  <label className="label">Interlocutor *</label>
                  <input
                    className="input"
                    value={nuevo.interlocutor}
                    onChange={(e) => setNuevo({ ...nuevo, interlocutor: e.target.value })}
                    placeholder="Nombre del interlocutor"
                  />
                </div>
                <div>
                  <label className="label">RUC (11 dígitos) *</label>
                  <input
                    className="input"
                    maxLength={11}
                    value={nuevo.ruc}
                    onChange={(e) =>
                      setNuevo({ ...nuevo, ruc: e.target.value.replace(/\D/g, "") })
                    }
                    placeholder="20123456789"
                  />
                  {nuevo.ruc && nuevo.ruc.length !== 11 && (
                    <p className="text-[11px] text-red-500 mt-1">
                      El RUC debe tener 11 dígitos.
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="label">Nombre comercial</label>
                  <input
                    className="input"
                    value={nuevo.nombre_comercial}
                    onChange={(e) =>
                      setNuevo({ ...nuevo, nombre_comercial: e.target.value })
                    }
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <label className="label">Correo</label>
                  <input
                    className="input"
                    value={nuevo.email}
                    onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
                    placeholder="contacto@proveedor.com"
                  />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input
                    className="input"
                    value={nuevo.telefono}
                    onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
              </div>
              {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
              <div className="flex gap-2 mt-5">
                <button className="btn-white flex-1" onClick={() => setShowNuevo(false)}>
                  Cancelar
                </button>
                <button
                  className="btn-green flex-1"
                  onClick={() => void guardarNuevo()}
                  disabled={saving}
                >
                  {saving ? "Guardando…" : "Registrar proveedor"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showEditar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl p-6">
              <h2 className="text-lg font-extrabold">
                Editar proveedor · {String(showEditar.id)}
              </h2>
              <p className="text-[11px] text-slate-400 mt-1">
                RUC <span className="font-mono font-bold">{showEditar.ruc ?? "—"}</span> y
                razón social <span className="font-bold">{razonDe(showEditar)}</span> son
                inmutables.
              </p>
              <div className="grid md:grid-cols-2 gap-3 mt-4">
                <div className="md:col-span-2">
                  <label className="label">Nombre comercial</label>
                  <input
                    className="input"
                    value={showEditar.nombre_comercial ?? ""}
                    onChange={(e) =>
                      setShowEditar({ ...showEditar, nombre_comercial: e.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Interlocutor *</label>
                  <input
                    className="input"
                    value={String(interlocutorDe(showEditar) ?? "")}
                    onChange={(e) =>
                      setShowEditar({ ...showEditar, interlocutor: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">Correo</label>
                  <input
                    className="input"
                    value={String(correoDe(showEditar) ?? "")}
                    onChange={(e) =>
                      setShowEditar({ ...showEditar, correo: e.target.value, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input
                    className="input"
                    value={showEditar.telefono ?? ""}
                    onChange={(e) =>
                      setShowEditar({ ...showEditar, telefono: e.target.value })
                    }
                  />
                </div>
              </div>
              {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
              <div className="flex gap-2 mt-5">
                <button className="btn-white flex-1" onClick={() => setShowEditar(null)}>
                  Cancelar
                </button>
                <button
                  className="btn-green flex-1"
                  onClick={() => void guardarEdicion()}
                  disabled={saving}
                >
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Shell>
    </AuthGate>
  );
}
