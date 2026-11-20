"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState } from "@/components/Tablas";
import { AccActivar, AccDesactivar, AccEditar, IconBtn } from "@/components/Accion";
import PasswordInput from "@/components/PasswordInput";

type Usuario = {
  id: string;
  nombre?: string | null;
  tipo_doc?: string | null;
  nro_doc?: string | null;
  documento?: string | null;
  correo?: string | null;
  email?: string | null;
  telefono?: string | null;
  rol?: string | null;
  rol_codigo?: string | null;
  id_proveedor?: string | null;
  id_proveedores?: string[] | null;
  proveedores_asignados?: { id: string; nombre: string }[] | null;
  proveedor?: string | { nombre_comercial?: string; razon_social?: string } | null;
  estado?: string | null;
  activo?: boolean | null;
};

type Proveedor = { id: string; razon_social?: string | null; nombre?: string | null; nombre_comercial?: string | null; interlocutor?: string | null; ruc?: string | null };

const slugDemo = (nombre: string) => nombre.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 32);

const nombreProv = (p: Proveedor) =>
  String(p.razon_social ?? p.nombre ?? p.nombre_comercial ?? p.interlocutor ?? p.id);

const ROLES = ["ADMIN", "PROVEEDOR", "SUPERVISOR", "ASESOR"];

const rolDe = (u: Usuario) => String(u.rol ?? u.rol_codigo ?? "—").toUpperCase();
const correoDe = (u: Usuario) => String(u.correo ?? u.email ?? "—");
const docDe = (u: Usuario) => String(u.documento ?? (`${u.tipo_doc ?? ""} ${u.nro_doc ?? ""}`.trim() || "—"));
const provDe = (u: Usuario) => {
  if (u.proveedores_asignados?.length) return u.proveedores_asignados.map((p) => p.nombre).join(", ");
  if (!u.proveedor) return u.id_proveedor ? String(u.id_proveedor) : "—";
  if (typeof u.proveedor === "string") return u.proveedor;
  return u.proveedor.nombre_comercial || u.proveedor.razon_social || "—";
};
const activoDe = (u: Usuario) =>
  u.estado ? String(u.estado).toUpperCase() === "ACTIVO" : u.activo !== false;

function CargaMasivaModal({ onClose, onProcesado }: { onClose: () => void; onProcesado: () => void }) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const CAB = ["PROVEEDOR", "BP_PROVEEDOR", "ASESORES", "TELEFONO_ASESOR"];
  const EJEMPLO = ["EJEMPLO S.A.C.", "1000001", "NOMBRE APELLIDO", "999999999"];

  const descargarCSV = () => {
    const csv = `${CAB.join(";")}\n${EJEMPLO.join(";")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla_asesores.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const descargarXLSX = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([CAB, EJEMPLO]);
    ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 24 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asesores");
    XLSX.writeFile(wb, "plantilla_asesores.xlsx");
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
      const r = await apiOperacion<{
        total?: number;
        insertadas?: number;
        actualizadas?: number;
        errores?: string[];
        nota?: string;
        credenciales?: { nombre: string; correo: string; password: string; proveedores: string[] }[];
      }>("cargaMasivaAsesores", { csv: texto });
      const errs = r?.errores ?? [];
      const credenciales = r?.credenciales ?? [];
      setResultado(
        `Asesores ${r?.total ?? 0} · nuevos ${r?.insertadas ?? 0} · actualizados ${r?.actualizadas ?? 0}.`
        + (credenciales.length ? `\n\nCREDENCIALES NUEVAS (guárdalas ahora):\n${credenciales.map((c) => `${c.nombre} | ${c.correo} | ${c.password} | Proveedores: ${c.proveedores.join(", ")}`).join("\n")}` : "")
        + (errs.length ? `\n\nErrores:\n${errs.slice(0, 10).join("\n")}${errs.length > 10 ? `\n…y ${errs.length - 10} más` : ""}` : "")
        + (r?.nota ? `\n\n${r.nota}` : "")
      );
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
            <h2 className="font-bold text-lg">Carga masiva de asesores</h2>
            <p className="text-sm text-slate-500">CSV o XLSX con cabeceras {CAB.join(";")}. Máximo 500 filas.</p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
           <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">Crea cuentas de acceso demo activas y asigna a cada asesor todos los proveedores del archivo. Las contraseñas temporales se muestran una sola vez.</p>
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

function UsuarioModal({
  initial, proveedores, onClose, onGuardado,
}: {
  initial: Usuario | null;
  proveedores: Proveedor[];
  onClose: () => void;
  onGuardado: (mensaje?: string) => void;
}) {
  const editando = !!initial;
  const [tipoDoc, setTipoDoc] = useState(initial?.tipo_doc ?? "DNI");
  const [nroDoc, setNroDoc] = useState(initial?.nro_doc ?? "");
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [correo, setCorreo] = useState(correoDe(initial ?? {} as Usuario) === "—" ? "" : correoDe(initial ?? {} as Usuario));
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
  const [rol, setRol] = useState(rolDe(initial ?? {} as Usuario) === "—" ? "ASESOR" : rolDe(initial ?? {} as Usuario));
  const [prov, setProv] = useState<string[]>(initial?.id_proveedores ?? (initial?.id_proveedor ? [initial.id_proveedor] : []));
  const [password, setPassword] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setError(null);
    if (rol.toUpperCase() !== "ADMIN" && prov.length === 0) {
      setError("Selecciona al menos un proveedor para este usuario.");
      return;
    }
    if (!editando) {
      if (!nroDoc.trim() || nombre.trim().length < 2 || !correo.trim()) {
        setError("Documento, nombre y correo son obligatorios.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) { setError("Correo inválido."); return; }
    } else if (nombre.trim().length < 2) {
      setError("El nombre es obligatorio.");
      return;
    }
    setGuardando(true);
    try {
      if (editando && initial) {
        await apiOperacion("actualizarUsuarioSGT", {
          id: initial.id,
          nombre: nombre.trim(),
          tipo_doc: tipoDoc,
          nro_doc: nroDoc.trim(),
          telefono: telefono.trim(),
          rol_codigo: rol,
          id_proveedores: prov,
          id_proveedor: prov[0] ?? null,
        });
      } else {
        const creado = await apiOperacion<{ password_temporal?: string }>("crearUsuarioSGT", {
          tipo_doc: tipoDoc,
          nro_doc: nroDoc.trim(),
          nombre: nombre.trim(),
          correo: correo.trim(),
          telefono: telefono.trim(),
          rol_codigo: rol,
          id_proveedores: prov,
          id_proveedor: prov[0] ?? null,
          ...(password ? { password } : {}),
        });
        onGuardado(creado.password_temporal
          ? `Usuario creado. Contraseña temporal (cópiala ahora): ${creado.password_temporal}`
          : undefined);
        onClose();
        return;
      }
      onGuardado();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-xl p-6 my-6">
        <h2 className="text-lg font-extrabold">{editando ? `Editar usuario · ${initial?.id}` : "Nuevo usuario"}</h2>
        <p className="text-xs text-slate-500 mt-1">{editando ? "El correo es inmutable (credencial de acceso). El documento sí se puede corregir." : "Crea el acceso (Auth) y la ficha del usuario."}</p>
        <div className="grid md:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="label">Tipo de documento {!editando && "*"}</label>
            <select className="input" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
              {["DNI", "CE", "PASAPORTE", "RUC", "OTRO"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Número de documento {!editando && "*"}</label>
            <input className="input" value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} />
          </div>
          <div className="md:col-span-2"><label className="label">Nombre completo *</label><input className="input" placeholder="Nombres y apellidos" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label !mb-0">Correo {editando ? "(inmutable)" : "*"}</label>
              {!editando && <button type="button" className="text-[11px] font-bold text-[#0077B6] hover:underline dark:text-sky-300" onClick={() => {
                const slug = slugDemo(nombre);
                if (!slug) { setError("Escribe primero el nombre del usuario."); return; }
                setTipoDoc("OTRO");
                setNroDoc(`DEMO-${slug.replace(/\./g, "").toUpperCase()}`.slice(0, 20));
                setCorreo(`${slug}@demo.calidda.com.pe`);
              }}>Generar correo demo</button>}
            </div>
            <input className="input" placeholder="usuario@demo.calidda.com.pe" value={correo} disabled={editando} onChange={(e) => setCorreo(e.target.value)} />
          </div>
          <div><label className="label">Teléfono</label><input className="input" placeholder="+51999999999" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          <div>
            <label className="label">Rol *</label>
            <select className="input" value={rol} onChange={(e) => setRol(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Proveedores asignados {rol.toUpperCase() !== "ADMIN" && "*"}</label>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
              {proveedores.length ? proveedores.map((p) => {
                const id = String(p.id);
                const seleccionado = prov.includes(id);
                return (
                  <label key={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sky-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-[#0077B6]"
                      checked={seleccionado}
                      onChange={(e) => setProv((actual) => e.target.checked ? [...new Set([...actual, id])] : actual.filter((v) => v !== id))}
                    />
                    <span>{nombreProv(p)}{p.ruc ? ` · RUC ${p.ruc}` : ""}</span>
                  </label>
                );
              }) : <p className="p-2 text-xs text-slate-400">No hay proveedores activos para asignar.</p>}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">El usuario verá estos proveedores al crear cotizaciones.</p>
          </div>
          {!editando && (
            <div className="md:col-span-2"><label className="label">Contraseña (opcional, mín. 8; si se omite se genera)</label><PasswordInput className="input" placeholder="••••••••" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          )}
        </div>
        {error && <p className="mt-3 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : editando ? "Guardar cambios" : "Registrar usuario"}</button>
        </div>
      </div>
    </div>
  );
}

function CambioPasswordModal({ u, onClose, onOk }: { u: Usuario; onClose: () => void; onOk: (msg: string) => void }) {
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setMsg(null);
    if (pwd1.length < 8) { setMsg("La nueva contraseña debe tener mínimo 8 caracteres."); return; }
    if (pwd1 !== pwd2) { setMsg("Las contraseñas no coinciden."); return; }
    setGuardando(true);
    try {
      await apiOperacion("cambiarPasswordUsuario", { user_id: u.id, password: pwd1 });
      onOk(`Contraseña actualizada para ${u.nombre ?? correoDe(u)}.`);
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo cambiar la contraseña");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 my-6">
        <h2 className="text-lg font-extrabold">Cambiar contraseña</h2>
        <p className="text-xs text-slate-500 mt-1">{u.nombre ?? "—"} · {correoDe(u)}</p>
        <div className="grid gap-3 mt-4">
          <div><label className="label">Nueva contraseña (mín. 8) *</label><PasswordInput className="input" placeholder="••••••••" autoComplete="new-password" value={pwd1} onChange={(e) => setPwd1(e.target.value)} /></div>
          <div><label className="label">Repetir contraseña *</label><PasswordInput className="input" placeholder="••••••••" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} /></div>
        </div>
        {msg && <p className="mt-3 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
        <div className="flex gap-2 mt-5">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Cambiar contraseña"}</button>
        </div>
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const [rows, setRows] = useState<Usuario[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { mode: "nuevo" } | { mode: "editar"; u: Usuario }>(null);
  const [modalPwd, setModalPwd] = useState<Usuario | null>(null);
  const [showCarga, setShowCarga] = useState(false);
  const [accionando, setAccionando] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, p] = await Promise.all([
        apiOperacion<unknown>("listarUsuariosSGT", q ? { q } : {}),
        apiOperacion<unknown>("listarProveedoresSGT", { limit: 500 }).catch(() => []),
      ]);
      setRows(Array.isArray(u) ? (u as Usuario[]) : []);
      setProveedores(Array.isArray(p) ? (p as Proveedor[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar (ejecuta schema_sgt360.sql)");
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
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((u) => [u.nombre, correoDe(u), docDe(u), rolDe(u), String(u.id)].join(" ").toLowerCase().includes(s));
  }, [rows, q]);

  const cambiarEstado = async (u: Usuario) => {
    const nuevo = activoDe(u) ? "INACTIVO" : "ACTIVO";
    setAccionando(u.id);
    setError(null);
    try {
      await apiOperacion("actualizarUsuarioSGT", { id: u.id, estado: nuevo });
      setInfo(`Usuario ${nuevo === "ACTIVO" ? "activado" : "desactivado"}.`);
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
      <div className="mt-1"><ModHead
        eyebrow="CONSOLA ADMINISTRATIVA"
        title="Usuarios"
        desc="Gestión de identidades, accesos, roles y estados (seg_usuarios)."
        actions={<>
          <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
          <button className="btn-white" onClick={() => setShowCarga(true)}>Carga masiva</button>
          <button className="btn-green" onClick={() => setModal({ mode: "nuevo" })}>+ Nuevo usuario</button>
        </>}
      /></div>
      <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Buscar</label>
          <input className="input" placeholder="Nombre, correo, documento o rol" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} />
        </div>
        <button className="btn-white !py-2" onClick={() => { setQ(""); }}>Limpiar</button>
        <button className="btn-white !py-2" onClick={cargar}>Buscar en backend</button>
      </div>
      {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
      {info && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}
      {loading ? (
        <div className="card p-10 mt-4 text-center text-slate-500">Cargando usuarios…</div>
      ) : filtrados.length === 0 ? (
        <div className="mt-4"><EmptyState titulo="Sin usuarios" detalle="No hay usuarios con esos filtros." /></div>
      ) : (
        <div className="card mt-4">
          <div className="px-5 py-3 border-b font-semibold">Usuarios registrados · {filtrados.length}</div>
          <div className="overflow-x-auto"><table className="tabla">
           <thead><tr><th>ID</th><th>USUARIO</th><th>DOCUMENTO</th><th>CORREO</th><th>TELÉFONO</th><th>ROL</th><th>PROVEEDORES</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
            <tbody>
              {filtrados.map((u) => {
                const activo = activoDe(u);
                return (
                  <tr key={String(u.id)}>
                    <td className="font-mono text-xs">{String(u.id)}</td>
                    <td className="font-medium">{u.nombre ?? "—"}</td>
                    <td>{docDe(u)}</td>
                    <td className="max-w-[220px] truncate">{correoDe(u)}</td>
                    <td>{u.telefono ?? "—"}</td>
                    <td><span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-2.5 py-0.5 text-xs font-bold">{rolDe(u)}</span></td>
                    <td className="max-w-[200px] truncate">{provDe(u)}</td>
                    <td>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {activo ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex gap-1.5">
                        <AccEditar title="Editar usuario" disabled={accionando === u.id} onClick={() => setModal({ mode: "editar", u })} />
                        <IconBtn simbolo="🔑" title="Cambiar contraseña" tono="azul" disabled={accionando === u.id} onClick={() => setModalPwd(u)} />
                        {activo
                          ? <AccDesactivar title="Desactivar usuario" disabled={accionando === u.id} onClick={() => cambiarEstado(u)} />
                          : <AccActivar title="Activar usuario" disabled={accionando === u.id} onClick={() => cambiarEstado(u)} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}
      {showCarga && (
        <CargaMasivaModal onClose={() => setShowCarga(false)} onProcesado={() => { cargar(); }} />
      )}
      {modal?.mode === "nuevo" && (
        <UsuarioModal initial={null} proveedores={proveedores} onClose={() => setModal(null)} onGuardado={(m) => { setInfo(m || "Usuario registrado."); cargar(); }} />
      )}
      {modal?.mode === "editar" && (
        <UsuarioModal initial={modal.u} proveedores={proveedores} onClose={() => setModal(null)} onGuardado={(m) => { setInfo(m || "Usuario actualizado."); cargar(); }} />
      )}
      {modalPwd && (
        <CambioPasswordModal u={modalPwd} onClose={() => setModalPwd(null)} onOk={(m) => { setInfo(m); }} />
      )}
    </Shell></AuthGate>
  );
}
