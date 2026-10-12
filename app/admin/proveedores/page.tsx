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

function CargaMasivaModal({ onClose, onProcesado }: { onClose: () => void; onProcesado: () => void }) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const CAB = ["PROVEEDOR", "BP PROVEEDOR", "OFICINA DE VENTA", "GRUPO DE VENDEDORES"];
  const EJEMPLO = ["EJEMPLO S.A.C.", "1000001", "AMCA", "G01"];

  const descargarCSV = () => {
    const csv = `${CAB.join(";")}\n${EJEMPLO.join(";")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla_proveedores.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const descargarXLSX = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([CAB, EJEMPLO]);
    ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proveedores");
    XLSX.writeFile(wb, "plantilla_proveedores.xlsx");
  };

  const leerArchivo = async (f: File) => {
    setMsg(null); setResultado(null);
    setArchivo(f.name);
    try {
      if (/\.(xlsx|xls)$/i.test(f.name) || f.type.includes("spreadsheet") || f.type.includes("excel")) {
        const XLSX = await import("xlsx");
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ";" });
        setTexto(csv.trim());
      } else {
        setTexto((await f.text()).trim());
      }
    } catch (e) {
      setMsg(e instanceof Error ? `No se pudo leer: ${e.message}` : "No se pudo leer el archivo");
    }
  };

  const validar = () => {
    setMsg(null); setResultado(null);
    if (!texto.trim()) { setMsg("Selecciona o arrastra un archivo CSV/XLSX primero."); return; }
    const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lineas.length < 2) { setMsg("Archivo vacío."); return; }
    const sep = (lineas[0].match(/;/g) ?? []).length >= (lineas[0].match(/,/g) ?? []).length ? ";" : ",";
    const cols = lineas[0].split(sep).length;
    const filas = lineas.length - 1;
    if (filas > 500) { setMsg(`Máximo 500 filas (archivo trae ${filas}).`); return; }
    if (cols < CAB.length) { setMsg(`Columnas insuficientes: se esperan ${CAB.length} (${CAB.join(";")}).`); return; }
    setResultado(`Archivo válido: ${filas} filas · ${cols} columnas.`);
  };

  const procesar = async () => {
    setMsg(null); setResultado(null);
    if (!texto.trim()) { setMsg("Selecciona o arrastra un archivo CSV/XLSX primero."); return; }
    setTrabajando(true);
    try {
      const r = await apiOperacion<{ total?: number; insertadas?: number; vinculadas?: number; errores?: string[] }>("cargaMasivaProveedores", { csv: texto });
      const errs = r?.errores ?? [];
      setResultado(`Total ${r?.total ?? 0} · insertadas ${r?.insertadas ?? 0} · vinculadas ${r?.vinculadas ?? 0}.${errs.length > 0 ? `\nErrores:\n${errs.slice(0, 10).join("\n")}${errs.length > 10 ? `\n…y ${errs.length - 10} más` : ""}` : ""}`);
      onProcesado();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo procesar");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-6 overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="font-bold text-lg">Carga masiva de proveedores</h2>
            <p className="text-sm text-slate-500">CSV o XLSX con cabeceras {CAB.join(";")}. Máximo 500 filas.</p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold text-sm">1. Preparar archivo</p>
                <p className="text-xs text-slate-500">Conserva las cabeceras sin cambios.</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-white !text-xs" onClick={descargarCSV}>Plantilla CSV</button>
                <button className="btn-white !text-xs" onClick={descargarXLSX}>Plantilla XLSX</button>
              </div>
            </div>
            <label
              className="mt-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center cursor-pointer hover:border-[#0099D8]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) leerArchivo(f); }}
            >
              <p className="font-bold text-sm">Selecciona o arrastra un archivo CSV / XLSX</p>
              <p className="text-xs text-slate-500 mt-1">XLSX se convierte a CSV con separador ;.</p>
              <span className="btn-white !text-xs mt-3">Seleccionar archivo</span>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) leerArchivo(f); }} />
            </label>
            {archivo && <p className="text-[11px] text-slate-500 mt-2">Seleccionado: {archivo}</p>}
          </div>
          {msg && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
          {resultado && <p className="text-sm rounded-lg bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 whitespace-pre-line">{resultado}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>Cancelar</button>
          <button className="btn-white !text-[#0099D8]" onClick={validar} disabled={trabajando}>{trabajando ? "Validando…" : "Validar"}</button>
          <button className="btn-green" onClick={procesar} disabled={trabajando}>{trabajando ? "Procesando…" : "Procesar"}</button>
        </div>
      </div>
    </div>
  );
}

export default function ProveedoresPage() {
  const [rows, setRows] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showNuevo, setShowNuevo] = useState(false);
  const [showCarga, setShowCarga] = useState(false);
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
                <button className="btn-white" onClick={() => setShowCarga(true)}>
                  Carga masiva
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

        {showCarga && (
          <CargaMasivaModal onClose={() => setShowCarga(false)} onProcesado={() => void cargar(q)} />
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
