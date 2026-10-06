"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState, formatoFecha, formatoMoneda } from "@/components/Tablas";
import { AccAbrir, AccValidar } from "@/components/Accion";
import VentaModal from "@/components/VentaModal";
import {
  BadgeEstadoVenta,
  ESTADOS_VENTA,
  etiquetaEstado,
  Venta,
  ventaCanal,
  ventaCliente,
  ventaDoc,
  ventaEstado,
  ventaFecha,
  ventaId,
  ventaItems,
  ventaNumero,
  ventaProveedor,
  ventaTotal,
} from "@/components/VentasComun";


export default function VentasPage() {
  const [rows, setRows] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fEst, setFEst] = useState("TODOS");
  const [fCanal, setFCanal] = useState("TODOS");
  const [nueva, setNueva] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [validando, setValidando] = useState<string | null>(null);

  const aprobarAbonos = async (v: Venta) => {
    const idv = ventaId(v);
    setError(null);
    setInfo(null);
    setValidando(idv);
    try {
      const d = await apiOperacion<{ abonos?: { id?: string | number; estado?: string }[] }>("getVenta", { id: idv });
      const lista = Array.isArray(d?.abonos) ? d.abonos : [];
      const pendientes = lista.filter((a) => String(a.estado ?? "").toLowerCase() === "pendiente");
      if (pendientes.length === 0) {
        setInfo(`Sin abonos pendientes en ${ventaNumero(v)}. La aprobación de la venta se hace dentro del detalle.`);
        return;
      }
      for (const a of pendientes) {
        await apiOperacion("validarAbono", { abono_id: String(a.id ?? ""), accion: "validar" });
      }
      setInfo(`Abonos aprobados en ${ventaNumero(v)}: ${pendientes.length}.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron aprobar los abonos");
    } finally {
      setValidando(null);
    }
  };

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarVentas", { limit: 200, page: 1, pageSize: 200 });
      const arr = Array.isArray(datos) ? datos : ((datos as { rows?: unknown })?.rows ?? []);
      setRows(Array.isArray(arr) ? (arr as Venta[]) : []);
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

  const filtradas = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((v) => {
      if (s && ![ventaNumero(v), ventaCliente(v), ventaDoc(v)].join(" ").toLowerCase().includes(s)) return false;
      if (fEst !== "TODOS" && ventaEstado(v).toLowerCase() !== fEst) return false;
      if (fCanal !== "TODOS" && ventaCanal(v) !== fCanal.toLowerCase()) return false;
      return true;
    });
  }, [rows, q, fEst, fCanal]);

  const exportar = async () => {
    setExportando(true);
    setError(null);
    try {
      let base: Venta[] = [];
      try {
        const r = await apiOperacion<unknown>("exportarVentas", {
          estado: fEst === "TODOS" ? "" : fEst.toLowerCase(),
          canal: fCanal === "TODOS" ? "" : fCanal.toLowerCase(),
        });
        const o = r as { columnas?: string[]; filas?: unknown[][]; rows?: unknown };
        if (Array.isArray(o?.filas) && Array.isArray(o?.columnas) && o.filas.length > 0) {
          const XLSX = await import("xlsx");
          const hoja = XLSX.utils.aoa_to_sheet([o.columnas as string[], ...(o.filas as unknown[][])]);
          hoja["!cols"] = (o.columnas as string[]).map(() => ({ wch: 18 }));
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, hoja, "Ventas");
          XLSX.writeFile(wb, "ventas.xlsx");
          setInfo(`Exportadas ${o.filas.length} filas a ventas.xlsx.`);
          return;
        }
        const arr = Array.isArray(r) ? r : ((r as { rows?: unknown })?.rows ?? []);
        if (Array.isArray(arr) && arr.length > 0) base = arr as Venta[];
      } catch (e) {
        if (base.length === 0) throw e instanceof Error ? e : new Error("No se pudo exportar");
      }
      if (base.length === 0) base = filtradas;
      if (base.length === 0) throw new Error("Sin filas para exportar con los filtros actuales.");
      const XLSX = await import("xlsx");
      const hoja = XLSX.utils.json_to_sheet(
        base.map((v) => ({
          NUMERO: ventaNumero(v),
          CLIENTE: ventaCliente(v),
          DOCUMENTO: ventaDoc(v),
          PROVEEDOR: ventaProveedor(v),
          CANAL: ventaCanal(v),
          ESTADO: ventaEstado(v),
          TOTAL: ventaTotal(v),
          ACTUALIZACION: ventaFecha(v),
        }))
      );
      hoja["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, hoja, "Ventas");
      XLSX.writeFile(wb, "ventas.xlsx");
      setInfo(`Exportadas ${base.length} filas a ventas.xlsx.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  };

  return (
    <AuthGate>
      <Shell>
        <ModHead
          eyebrow="REGISTRO DE VENTAS"
          title="Solicitudes de venta"
          desc="Solicitudes comerciales con aprobación, abonos e instalación."
          actions={<>
            <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button>
            <button className="btn-white" onClick={exportar} disabled={exportando}>{exportando ? "Exportando…" : "Exportar XLSX"}</button>
            <button className="btn-green" onClick={() => setNueva(true)}>+ Nueva solicitud</button>
          </>}
        />

        <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="label">Buscar</label>
            <input className="input" placeholder="Número, cliente o documento" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input !w-auto" value={fEst} onChange={(e) => setFEst(e.target.value)}>
              <option value="TODOS">Todos</option>
              {ESTADOS_VENTA.map((e) => <option key={e} value={e}>{etiquetaEstado(e)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Canal</label>
            <select className="input !w-auto" value={fCanal} onChange={(e) => setFCanal(e.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="proveedor">Proveedor</option>
              <option value="microaliado">Microaliado</option>
              <option value="contratista">Contratista</option>
            </select>
          </div>
          <button className="btn-white !py-2" onClick={() => { setQ(""); setFEst("TODOS"); setFCanal("TODOS"); }}>Limpiar filtros</button>
        </div>

        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
        {info && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}

        {loading ? (
          <div className="card p-6 mt-4 text-sm text-[#0099D8]">Cargando ventas…</div>
        ) : filtradas.length === 0 ? (
          <div className="mt-4"><EmptyState titulo="Sin solicitudes de venta" detalle="No hay ventas registradas con esos filtros. Usa «Nueva solicitud»." /></div>
        ) : (
          <div className="card mt-4">
            <div className="px-5 py-3 border-b font-semibold">Solicitudes · {filtradas.length}</div>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead><tr><th>NÚMERO</th><th>CLIENTE</th><th>PROVEEDOR</th><th>CANAL</th><th>ESTADO</th><th>TOTAL</th><th>ACTUALIZACIÓN</th><th>ACCIONES</th></tr></thead>
                <tbody>
                  {filtradas.map((v, i) => (
                    <tr key={ventaId(v) || i}>
                      <td className="font-mono text-xs font-bold">{ventaNumero(v)}</td>
                      <td className="font-medium">{ventaCliente(v)}{ventaDoc(v) ? <span className="block text-[11px] text-slate-400">{ventaDoc(v)}</span> : null}</td>
                      <td>{ventaProveedor(v)}</td>
                      <td className="capitalize">{ventaCanal(v)}</td>
                      <td><BadgeEstadoVenta estado={ventaEstado(v)} /></td>
                      <td className="whitespace-nowrap font-bold">{formatoMoneda(ventaTotal(v))}</td>
                      <td className="whitespace-nowrap text-xs text-slate-500">{ventaFecha(v) ? formatoFecha(ventaFecha(v)) : "—"}</td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1.5">
                          <AccAbrir title="Abrir solicitud (aprobar dentro del detalle)" href={`/ventas/${encodeURIComponent(ventaId(v) || "")}`} />
                          <AccValidar title="Aprobar abonos pendientes" disabled={validando === ventaId(v)} onClick={() => aprobarAbonos(v)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {nueva && (
          <VentaModal onClose={() => { setNueva(false); cargar(); }} />
        )}
      </Shell>
    </AuthGate>
  );
}
