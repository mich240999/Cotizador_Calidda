"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
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
  const [trabajando, setTrabajando] = useState(false);

  const descargarPlantillaCSV = () => {
    const csv = "codigo;precio;vigente_desde;vigente_hasta\nMAT-001;1299.00;01.01.2026;\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_tarifas.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const descargarPlantillaXLSX = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["codigo", "precio", "vigente_desde", "vigente_hasta"],
      ["MAT-001", 1299.0, "01.01.2026", ""],
    ]);
    ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tarifas");
    XLSX.writeFile(wb, "plantilla_tarifas.xlsx");
  };

  const leerArchivo = async (f: File) => {
    setMsg(null);
    setArchivo(f.name);
    try {
      if (/\.xlsx?$|\.xls$/i.test(f.name) || f.type.includes("spreadsheet") || f.type.includes("excel")) {
        const XLSX = await import("xlsx");
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // Primera hoja -> CSV con ; como separador (mismo formato del backend).
        const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
        setTexto(csv.trim());
        setMsg(`Archivo ${f.name} leído. Revisa el contenido y pulsa Procesar.`);
      } else {
        const t = await f.text();
        setTexto(t.trim());
        setMsg(`Archivo ${f.name} leído. Revisa el contenido y pulsa Procesar.`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? `No se pudo leer el archivo: ${e.message}` : "No se pudo leer el archivo");
    }
  };

  const procesar = async () => {
    setMsg(null);
    if (!texto.trim()) {
      setMsg("Selecciona un archivo CSV/XLSX o pega el contenido (cabecera codigo;precio;vigente_desde;vigente_hasta)");
      return;
    }
    setTrabajando(true);
    try {
      const r = await apiOperacion<{ total?: number; insertadas?: number }>("cargaMasivaTarifas", { csv: texto });
      setMsg(`Procesado: ${r?.insertadas ?? 0} de ${r?.total ?? 0} filas insertadas`);
      onProcesado();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo procesar");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-extrabold">Carga masiva CSV / XLSX</h2>
        <p className="text-xs text-slate-500 mt-1">Fechas en formato dd.mm.yyyy · máximo 1000 filas por archivo.</p>
        <label className="label mt-4">Archivo (.csv, .xlsx, .xls)</label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) leerArchivo(f);
          }}
        />
        {archivo && <p className="text-[11px] text-slate-500 mt-1">Seleccionado: {archivo}</p>}
        <textarea className="input min-h-[120px] mt-3 font-mono text-xs" placeholder="codigo;precio;vigente_desde;vigente_hasta" value={texto} onChange={(e) => setTexto(e.target.value)} />
        {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
        <div className="flex gap-2 mt-4">
          <button className="btn-white flex-1 !text-xs" onClick={descargarPlantillaCSV}>Plantilla CSV</button>
          <button className="btn-white flex-1 !text-xs" onClick={descargarPlantillaXLSX}>Plantilla XLSX</button>
          <button className="btn-green flex-1" onClick={procesar} disabled={trabajando}>{trabajando ? "Procesando…" : "Procesar"}</button>
        </div>
        <button onClick={onClose} className="mt-3 w-full text-xs text-slate-400 font-semibold">Cerrar</button>
      </div>
    </div>
  );
}

function NuevoPrecioModal({ onClose, materiales, onGuardado }: { onClose: () => void; materiales: Material[]; onGuardado: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [precio, setPrecio] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setMsg(null);
    if (!codigo.trim()) {
      setMsg("Indica el código del material");
      return;
    }
    const p = Number(precio);
    if (!Number.isFinite(p) || p < 0) {
      setMsg("Precio inválido");
      return;
    }
    if (!desde.trim()) {
      setMsg("Indica vigente_desde (dd.mm.yyyy)");
      return;
    }
    setGuardando(true);
    try {
      await apiOperacion("crearTarifa", {
        codigo: codigo.trim(),
        precio: p,
        vigente_desde: desde.trim(),
        ...(hasta.trim() ? { vigente_hasta: hasta.trim() } : {}),
      });
      onGuardado();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-extrabold">Nuevo precio</h2>
        <div className="grid gap-3 mt-4">
          <div><label className="label">Material (código)</label>
            <input className="input" placeholder="Código…" value={codigo} onChange={(e) => setCodigo(e.target.value)} list="lista-mat" />
            <datalist id="lista-mat">{materiales.map((m) => <option key={m.id} value={m.codigo ?? ""}>{m.nombre}</option>)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Precio unitario (S/)</label><input className="input" placeholder="0.00" value={precio} onChange={(e) => setPrecio(e.target.value)} /></div>
            <div><label className="label">Moneda</label><input className="input" value="PEN" readOnly /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Fecha inicio</label><input className="input" placeholder="dd.mm.yyyy" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
            <div><label className="label">Fecha fin</label><input className="input" placeholder="dd.mm.yyyy" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          </div>
        </div>
        {msg && <p className="mt-3 text-xs text-slate-600">{msg}</p>}
        <div className="flex gap-2 mt-4">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Registrar tarifa"}</button>
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
  const [tab, setTab] = useState<"mat" | "tar">("mat");
  const [modal, setModal] = useState<null | "carga" | "precio" | "material">(null);
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">Materiales</h1>
          <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
        </div>
        <div className="flex gap-2 mt-3">
          {(["mat", "tar"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === t ? "bg-[#0099D8] text-white" : "bg-white border text-slate-600"}`}>
              {t === "mat" ? "Materiales" : "Tarifario"}
            </button>
          ))}
        </div>

        <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
          <div><label className="label">Buscar</label><input className="input !w-56" placeholder="Código o nombre…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div><label className="label">Estado</label><select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option><option>Activo</option><option>Inactivo</option></select></div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-white" onClick={() => setModal("carga")}>Carga masiva</button>
            {tab === "mat"
              ? <button className="btn-green" onClick={() => setModal("material")}>+ Nuevo material</button>
              : <button className="btn-green" onClick={() => setModal("precio")}>+ Nuevo precio</button>}
          </div>
        </div>
        <div className="mt-2"><button className="btn-white !py-1.5 !text-xs" onClick={limpiar}>Limpiar filtros</button></div>

        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}

        {loading ? (
          <div className="card p-10 mt-4 text-center text-slate-500">Cargando materiales…</div>
        ) : tab === "mat" ? (
          filtrados.length === 0 ? (
            <div className="mt-4"><EmptyState titulo="Sin materiales" detalle="Usa «Nuevo material» o «Carga masiva»." /></div>
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
          )
        ) : filtrados.length === 0 ? (
          <div className="mt-4"><EmptyState titulo="Sin tarifas" detalle="Sin tarifas registradas en el backend." /></div>
        ) : (
          <div className="card p-5 mt-4">
            <div className="table-wrap mt-2">
              <table className="tabla">
                <thead><tr><th>MATERIAL</th><th>TARIFA VIGENTE</th><th>VIGENCIA</th></tr></thead>
                <tbody>
                  {filtrados.map((m) => (
                    <tr key={m.id}>
                      <td>{m.nombre}</td>
                      <td>S/ {Number(m.precio_vigente ?? m.precio_unit ?? 0).toFixed(2)}{m.tarifa_vigente ? "" : " (base)"}</td>
                      <td>{m.fecha_tarifa ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {modal === "carga" && <CargaMasivaModal onClose={() => setModal(null)} onProcesado={cargar} />}
        {modal === "precio" && <NuevoPrecioModal onClose={() => setModal(null)} materiales={rows} onGuardado={cargar} />}
        {modal === "material" && <NuevoMaterialModal onClose={() => setModal(null)} onGuardado={cargar} />}
      </Shell>
    </AuthGate>
  );
}
