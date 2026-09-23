"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Cliente = {
  id: string;
  tipo_persona?: string | null;
  tipo_doc?: string | null;
  nro_doc?: string | null;
  nombre_razon_social?: string | null;
  nombres?: string | null;
  nombre?: string | null;
  contacto?: string | null;
  correo?: string | null;
  email?: string | null;
  telefono?: string | null;
  codigo_sap?: string | null;
  revision_label?: string | null;
  estado?: string | null;
};

const nombreDe = (c: Cliente) => c.nombre_razon_social ?? c.nombres ?? c.nombre ?? "—";
const docDe = (c: Cliente) => c.nro_doc ?? "—";
const tipoDocDe = (c: Cliente) => c.tipo_doc ?? "—";
const correoDe = (c: Cliente) => c.correo ?? c.email ?? "";
const revisionDe = (c: Cliente) => c.revision_label ?? (c.codigo_sap ? "Validado" : "Pendiente");
const PAGE_SIZES = [10, 25, 50, 100];

function normRespuesta(r: unknown): { rows: Cliente[]; total: number } {
  if (Array.isArray(r)) return { rows: r as Cliente[], total: (r as unknown[]).length };
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    if (Array.isArray(o.rows)) return { rows: o.rows as Cliente[], total: Number(o.total ?? (o.rows as unknown[]).length) };
    if (Array.isArray(o.datos)) return { rows: o.datos as Cliente[], total: (o.datos as unknown[]).length };
  }
  return { rows: [], total: 0 };
}

function NuevoClienteModal({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [tipoPersona, setTipoPersona] = useState("");
  const [tipoDoc, setTipoDoc] = useState("");
  const [nroDoc, setNroDoc] = useState("");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [sap, setSap] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const tiposDoc = tipoPersona === "JURIDICA" ? ["RUC"] : ["DNI", "CE", "PASAPORTE", "RUC", "OTRO"];

  const guardar = async () => {
    setMsg(null);
    if (!tipoPersona) { setMsg("Selecciona el tipo de persona."); return; }
    if (!tipoDoc) { setMsg("Selecciona el tipo de documento."); return; }
    if (!nroDoc.trim()) { setMsg("Ingresa el número de documento."); return; }
    if (nombre.trim().length < 2) { setMsg("Ingresa el nombre o razón social."); return; }
    if (correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) { setMsg("Correo inválido."); return; }
    setGuardando(true);
    try {
      try {
        await apiOperacion("crearClienteSGT", {
          tipo_persona: tipoPersona,
          tipo_doc: tipoDoc,
          nro_doc: nroDoc.trim(),
          nombre_razon_social: nombre.trim(),
          correo: correo.trim(),
          telefono: telefono.trim(),
          codigo_sap: sap.trim(),
        });
      } catch {
        await apiOperacion("crearCliente", {
          nombres: nombre.trim(),
          dni: nroDoc.trim(),
          telefono: telefono.trim(),
          email: correo.trim(),
        });
      }
      onGuardado();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-6 overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="font-bold text-lg">Nuevo cliente</h2>
            <p className="text-sm text-slate-500">Registra los datos principales. El código SAP puede informarse después.</p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo de persona *</label>
              <select className="input" value={tipoPersona} onChange={(e) => { setTipoPersona(e.target.value); setTipoDoc(""); }}>
                <option value="">Selecciona un tipo</option>
                <option value="NATURAL">Persona natural</option>
                <option value="JURIDICA">Persona jurídica</option>
              </select>
            </div>
            <div>
              <label className="label">Tipo de documento *</label>
              <select className="input" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                <option value="">Selecciona un documento</option>
                {tiposDoc.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Número de documento *</label>
              <input className="input" placeholder="Ingresa el documento" value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} />
              <p className="text-[11px] text-slate-400 mt-1">Selecciona primero el tipo de documento.</p>
            </div>
            <div>
              <label className="label">Nombre / Razón social *</label>
              <input className="input" placeholder="Nombres o razón social" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Correo</label>
              <input className="input" placeholder="correo@ejemplo.com" value={correo} onChange={(e) => setCorreo(e.target.value)} />
              <p className="text-[11px] text-slate-400 mt-1">Opcional.</p>
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" placeholder="999999999" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              <p className="text-[11px] text-slate-400 mt-1">Opcional. Puede comenzar con +.</p>
            </div>
          </div>
          <div>
            <label className="label">Código de cliente SAP</label>
            <input className="input" placeholder="Puede registrarse posteriormente" value={sap} onChange={(e) => setSap(e.target.value)} />
            <p className="text-[11px] text-slate-400 mt-1">Opcional al crear. No valida automáticamente al cliente.</p>
          </div>
          <div className="rounded-xl border-l-4 border-l-amber-400 bg-amber-50 border border-amber-200 p-4">
            <p className="font-bold text-sm">Datos del cliente</p>
            <p className="text-xs text-slate-600 mt-1">El documento no puede repetirse. El cliente puede registrarse sin código SAP y quedará pendiente de revisión. Las direcciones se registrarán posteriormente en cuentas de contrato.</p>
          </div>
          {msg && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>Cancelar</button>
          <button className="btn-green" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cliente"}</button>
        </div>
      </div>
    </div>
  );
}

function VisualizarModal({ c, onClose }: { c: Cliente; onClose: () => void }) {
  const filas: [string, string][] = [
    ["ID", String(c.id)],
    ["Tipo de persona", String(c.tipo_persona ?? "—")],
    ["Documento", `${tipoDocDe(c)} ${docDe(c)}`],
    ["Cliente", nombreDe(c)],
    ["Contacto", String(c.contacto ?? "—")],
    ["Correo", correoDe(c) || "—"],
    ["Teléfono", String(c.telefono ?? "—")],
    ["Código SAP", String(c.codigo_sap ?? "—")],
    ["Revisión", revisionDe(c)],
    ["Estado", String(c.estado ?? "—")],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <h2 className="font-bold text-lg">Cliente · {String(c.id)}</h2>
        <dl className="mt-4 text-sm space-y-2">
          {filas.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-1.5">
              <dt className="text-slate-400">{k}</dt>
              <dd className="font-semibold text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <button className="btn-white w-full mt-5" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

function CargaMasivaModal({ onClose, onProcesado }: { onClose: () => void; onProcesado: () => void }) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState("");
  const [validarSap, setValidarSap] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const descargarCSV = () => {
    const csv = "tipo_persona;tipo_documento;numero_documento;nombre_razon_social;contacto;correo;telefono;codigo_sap\nNATURAL;DNI;12345678;JUAN PEREZ;Juan Perez;juan@ejemplo.com;999888777;\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla_clientes.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const descargarXLSX = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["tipo_persona", "tipo_documento", "numero_documento", "nombre_razon_social", "contacto", "correo", "telefono", "codigo_sap"],
      ["NATURAL", "DNI", "12345678", "JUAN PEREZ", "Juan Perez", "juan@ejemplo.com", "999888777", ""],
    ]);
    ws["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "plantilla_clientes.xlsx");
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

  const validar = async () => {
    setMsg(null); setResultado(null);
    if (!texto.trim()) { setMsg("Selecciona o arrastra un archivo CSV/XLSX primero."); return; }
    setTrabajando(true);
    try {
      let r: { total?: number; validas?: number; errores?: string[] };
      try {
        r = await apiOperacion("validarArchivoClientes", { csv: texto });
      } catch {
        r = { total: 0, validas: 0, errores: ["Validación no disponible: ejecuta el backend actualizado"] };
      }
      const errs = r.errores ?? [];
      setResultado(errs.length === 0
        ? `Archivo válido: ${r.validas ?? 0} filas listas para crear.`
        : `${r.validas ?? 0} válidas · ${errs.length} errores:\n${errs.slice(0, 10).join("\n")}${errs.length > 10 ? `\n…y ${errs.length - 10} más` : ""}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo validar");
    } finally {
      setTrabajando(false);
    }
  };

  const crear = async () => {
    setMsg(null); setResultado(null);
    if (!texto.trim()) { setMsg("Selecciona o arrastra un archivo CSV/XLSX primero."); return; }
    setTrabajando(true);
    try {
      const r = await apiOperacion<{ total?: number; insertadas?: number; errores?: string[] }>("cargaMasivaClientes", { csv: texto, validar_sap: validarSap });
      const errs = r?.errores ?? [];
      setResultado(`Creados ${r?.insertadas ?? 0} de ${r?.total ?? 0}.${errs.length > 0 ? `\nErrores:\n${errs.slice(0, 10).join("\n")}` : ""}`);
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
            <h2 className="font-bold text-lg">Carga masiva de clientes</h2>
            <p className="text-sm text-slate-500">Valida un archivo CSV o XLSX antes de crear clientes en el maestro global.</p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold text-sm">1. Preparar archivo</p>
                <p className="text-xs text-slate-500">Usa la plantilla oficial y conserva las cabeceras sin cambios. Se admiten hasta 500 filas por archivo.</p>
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
              <p className="text-xs text-slate-500 mt-1">El archivo será validado antes de realizar cualquier cambio.</p>
              <span className="btn-white !text-xs mt-3">Seleccionar archivo</span>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) leerArchivo(f); }} />
            </label>
            {archivo && <p className="text-[11px] text-slate-500 mt-2">Seleccionado: {archivo}</p>}
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="font-bold text-sm">2. Definir validación SAP</p>
            <p className="text-xs text-slate-500">La opción puede modificarse antes de validar o procesar el archivo.</p>
            <label className="mt-2 flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 p-3 cursor-pointer">
              <input type="checkbox" checked={validarSap} onChange={(e) => setValidarSap(e.target.checked)} className="mt-1" />
              <span>
                <span className="font-bold text-sm block">Validar automáticamente clientes con código SAP correcto</span>
                <span className="text-xs text-slate-500">Los clientes válidos sin código SAP quedarán como pendientes de revisión.</span>
              </span>
            </label>
          </div>
          {msg && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
          {resultado && <p className="text-sm rounded-lg bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 whitespace-pre-line">{resultado}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>Cancelar</button>
          <button className="btn-white !text-[#0099D8]" onClick={validar} disabled={trabajando}>{trabajando ? "Validando…" : "Validar archivo"}</button>
          <button className="btn-green" onClick={crear} disabled={trabajando}>{trabajando ? "Procesando…" : "Crear clientes"}</button>
        </div>
      </div>
    </div>
  );
}

export default function ClientesPage() {
  const [rows, setRows] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fDoc, setFDoc] = useState("");
  const [fEst, setFEst] = useState("");
  const [fRev, setFRev] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [showNuevo, setShowNuevo] = useState(false);
  const [showCarga, setShowCarga] = useState(false);
  const [ver, setVer] = useState<Cliente | null>(null);

  const cargar = async (p = page, ps = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      let datos: unknown;
      try {
        datos = await apiOperacion("listarClientesSGT", {
          q, tipo_persona: fTipo, tipo_doc: fDoc, estado: fEst, revision: fRev, limit: 500, page: p, pageSize: ps,
        });
      } catch {
        datos = await apiOperacion("listarClientes", q ? { q } : {});
      }
      const { rows: r, total: t } = normRespuesta(datos);
      setRows(r);
      setTotal(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    cargar(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  useEffect(() => {
    cargar(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const buscar = () => { setPage(1); cargar(1, pageSize); };
  const limpiar = () => { setQ(""); setFTipo(""); setFDoc(""); setFEst(""); setFRev(""); setPage(1); };

  useEffect(() => {
    if (q === "" && fTipo === "" && fDoc === "" && fEst === "" && fRev === "") cargar(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, fTipo, fDoc, fEst, fRev]);

  const cambiarEstado = async (c: Cliente) => {
    const nuevo = String(c.estado ?? "").toUpperCase() === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    try {
      await apiOperacion("actualizarClienteSGT", { id: String(c.id), estado: nuevo });
      setInfo(`Cliente ${nuevo === "ACTIVO" ? "activado" : "inactivado"}.`);
      await cargar(page, pageSize);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);

  return (
    <AuthGate><Shell>
      <div className="rounded-2xl bg-emerald-50/60 border border-emerald-100/70 p-5 md:p-6 flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[220px]">
          <p className="text-[11px] font-extrabold tracking-widest text-emerald-600">GESTIÓN COMERCIAL</p>
          <h1 className="text-2xl font-extrabold">Clientes</h1>
          <p className="text-sm text-slate-500 mt-1">Registra, consulta y revisa personas naturales o jurídicas, incluyendo su vinculación posterior con el código de cliente SAP.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-white !text-[#0099D8]" onClick={() => cargar(page, pageSize)} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button>
          <button className="btn-white !text-[#0099D8]" onClick={() => setShowCarga(true)}>Carga masiva</button>
          <button className="btn-green" onClick={() => setShowNuevo(true)}>Nuevo cliente</button>
        </div>
      </div>

      <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Buscar cliente</label>
          <input className="input" placeholder="Documento, nombre, razón social" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
        </div>
        <div>
          <label className="label">Tipo de persona</label>
          <select className="input !w-auto" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="">Todas</option>
            <option value="NATURAL">Natural</option>
            <option value="JURIDICA">Jurídica</option>
          </select>
        </div>
        <div>
          <label className="label">Documento</label>
          <select className="input !w-auto" value={fDoc} onChange={(e) => setFDoc(e.target.value)}>
            <option value="">Todos</option>
            <option value="DNI">DNI</option>
            <option value="RUC">RUC</option>
            <option value="CE">CE</option>
            <option value="PASAPORTE">Pasaporte</option>
          </select>
        </div>
        <div>
          <label className="label">Estado</label>
          <select className="input !w-auto" value={fEst} onChange={(e) => setFEst(e.target.value)}>
            <option value="">Todos</option>
            <option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </div>
        <div>
          <label className="label">Revisión</label>
          <select className="input !w-auto" value={fRev} onChange={(e) => setFRev(e.target.value)}>
            <option value="">Todas</option>
            <option value="Validado">Validado</option>
            <option value="Pendiente">Pendiente</option>
          </select>
        </div>
        <div>
          <label className="label">Mostrar</label>
          <select className="input !w-auto" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <button className="btn-white !py-2" onClick={limpiar}>Limpiar filtros</button>
      </div>

      {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
      {info && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}

      <div className="card mt-4">
        <div className="px-5 py-3 border-b">
          <p className="font-semibold">Clientes registrados</p>
          <p className="text-xs text-slate-400">Mostrando {desde}–{hasta} de {total} clientes</p>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-[#0099D8]">Cargando clientes…</p>
        ) : rows.length === 0 ? (
          <div className="p-4"><EmptyState titulo="Sin clientes" detalle="No hay clientes con esos filtros. Crea uno o usa carga masiva." /></div>
        ) : (
          <div className="overflow-x-auto"><table className="tabla">
            <thead><tr><th>ID</th><th>DOCUMENTO</th><th>CLIENTE</th><th>CONTACTO</th><th>CÓDIGO SAP</th><th>REVISIÓN</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const activo = String(c.estado ?? "").toUpperCase() === "ACTIVO";
                const rev = revisionDe(c);
                return (
                  <tr key={String(c.id)}>
                    <td className="font-mono text-xs break-all">{String(c.id)}</td>
                    <td><p className="font-bold">{docDe(c)}</p><p className="text-[11px] text-slate-400">{tipoDocDe(c)}</p></td>
                    <td><p className="font-bold uppercase">{nombreDe(c)}</p><p className="text-[11px] text-slate-400 uppercase">{c.contacto || ""}</p></td>
                    <td><p>{c.telefono || "—"}</p><p className="text-[11px] text-slate-400">{correoDe(c) || "Sin correo"}</p></td>
                    <td><p className="font-bold">{c.codigo_sap || "—"}</p><p className="text-[11px] text-slate-400">{c.codigo_sap ? "Registrado" : "Pendiente"}</p></td>
                    <td>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${rev === "Validado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {rev}
                      </span>
                    </td>
                    <td>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {activo ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <button className="btn-white !py-1 !px-3 text-xs mr-2" onClick={() => setVer(c)}>Visualizar</button>
                      <button className={`!py-1 !px-3 text-xs rounded-lg border font-semibold ${activo ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`} onClick={() => cambiarEstado(c)}>
                        {activo ? "Inactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        <div className="flex items-center justify-between px-5 py-3 border-t">
          <button className="btn-white !py-1.5 text-xs disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
          <p className="text-xs text-slate-500">Página {page} de {totalPages}</p>
          <button className="btn-white !py-1.5 text-xs disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      </div>

      {showNuevo && <NuevoClienteModal onClose={() => setShowNuevo(false)} onGuardado={() => { setPage(1); cargar(1, pageSize); }} />}
      {showCarga && <CargaMasivaModal onClose={() => setShowCarga(false)} onProcesado={() => { setPage(1); cargar(1, pageSize); }} />}
      {ver && <VisualizarModal c={ver} onClose={() => setVer(null)} />}
    </Shell></AuthGate>
  );
}
