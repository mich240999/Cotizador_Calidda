"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Material = {
  id: string;
  codigo?: string;
  nombre: string;
  unidad?: string;
  precio_unit?: number;
  precio_vigente?: number;
  tarifa_vigente?: boolean;
  fecha_tarifa?: string;
  activo?: boolean;
};

function CargaMasivaModal({ onClose, onProcesado }: { onClose: () => void; onProcesado: () => void }) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const descargarCSV = () => {
    const csv = "codigo_tmp;nombre;descripcion;unidad;precio\nTMP-00001;Cocina | Muebles Altos (60cm Alto);Estructura melamina blanca de 18mm;ML;550.00\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla_materiales.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const descargarXLSX = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["codigo_tmp", "nombre", "descripcion", "unidad", "precio"],
      ["TMP-00001", "Cocina | Muebles Altos (60cm Alto)", "Estructura melamina blanca de 18mm", "ML", 550.0],
    ]);
    ws["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 40 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiales");
    XLSX.writeFile(wb, "plantilla_materiales.xlsx");
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
      const r = await apiOperacion<{ total?: number; validas?: number; errores?: string[] }>("validarArchivoMateriales", { csv: texto });
      const errs = r?.errores ?? [];
      setResultado(errs.length === 0
        ? `Archivo válido: ${r?.validas ?? 0} filas listas para crear.`
        : `${r?.validas ?? 0} válidas · ${errs.length} errores:\n${errs.slice(0, 10).join("\n")}${errs.length > 10 ? `\n…y ${errs.length - 10} más` : ""}`);
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
      const r = await apiOperacion<{ total?: number; insertadas?: number; errores?: string[] }>("cargaMasivaMateriales", { csv: texto });
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
            <h2 className="font-bold text-lg">Carga masiva de materiales</h2>
            <p className="text-sm text-slate-500">Valida un archivo CSV o XLSX antes de crear materiales (con tarifa inicial si trae precio).</p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold text-sm">1. Preparar archivo</p>
                <p className="text-xs text-slate-500">Conserva las cabeceras sin cambios. Máximo 500 filas.</p>
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
          {msg && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
          {resultado && <p className="text-sm rounded-lg bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 whitespace-pre-line">{resultado}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>Cancelar</button>
          <button className="btn-white !text-[#0099D8]" onClick={validar} disabled={trabajando}>{trabajando ? "Validando…" : "Validar archivo"}</button>
          <button className="btn-green" onClick={crear} disabled={trabajando}>{trabajando ? "Procesando…" : "Crear materiales"}</button>
        </div>
      </div>
    </div>
  );
}

function NuevoMaterialModal({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [precio, setPrecio] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setMsg(null);
    if (nombre.trim().length < 2) {
      setMsg("El nombre es obligatorio");
      return;
    }
    const p = Number(precio);
    if (!Number.isFinite(p) || p < 0) {
      setMsg("Precio inválido");
      return;
    }
    setGuardando(true);
    try {
      await apiOperacion("crearMaterial", { nombre: nombre.trim(), codigo: codigo.trim(), precio_unit: p });
      onGuardado();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-extrabold">Nuevo material</h2>
        <div className="grid gap-3 mt-4">
          <div><label className="label">Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div><label className="label">Código</label><input className="input" placeholder="MAT-…" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></div>
          <div><label className="label">Precio unitario (S/)</label><input className="input" placeholder="0.00" value={precio} onChange={(e) => setPrecio(e.target.value)} /></div>
        </div>
        {msg && <p className="mt-3 text-xs text-slate-600">{msg}</p>}
        <div className="flex gap-2 mt-4">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Crear material"}</button>
        </div>
      </div>
    </div>
  );
}

export default function MaterialesPage() {
  const [modal, setModal] = useState<null | "material" | "carga">(null);
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarMaterialesSGT", { q, limit: 200 });
      setRows(Array.isArray(datos) ? (datos as Material[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
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
    const s = q.toLowerCase();
    return rows.filter((m) => {
      if (s && !m.nombre.toLowerCase().includes(s) && !String(m.codigo ?? "").toLowerCase().includes(s)) return false;
      if (estado === "Activo" && m.activo === false) return false;
      if (estado === "Inactivo" && m.activo !== false) return false;
      return true;
    });
  }, [rows, q, estado]);

  const limpiar = () => {
    setQ("");
    setEstado("");
  };

  return (
    <AuthGate>
      <Shell>
        <ModHead
          eyebrow="GESTIÓN COMERCIAL"
          title="Materiales"
          actions={<button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>}
        />

        <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
          <div><label className="label">Buscar</label><input className="input !w-56" placeholder="Código o nombre…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div><label className="label">Estado</label><select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option><option>Activo</option><option>Inactivo</option></select></div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-white" onClick={() => setModal("carga")}>Carga masiva</button>
            <button className="btn-green" onClick={() => setModal("material")}>+ Nuevo material</button>
          </div>
        </div>
        <div className="mt-2"><button className="btn-white !py-1.5 !text-xs" onClick={limpiar}>Limpiar filtros</button></div>

        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}

        {loading ? (
          <div className="card p-10 mt-4 text-center text-slate-500">Cargando materiales…</div>
        ) : filtrados.length === 0 ? (
          <div className="mt-4"><EmptyState titulo="Sin materiales" detalle="Usa «Nuevo material»." /></div>
        ) : (
          <div className="table-wrap mt-4">
            <table className="tabla">
              <thead><tr><th>ID</th><th>CÓDIGO</th><th>MATERIAL</th><th>MEDIDA</th><th>PRECIO VIGENTE</th><th>ESTADO</th></tr></thead>
              <tbody>
                {filtrados.map((m) => (
                  <tr key={m.id}>
                    <td className="font-mono text-xs">{String(m.id).slice(0, 8)}</td>
                    <td>{m.codigo ?? "—"}</td>
                    <td>{m.nombre}</td>
                    <td>{m.unidad ?? "—"}</td>
                    <td>S/ {Number(m.precio_vigente ?? m.precio_unit ?? 0).toFixed(2)}</td>
                    <td>{m.activo === false ? "Inactivo" : "Activo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {modal === "material" && <NuevoMaterialModal onClose={() => setModal(null)} onGuardado={cargar} />}
        {modal === "carga" && <CargaMasivaModal onClose={() => setModal(null)} onProcesado={cargar} />}
      </Shell>
    </AuthGate>
  );
}
