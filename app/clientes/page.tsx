"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState } from "@/components/Tablas";
import { AccActivar, AccDesactivar, AccEditar, AccVer } from "@/components/Accion";

// Cabeceras exactas del formato Airtable "Leads-Base" (58 columnas).
const AIRTABLE_HEADERS = ["DNI", "Tipo de Documento", "DNI Cliente", "Nombres y Apellidos", "Teléfono1", "Teléfono2", "Correo electrónico", "Canal Generador Lead", "Fecha Ingreso de Lead", "Fecha Registro", "Creado por", "BP Cliente", "Cuenta Contrato", "Linea de Credito", "NSE", "Dirección", "Referencia", "Distrito", "Etapa", "TIPO DE CLIENTE", "Estado Lead", "Sub Estado Lead", "Asesor Asignado", "Fecha Visita Técnica", "Horario Visita Técnica", "Ambiente", "Proveedor Asignado", "Importe", "Fecha de instalación", "Comentarios", "Imagen Ambiente", "Técnico Asignado", "MICROALIADO", "TIPO DE PV", "FECHA VENTA (SAP)", "PRECIO FINAN.", "PEDIDO FINAN.", "ORDEN FINAN.", "PRECIO ABONO", "PEDIDO ABONO", "ORDEN ABONO", "ESTADO DE ABONO", "FECHA DE ABONO", "FEE", "FEE (S/.)", "STATUS ANTICIPO", "25 % ANTICIPO", "PENDIENTE DE PAGO", "FECHA DE PAGO CALIDDA", "FECHA DE PAGO MICROALIADO", "INCENTIVO ASESOR", "FECHA DE PAGO INCENTIVOS", "LISTOS PARA PROGRAMACIÓN", "CANAL DE VENTA", "TIPO DE ANTICIPO", "Revisión", "GRABACIÓN DE VENTA", "CYBER"];

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
  sap_validado?: boolean | null;
  cuenta_contrato?: string | null;
  telefono2?: string | null;
  bp_cliente?: string | null;
  linea_credito?: number | string | null;
  nse?: string | null;
  direccion?: string | null;
  referencia?: string | null;
  distrito?: string | null;
  ambiente?: string | null;
  revision_label?: string | null;
  estado?: string | null;
};

const nombreDe = (c: Cliente) => c.nombre_razon_social ?? c.nombres ?? c.nombre ?? "—";
const docDe = (c: Cliente) => c.nro_doc ?? "—";
const tipoDocDe = (c: Cliente) => c.tipo_doc ?? "—";
const correoDe = (c: Cliente) => c.correo ?? c.email ?? "";
const revisionDe = (c: Cliente) => c.revision_label ?? (c.sap_validado ? "Validado" : c.codigo_sap ? "Validado" : "Pendiente");
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

type FormCliente = {
  tipoPersona: string; tipoDoc: string; nroDoc: string; nombre: string;
  correo: string; telefono: string; telefono2: string; sap: string;
  cuentaContrato: string; bp: string; linea: string; nse: string;
  direccion: string; referencia: string; distrito: string; ambiente: string;
};

const FORM_VACIO: FormCliente = {
  tipoPersona: "", tipoDoc: "", nroDoc: "", nombre: "", correo: "",
  telefono: "", telefono2: "", sap: "", cuentaContrato: "", bp: "",
  linea: "", nse: "", direccion: "", referencia: "", distrito: "", ambiente: "",
};

function NuevoClienteModal({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [f, setF] = useState<FormCliente>({ ...FORM_VACIO });
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof FormCliente, v: string) => setF((p) => ({ ...p, [k]: v }));

  const tiposDoc = f.tipoPersona === "JURIDICA" ? ["RUC"] : ["DNI", "CE", "PASAPORTE", "RUC", "OTRO"];

  const guardar = async () => {
    setMsg(null);
    if (!f.tipoPersona) { setMsg("Selecciona el tipo de persona."); return; }
    if (!f.tipoDoc) { setMsg("Selecciona el tipo de documento."); return; }
    if (!f.nroDoc.trim()) { setMsg("Ingresa el número de documento."); return; }
    if (f.nombre.trim().length < 2) { setMsg("Ingresa el nombre o razón social."); return; }
    if (f.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo.trim())) { setMsg("Correo inválido."); return; }
    setGuardando(true);
    try {
      const lineaNum = f.linea.trim() === "" ? undefined : Number(String(f.linea).replace(",", "."));
      try {
        await apiOperacion("crearClienteSGT", {
          tipo_persona: f.tipoPersona,
          tipo_doc: f.tipoDoc,
          nro_doc: f.nroDoc.trim(),
          nombre_razon_social: f.nombre.trim(),
          correo: f.correo.trim(),
          telefono: f.telefono.trim(),
          telefono2: f.telefono2.trim(),
          codigo_sap: f.sap.trim(),
          cuenta_contrato: f.cuentaContrato.trim(),
          bp_cliente: f.bp.trim(),
          ...(lineaNum !== undefined && Number.isFinite(lineaNum) ? { linea_credito: lineaNum } : {}),
          nse: f.nse.trim(),
          direccion: f.direccion.trim(),
          referencia: f.referencia.trim(),
          distrito: f.distrito.trim(),
          ambiente: f.ambiente.trim(),
        });
      } catch {
        await apiOperacion("crearCliente", {
          nombres: f.nombre.trim(),
          dni: f.nroDoc.trim(),
          telefono: f.telefono.trim(),
          email: f.correo.trim(),
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

  const campo = (k: keyof FormCliente, etiqueta: string, ph = "", obligatorio = false) => (
    <div>
      <label className="label">{etiqueta}{obligatorio && " *"}</label>
      <input className="input" placeholder={ph || etiqueta} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl my-6 overflow-hidden">
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
              <select className="input" value={f.tipoPersona} onChange={(e) => { set("tipoPersona", e.target.value); set("tipoDoc", ""); }}>
                <option value="">Selecciona un tipo</option>
                <option value="NATURAL">Persona natural</option>
                <option value="JURIDICA">Persona jurídica</option>
              </select>
            </div>
            <div>
              <label className="label">Tipo de documento *</label>
              <select className="input" value={f.tipoDoc} onChange={(e) => set("tipoDoc", e.target.value)}>
                <option value="">Selecciona un documento</option>
                {tiposDoc.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {campo("nroDoc", "Número de documento", "Ingresa el documento", true)}
            {campo("nombre", "Nombre / Razón social", "Nombres o razón social", true)}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {campo("cuentaContrato", "Cuenta Contrato", "N° cuenta contrato")}
            {campo("bp", "BP Cliente", "Business partner")}
            {campo("sap", "Código de cliente SAP", "Posterior si deseas")}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {campo("correo", "Correo", "correo@ejemplo.com")}
            {campo("telefono", "Teléfono 1", "999999999")}
            {campo("telefono2", "Teléfono 2", "999999999")}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {campo("linea", "Línea de Crédito", "Ej. 4000")}
            {campo("nse", "NSE", "Ej. 5")}
            {campo("distrito", "Distrito", "")}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {campo("direccion", "Dirección", "")}
            {campo("referencia", "Referencia", "")}
          </div>
          {campo("ambiente", "Ambiente", "Ej. Sala")}
          <div className="rounded-xl border-l-4 border-l-amber-400 bg-amber-50 border border-amber-200 p-4">
            <p className="font-bold text-sm">Datos del cliente</p>
            <p className="text-xs text-slate-600 mt-1">El documento no puede repetirse. El cliente puede registrarse sin código SAP y quedará pendiente de revisión.</p>
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

function EditarClienteModal({ c, onClose, onGuardado }: { c: Cliente; onClose: () => void; onGuardado: () => void }) {
  const [f, setF] = useState<FormCliente>({
    tipoPersona: String(c.tipo_persona ?? ""),
    tipoDoc: String(c.tipo_doc ?? ""),
    nroDoc: String(c.nro_doc ?? ""),
    nombre: String(c.nombre_razon_social ?? c.nombres ?? c.nombre ?? ""),
    correo: String(c.correo ?? c.email ?? ""),
    telefono: String(c.telefono ?? ""),
    telefono2: String(c.telefono2 ?? ""),
    sap: String(c.codigo_sap ?? ""),
    cuentaContrato: String(c.cuenta_contrato ?? ""),
    bp: String(c.bp_cliente ?? ""),
    linea: c.linea_credito != null ? String(c.linea_credito) : "",
    nse: String(c.nse ?? ""),
    direccion: String(c.direccion ?? ""),
    referencia: String(c.referencia ?? ""),
    distrito: String(c.distrito ?? ""),
    ambiente: String(c.ambiente ?? ""),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof FormCliente, v: string) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setMsg(null);
    if (f.nombre.trim().length < 2) { setMsg("Ingresa el nombre o razón social."); return; }
    if (f.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo.trim())) { setMsg("Correo inválido."); return; }
    setGuardando(true);
    try {
      const lineaNum = f.linea.trim() === "" ? undefined : Number(String(f.linea).replace(",", "."));
      await apiOperacion("actualizarClienteSGT", {
        id: String(c.id),
        ...(f.tipoPersona ? { tipo_persona: f.tipoPersona } : {}),
        ...(f.tipoDoc ? { tipo_doc: f.tipoDoc } : {}),
        ...(f.nroDoc.trim() ? { nro_doc: f.nroDoc.trim() } : {}),
        nombre_razon_social: f.nombre.trim(),
        correo: f.correo.trim(),
        telefono: f.telefono.trim(),
        telefono2: f.telefono2.trim(),
        codigo_sap: f.sap.trim(),
        cuenta_contrato: f.cuentaContrato.trim(),
        bp_cliente: f.bp.trim(),
        ...(lineaNum !== undefined && Number.isFinite(lineaNum) ? { linea_credito: lineaNum } : {}),
        nse: f.nse.trim(),
        direccion: f.direccion.trim(),
        referencia: f.referencia.trim(),
        distrito: f.distrito.trim(),
        ambiente: f.ambiente.trim(),
      });
      onGuardado();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const campo = (k: keyof FormCliente, etiqueta: string, ph = "") => (
    <div>
      <label className="label">{etiqueta}</label>
      <input className="input" placeholder={ph || etiqueta} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl my-6 overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="font-bold text-lg">Editar cliente · {String(c.id)}</h2>
            <p className="text-sm text-slate-500">Actualiza cualquier dato del cliente.</p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo de persona</label>
              <select className="input" value={f.tipoPersona} onChange={(e) => set("tipoPersona", e.target.value)}>
                <option value="">— Sin cambio —</option>
                <option value="NATURAL">Persona natural</option>
                <option value="JURIDICA">Persona jurídica</option>
              </select>
            </div>
            <div>
              <label className="label">Tipo de documento</label>
              <select className="input" value={f.tipoDoc} onChange={(e) => set("tipoDoc", e.target.value)}>
                <option value="">— Sin cambio —</option>
                {["DNI", "CE", "PASAPORTE", "RUC", "OTRO"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {campo("nroDoc", "Número de documento")}
            {campo("nombre", "Nombre / Razón social")}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {campo("cuentaContrato", "Cuenta Contrato")}
            {campo("bp", "BP Cliente")}
            {campo("sap", "Código de cliente SAP")}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {campo("correo", "Correo")}
            {campo("telefono", "Teléfono 1")}
            {campo("telefono2", "Teléfono 2")}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {campo("linea", "Línea de Crédito")}
            {campo("nse", "NSE")}
            {campo("distrito", "Distrito")}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {campo("direccion", "Dirección")}
            {campo("referencia", "Referencia")}
          </div>
          {campo("ambiente", "Ambiente")}
          {msg && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>Cancelar</button>
          <button className="btn-green" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      </div>
    </div>
  );
}

function VisualizarModal({ c, onClose, onCambio }: { c: Cliente; onClose: () => void; onCambio?: (nuevo: Cliente) => void }) {
  const [validando, setValidando] = useState(false);
  const [msgVal, setMsgVal] = useState<string | null>(null);
  const rev = revisionDe(c);
  const puedeValidar = !!c.codigo_sap && rev !== "Validado";

  const validarSap = async () => {
    setMsgVal(null);
    setValidando(true);
    try {
      const nuevo = await apiOperacion<Cliente>("validarSapCliente", { id: String(c.id) });
      onCambio?.(nuevo ?? { ...c, sap_validado: true, revision_label: "Validado" });
      onClose();
    } catch (e) {
      setMsgVal(e instanceof Error ? e.message : "No se pudo validar");
    } finally {
      setValidando(false);
    }
  };
  const filas: [string, string][] = [
    ["ID", String(c.id)],
    ["Tipo de persona", String(c.tipo_persona ?? "—")],
    ["Documento", `${tipoDocDe(c)} ${docDe(c)}`],
    ["Cliente", nombreDe(c)],
    ["Cuenta Contrato", String(c.cuenta_contrato ?? "—")],
    ["BP Cliente", String(c.bp_cliente ?? "—")],
    ["Contacto", String(c.contacto ?? "—")],
    ["Correo", correoDe(c) || "—"],
    ["Teléfono 1", String(c.telefono ?? "—")],
    ["Teléfono 2", String(c.telefono2 ?? "—")],
    ["Línea de Crédito", c.linea_credito != null ? String(c.linea_credito) : "—"],
    ["NSE", String(c.nse ?? "—")],
    ["Dirección", String(c.direccion ?? "—")],
    ["Referencia", String(c.referencia ?? "—")],
    ["Distrito", String(c.distrito ?? "—")],
    ["Ambiente", String(c.ambiente ?? "—")],
    ["Código SAP", String(c.codigo_sap ?? "—")],
    ["Revisión", revisionDe(c)],
    ["Estado", String(c.estado ?? "—")],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-4">
        <h2 className="font-bold">Cliente · {String(c.id)}</h2>
        <dl className="mt-3 text-[13px] space-y-1 max-h-[60vh] overflow-y-auto">
          {filas.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1">
              <dt className="text-slate-400 shrink-0">{k}</dt>
              <dd className="font-semibold text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
        {msgVal && <p className="mt-3 text-[13px] rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msgVal}</p>}
        <div className="flex gap-2 mt-4">
          <button className="btn-white flex-1 !py-1.5 text-sm" onClick={onClose}>Cerrar</button>
          {puedeValidar && (
            <button className="btn-green flex-1 !py-1.5 text-sm" onClick={validarSap} disabled={validando}>
              {validando ? "Validando…" : "Validar código SAP"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const FILAS_POR_LOTE = 800;

/** Divide el CSV en filas respetando celdas entrecomilladas (multilínea). */
function dividirFilasCSV(texto: string): string[] {
  const filas: string[] = [];
  let cur = "";
  let entre = false;
  const salto = () => {
    if (cur !== "" || filas.length === 0) filas.push(cur);
    cur = "";
  };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (entre) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { cur += '""'; i++; }
        else { entre = false; cur += ch; }
      } else cur += ch;
    } else if (ch === '"') {
      entre = true;
      cur += ch;
    } else if (ch === "\n") {
      salto();
    } else if (ch === "\r") {
      /* se ignora */
    } else cur += ch;
  }
  if (cur !== "") filas.push(cur);
  return filas.filter((f, i) => i === 0 || f.trim() !== "");
}

/** Parte el contenido en lotes (cabecera + N filas) para no saturar la subida. */
function partirEnLotes(texto: string): string[] {
  const filas = dividirFilasCSV(texto.trim());
  if (filas.length <= 1) return [texto.trim()];
  const cabeza = filas[0];
  const datos = filas.slice(1);
  const lotes: string[] = [];
  for (let i = 0; i < datos.length; i += FILAS_POR_LOTE) {
    lotes.push([cabeza, ...datos.slice(i, i + FILAS_POR_LOTE)].join("\n"));
  }
  return lotes;
}

function CargaMasivaModal({ onClose, onProcesado }: { onClose: () => void; onProcesado: () => void }) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState("");
  const [validarSap, setValidarSap] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  // Plantilla formato Airtable "Leads-Base" (58 columnas): el archivo se sube
  // tal cual; el sistema usa DNI Cliente, Nombres y Apellidos, teléfonos,
  // correo, BP, Cuenta Contrato, Línea de Crédito, NSE, dirección,
  // referencia, distrito y ambiente. Solo esas dos primeras son obligatorias.
  const ejemploAirtable = (): string[] => {
    const fila = new Array(AIRTABLE_HEADERS.length).fill("");
    const poner = (h: string, v: string) => { const i = AIRTABLE_HEADERS.indexOf(h); if (i >= 0) fila[i] = v; };
    poner("Tipo de Documento", "DNI");
    poner("DNI Cliente", "12345678");
    poner("Nombres y Apellidos", "JUAN PEREZ");
    poner("Teléfono1", "999888777");
    poner("Teléfono2", "999888776");
    poner("Correo electrónico", "juan@ejemplo.com");
    poner("BP Cliente", "5003205181");
    poner("Cuenta Contrato", "5696624");
    poner("Linea de Credito", "4000");
    poner("NSE", "5");
    poner("Dirección", "Jr. Las Flores 456");
    poner("Referencia", "Frente al parque");
    poner("Distrito", "Rimac");
    poner("Ambiente", "Sala");
    return fila;
  };

  const descargarCSV = () => {
    const esc = (v: string) => /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = `${AIRTABLE_HEADERS.map(esc).join(";")}\n${ejemploAirtable().map(esc).join(";")}\n`;
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla_clientes_airtable.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const descargarXLSX = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([AIRTABLE_HEADERS, ejemploAirtable()]);
    ws["!cols"] = AIRTABLE_HEADERS.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads-Base");
    XLSX.writeFile(wb, "plantilla_clientes_airtable.xlsx");
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
      const lotes = partirEnLotes(texto);
      let validas = 0;
      const errs: string[] = [];
      for (let i = 0; i < lotes.length; i++) {
        setResultado(`Validando lote ${i + 1} de ${lotes.length}…`);
        try {
          const r = await apiOperacion<{ total?: number; validas?: number; errores?: string[] }>("validarArchivoClientes", { csv: lotes[i] });
          validas += r?.validas ?? 0;
          for (const e of (r?.errores ?? [])) {
            if (errs.length < 200) errs.push(e);
          }
        } catch {
          errs.push(`Lote ${i + 1}: no se pudo validar (revisa tu conexión o actualiza el backend)`);
        }
      }
      setResultado(errs.length === 0
        ? `Archivo válido: ${validas} filas listas para crear.`
        : `${validas} válidas · ${errs.length} errores:\n${errs.slice(0, 10).join("\n")}${errs.length > 10 ? `\n…y ${errs.length - 10} más` : ""}`);
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
      const lotes = partirEnLotes(texto);
      let total = 0;
      let insertadas = 0;
      const errs: string[] = [];
      for (let i = 0; i < lotes.length; i++) {
        setResultado(`Procesando lote ${i + 1} de ${lotes.length}… (${insertadas} creados)`);
        try {
          const r = await apiOperacion<{ total?: number; insertadas?: number; errores?: string[] }>("cargaMasivaClientes", { csv: lotes[i], validar_sap: validarSap });
          total += r?.total ?? 0;
          insertadas += r?.insertadas ?? 0;
          for (const e of (r?.errores ?? [])) {
            if (errs.length < 200) errs.push(e);
          }
        } catch (e) {
          errs.push(`Lote ${i + 1}: ${e instanceof Error ? e.message : "no se pudo procesar"}`);
        }
      }
      setResultado(`Creados ${insertadas} de ${total}.${errs.length > 0 ? `\nErrores:\n${errs.slice(0, 10).join("\n")}${errs.length > 10 ? `\n…y ${errs.length - 10} más` : ""}` : ""}`);
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
                <p className="text-xs text-slate-500">Usa la plantilla oficial formato Airtable (Leads-Base) y conserva las cabeceras sin cambios. Se admiten hasta 20,000 filas por archivo. Obligatorios: DNI Cliente y Nombres y Apellidos.</p>
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
  const [editar, setEditar] = useState<Cliente | null>(null);

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
      <ModHead
        eyebrow="GESTIÓN COMERCIAL"
        title="Clientes"
        desc="Registra, consulta y revisa personas naturales o jurídicas, incluyendo su vinculación posterior con el código de cliente SAP."
        actions={<>
          <button className="btn-white !text-[#0099D8]" onClick={() => cargar(page, pageSize)} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button>
          <button className="btn-white !text-[#0099D8]" onClick={() => setShowCarga(true)}>Carga masiva</button>
          <button className="btn-green" onClick={() => setShowNuevo(true)}>Nuevo cliente</button>
        </>}
      />

      <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Buscar cliente</label>
          <input className="input" placeholder="Documento, nombre, cuenta contrato (exacto o parcial)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
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
            <thead><tr><th>ID</th><th>DOCUMENTO</th><th>CLIENTE</th><th>CTA. CONTRATO</th><th>CONTACTO</th><th>DISTRITO</th><th>CÓDIGO SAP</th><th>REVISIÓN</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const activo = String(c.estado ?? "").toUpperCase() === "ACTIVO";
                const rev = revisionDe(c);
                return (
                  <tr key={String(c.id)}>
                    <td className="font-mono text-xs break-all">{String(c.id)}</td>
                    <td><p className="font-bold">{docDe(c)}</p><p className="text-[11px] text-slate-400">{tipoDocDe(c)}</p></td>
                    <td><p className="font-bold uppercase">{nombreDe(c)}</p><p className="text-[11px] text-slate-400 uppercase">{c.contacto || ""}</p></td>
                    <td className="font-bold">{c.cuenta_contrato || "—"}</td>
                    <td><p>{[c.telefono, c.telefono2].filter(Boolean).join(" · ") || "—"}</p><p className="text-[11px] text-slate-400">{correoDe(c) || "Sin correo"}</p></td>
                    <td>{c.distrito || "—"}</td>
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
                      <div className="flex gap-1.5">
                        <AccVer title="Visualizar cliente" onClick={() => setVer(c)} />
                        <AccEditar title="Editar cliente" onClick={() => setEditar(c)} />
                        {activo
                          ? <AccDesactivar title="Inactivar cliente" onClick={() => cambiarEstado(c)} />
                          : <AccActivar title="Activar cliente" onClick={() => cambiarEstado(c)} />}
                      </div>
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
      {ver && <VisualizarModal c={ver} onClose={() => setVer(null)} onCambio={(nuevo) => { setRows((prev) => prev.map((r) => String(r.id) === String(nuevo.id) ? { ...r, ...nuevo } : r)); setVer((prev) => (prev ? { ...prev, ...nuevo } : prev)); }} />}
      {editar && <EditarClienteModal c={editar} onClose={() => setEditar(null)} onGuardado={() => cargar(page, pageSize)} />}
    </Shell></AuthGate>
  );
}
