"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Espacio = "" | "COTIZACION" | "VENTAS";

type Material = {
  id: string;
  codigo?: string;
  codigo_sap?: string | null;
  nombre: string;
  descripcion?: string | null;
  unidad?: string | null;
  espacio?: string | null;
  espacio_remodelar?: string | null;
  responsable?: string | null;
  proveedor_nombre?: string | null;
  asesor_nombre?: string | null;
  id_proveedor?: string | null;
  id_oficina?: string | null;
  id_grupo?: string | null;
  oficina?: string | null;
  grupo?: string | null;
  precio_vigente?: number | null;
  tarifa_vigente?: boolean | null;
};

type Opcion = { id: string; etiqueta: string };

const CABECERAS_PLANTILLA = [
  "ESPACIO",
  "ESPACIO A REMODELAR",
  "MATERIAL",
  "PRODUCTOS/SERVICIOS",
  "PRECIO",
  "RESPONSABLE DE VENTA",
  "PROVEEDOR",
  "ASESOR",
  "OFICINA DE VENTA",
  "GRUPO DE VENDEDORES",
];

const FILA_EJEMPLO = [
  "VENTAS",
  "COCINA",
  "SAP-000123",
  "Cocina | Muebles Altos (60cm Alto)",
  "550.00",
  "JUAN PEREZ",
  "MUEBLES S.A.C.",
  "MARIA LOPEZ",
  "OFV-LIMA",
  "GVE-LIMA-01",
];

function aCsvLinea(celdas: (string | number)[]): string {
  return celdas.map((c) => String(c).replace(/;/g, ",")).join(";");
}

function fmtPrecio(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `S/ ${Number(v).toFixed(2)}`;
}

function responsableDe(m: Material): string {
  const directo = String((m.responsable ?? "") as string).trim();
  if (directo) return directo;
  const d = String(m.descripcion ?? "").trim();
  const pref = /^responsable\s*:\s*/i;
  if (pref.test(d)) return d.replace(pref, "").trim() || "—";
  return "—";
}

/* ------------------------------------------------------------------ */
/* Modal: carga masiva                                                 */
/* ------------------------------------------------------------------ */

function CargaMasivaModal({ onClose, onProcesado }: { onClose: () => void; onProcesado: () => void }) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [reporte, setReporte] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const descargarCSV = () => {
    const csv = `${aCsvLinea(CABECERAS_PLANTILLA)}\n${aCsvLinea(FILA_EJEMPLO)}\n`;
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_materiales.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const descargarXLSX = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([CABECERAS_PLANTILLA, FILA_EJEMPLO]);
    ws["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MATERIALES");
    XLSX.writeFile(wb, "plantilla_materiales.xlsx");
  };

  const leerArchivo = async (f: File) => {
    setMsg(null);
    setReporte(null);
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
    setMsg(null);
    setReporte(null);
    if (!texto.trim()) {
      setMsg("Selecciona o arrastra un archivo CSV/XLSX primero.");
      return;
    }
    setTrabajando(true);
    try {
      const r = await apiOperacion<{ total?: number; validas?: number; errores?: string[] }>("validarArchivoMateriales", {
        csv: texto,
      });
      const errs = r?.errores ?? [];
      setReporte(
        errs.length === 0
          ? `Archivo válido: ${r?.validas ?? 0} de ${r?.total ?? 0} filas listas para crear.`
          : `${r?.validas ?? 0} válidas · ${errs.length} errores:\n${errs.slice(0, 10).join("\n")}${
              errs.length > 10 ? `\n…y ${errs.length - 10} más` : ""
            }`
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo validar");
    } finally {
      setTrabajando(false);
    }
  };

  const crear = async () => {
    setMsg(null);
    setReporte(null);
    if (!texto.trim()) {
      setMsg("Selecciona o arrastra un archivo CSV/XLSX primero.");
      return;
    }
    setTrabajando(true);
    try {
      const r = await apiOperacion<{ total?: number; insertadas?: number; errores?: string[] }>("cargaMasivaMateriales", {
        csv: texto,
      });
      const errs = r?.errores ?? [];
      setReporte(
        `Creados ${r?.insertadas ?? 0} de ${r?.total ?? 0}.${errs.length > 0 ? `\nErrores:\n${errs.slice(0, 10).join("\n")}${errs.length > 10 ? `\n…y ${errs.length - 10} más` : ""}` : ""}`
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
            <h2 className="font-bold text-lg">Carga masiva de materiales</h2>
            <p className="text-sm text-slate-500">Valida un archivo CSV o XLSX antes de crear materiales (con tarifa inicial si trae precio).</p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold text-sm">1. Preparar archivo</p>
                <p className="text-xs text-slate-500">Conserva las cabeceras sin cambios. Máximo 500 filas.</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-white !text-xs" onClick={descargarCSV}>
                  Plantilla CSV
                </button>
                <button className="btn-white !text-xs" onClick={descargarXLSX}>
                  Plantilla XLSX
                </button>
              </div>
            </div>
            <label
              className="mt-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center cursor-pointer hover:border-[#0099D8]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) leerArchivo(f);
              }}
            >
              <p className="font-bold text-sm">Selecciona o arrastra un archivo CSV / XLSX</p>
              <p className="text-xs text-slate-500 mt-1">El XLSX se convierte a CSV con separador ; antes de validar.</p>
              <span className="btn-white !text-xs mt-3">Seleccionar archivo</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) leerArchivo(f);
                }}
              />
            </label>
            {archivo && <p className="text-[11px] text-slate-500 mt-2">Seleccionado: {archivo}</p>}
          </div>
          {msg && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
          {reporte && (
            <p className="text-sm rounded-lg bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 whitespace-pre-line">
              {reporte}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-white !text-[#0099D8]" onClick={validar} disabled={trabajando}>
            {trabajando ? "Validando…" : "Validar archivo"}
          </button>
          <button className="btn-green" onClick={crear} disabled={trabajando}>
            {trabajando ? "Procesando…" : "Crear materiales"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal: nuevo material                                               */
/* ------------------------------------------------------------------ */

function NuevoMaterialModal({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [espacio, setEspacio] = useState<"COTIZACION" | "VENTAS">("VENTAS");
  const [espacioRemodelar, setEspacioRemodelar] = useState("");
  const [codigoSap, setCodigoSap] = useState("");
  const [unidad, setUnidad] = useState("UND");
  const [precio, setPrecio] = useState("");
  const [idProveedor, setIdProveedor] = useState("");
  const [asesor, setAsesor] = useState("");
  const [idOficina, setIdOficina] = useState("");
  const [idGrupo, setIdGrupo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [proveedores, setProveedores] = useState<Opcion[]>([]);
  const [oficinas, setOficinas] = useState<Opcion[]>([]);
  const [grupos, setGrupos] = useState<Opcion[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [p, o, g] = await Promise.all([
          apiOperacion<Record<string, unknown>[]>("listarProveedoresSGT", {}),
          apiOperacion<Record<string, unknown>[]>("listarOficinasVentas", {}),
          apiOperacion<Record<string, unknown>[]>("listarGruposVendedores", {}),
        ]);
        setProveedores(
          (Array.isArray(p) ? p : []).map((r) => ({
            id: String(r.id ?? ""),
            etiqueta: String(r.nombre ?? r.razon_social ?? r.nombre_comercial ?? r.interlocutor ?? r.id ?? ""),
          })).filter((x) => x.id)
        );
        setOficinas(
          (Array.isArray(o) ? o : []).map((r) => ({
            id: String(r.id ?? ""),
            etiqueta: String(r.nombre ?? r.id ?? ""),
          })).filter((x) => x.id)
        );
        setGrupos(
          (Array.isArray(g) ? g : []).map((r) => ({
            id: String(r.id ?? ""),
            etiqueta: String(r.nombre ?? r.grupo ?? r.id ?? ""),
          })).filter((x) => x.id)
        );
      } catch {
        // Los selects quedan vacíos; el backend acepta nulos.
      }
    })();
  }, []);

  const guardar = async () => {
    setMsg(null);
    if (nombre.trim().length < 2) {
      setMsg("El nombre es obligatorio (mínimo 2 caracteres).");
      return;
    }
    let precioNum: number | undefined;
    if (precio.trim() !== "") {
      const p = Number(precio.trim().replace(",", "."));
      if (!Number.isFinite(p) || p < 0) {
        setMsg("Precio inicial inválido.");
        return;
      }
      precioNum = Math.round(p * 100) / 100;
    }
    setGuardando(true);
    try {
      await apiOperacion("crearMaterialSGT", {
        nombre: nombre.trim(),
        espacio,
        espacio_remodelar: espacioRemodelar.trim(),
        codigo_sap: codigoSap.trim(),
        unidad: unidad.trim() || "UND",
        ...(precioNum != null ? { precio: precioNum } : {}),
        id_proveedor: idProveedor || null,
        asesor_nombre: asesor.trim(),
        id_oficina: idOficina || null,
        id_grupo: idGrupo || null,
      });
      onGuardado();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 my-6">
        <h2 className="text-lg font-extrabold">Nuevo material</h2>
        <div className="grid gap-3 mt-4">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Cocina | Muebles Altos" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Espacio *</label>
              <select className="input" value={espacio} onChange={(e) => setEspacio(e.target.value as "COTIZACION" | "VENTAS")}>
                <option value="COTIZACION">COTIZACION</option>
                <option value="VENTAS">VENTAS</option>
              </select>
            </div>
            <div>
              <label className="label">Espacio a remodelar</label>
              <input className="input" value={espacioRemodelar} onChange={(e) => setEspacioRemodelar(e.target.value)} placeholder="Ej. COCINA" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Código SAP</label>
              <input className="input" value={codigoSap} onChange={(e) => setCodigoSap(e.target.value)} placeholder="SAP-…" />
            </div>
            <div>
              <label className="label">Unidad</label>
              <input className="input" value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="UND" />
            </div>
          </div>
          <div>
            <label className="label">Precio inicial (S/)</label>
            <input className="input" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </div>
          <div>
            <label className="label">Proveedor</label>
            <select className="input" value={idProveedor} onChange={(e) => setIdProveedor(e.target.value)}>
              <option value="">— Sin proveedor —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Asesor</label>
            <input className="input" value={asesor} onChange={(e) => setAsesor(e.target.value)} placeholder="Nombre del asesor" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Oficina de venta</label>
              <select className="input" value={idOficina} onChange={(e) => setIdOficina(e.target.value)}>
                <option value="">— Ninguna —</option>
                {oficinas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Grupo de vendedores</label>
              <select className="input" value={idGrupo} onChange={(e) => setIdGrupo(e.target.value)}>
                <option value="">— Ninguno —</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {msg && <p className="mt-3 text-xs text-red-700">{msg}</p>}
        <div className="flex gap-2 mt-4">
          <button className="btn-white flex-1" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Crear material"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export default function MaterialesPage() {
  const [modal, setModal] = useState<null | "material" | "carga">(null);
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qEnviado, setQEnviado] = useState("");
  const [espacio, setEspacio] = useState<Espacio>("");

  const cargar = useCallback(async (busqueda: string, esp: Espacio) => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarMaterialesSGT", {
        q: busqueda,
        ...(esp ? { espacio: esp } : {}),
        limit: 200,
      });
      setRows(Array.isArray(datos) ? (datos as Material[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar("", "");
  }, [cargar]);

  const buscar = () => {
    setQEnviado(q);
    cargar(q, espacio);
  };

  const cambiarEspacio = (v: Espacio) => {
    setEspacio(v);
    cargar(qEnviado, v);
  };

  const limpiar = () => {
    setQ("");
    setQEnviado("");
    setEspacio("");
    cargar("", "");
  };

  return (
    <AuthGate>
      <Shell>
        <ModHead
          eyebrow="GESTIÓN COMERCIAL"
          title="Materiales"
          desc="Hoja MATERIALES: maestro con espacio, tarifa vigente y responsables de venta."
          actions={
            <>
              <button className="btn-white" onClick={() => cargar(qEnviado, espacio)} disabled={loading}>
                {loading ? "Cargando…" : "Actualizar"}
              </button>
              <button className="btn-white" onClick={() => setModal("carga")}>
                Carga masiva
              </button>
              <button className="btn-green" onClick={() => setModal("material")}>
                + Nuevo material
              </button>
            </>
          }
        />

        <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Buscar</label>
            <input
              className="input !w-56"
              placeholder="Nombre o SAP…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") buscar();
              }}
            />
          </div>
          <div>
            <label className="label">Espacio</label>
            <select className="input" value={espacio} onChange={(e) => cambiarEspacio(e.target.value as Espacio)}>
              <option value="">Todos</option>
              <option value="COTIZACION">COTIZACION</option>
              <option value="VENTAS">VENTAS</option>
            </select>
          </div>
          <button className="btn-white" onClick={buscar} disabled={loading}>
            Buscar
          </button>
          <button className="btn-white !py-1.5 !text-xs" onClick={limpiar}>
            Limpiar
          </button>
        </div>

        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}

        {loading ? (
          <div className="card p-10 mt-4 text-center text-slate-500">Cargando materiales…</div>
        ) : rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState titulo="Sin materiales" detalle="Usa «Nuevo material» o «Carga masiva»." />
          </div>
        ) : (
          <div className="table-wrap mt-4">
            <table className="tabla">
              <thead>
                <tr>
                  <th>ESPACIO</th>
                  <th>ESPACIO REMODELAR</th>
                  <th>PRODUCTO</th>
                  <th>PRECIO</th>
                  <th>RESPONSABLE</th>
                  <th>PROVEEDOR</th>
                  <th>ASESOR</th>
                  <th>OFICINA</th>
                  <th>GRUPO</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.espacio ?? "—"}</td>
                    <td>{m.espacio_remodelar ?? "—"}</td>
                    <td>
                      <span className="font-semibold">{m.nombre}</span>
                      <span className="block text-[11px] text-slate-500 font-mono">{m.codigo ?? m.codigo_sap ?? m.id}</span>
                    </td>
                    <td>{fmtPrecio(m.precio_vigente)}</td>
                    <td>{responsableDe(m)}</td>
                    <td>{m.proveedor_nombre ?? "—"}</td>
                    <td>{m.asesor_nombre ?? "—"}</td>
                    <td>{m.oficina ?? m.id_oficina ?? "—"}</td>
                    <td>{m.grupo ?? m.id_grupo ?? "—"}</td>
                    <td className="text-slate-400">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {modal === "material" && <NuevoMaterialModal onClose={() => setModal(null)} onGuardado={() => cargar(qEnviado, espacio)} />}
        {modal === "carga" && <CargaMasivaModal onClose={() => setModal(null)} onProcesado={() => cargar(qEnviado, espacio)} />}
      </Shell>
    </AuthGate>
  );
}
