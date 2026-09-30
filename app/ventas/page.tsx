"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import VentaModal from "@/components/VentaModal";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState, formatoFecha, formatoMoneda } from "@/components/Tablas";
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

function ModalAprobar({ venta, onClose, onOk }: { venta: Venta; onClose: () => void; onOk: () => void }) {
  const [pedV, setPedV] = useState<Record<string, string>>({});
  const [pedA, setPedA] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Venta[]>(() => ventaItems(venta));
  const [cargandoItems, setCargandoItems] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (items.length > 0) return;
    let vivo = true;
    (async () => {
      setCargandoItems(true);
      try {
        const d = await apiOperacion<unknown>("getVenta", { id: ventaId(venta) });
        const det = (d && typeof d === "object" ? (d as { items?: Venta[] }).items : null) as Venta[] | null;
        if (vivo) setItems(Array.isArray(det) ? det : []);
      } catch {
        /* sin detalle: se usa número de pedido único */
      } finally {
        if (vivo) setCargandoItems(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aprobar = async () => {
    setMsg(null);
    setGuardando(true);
    try {
      if (items.length > 0) {
        const faltan = items.filter((it, i) => {
          const k = String((it as Record<string, unknown>).id ?? i);
          return !(pedV[k] ?? "").trim() && !(pedA[k] ?? "").trim();
        });
        if (faltan.length > 0) throw new Error("Cada ítem exige al menos un número (pedido de venta o de abono).");
        await apiOperacion("aprobarSolicitud", {
          solicitud_id: ventaId(venta),
          pedidos: items.map((it, i) => {
            const k = String((it as Record<string, unknown>).id ?? i);
            return {
              item_id: k,
              numero_pedido_venta: (pedV[k] ?? "").trim(),
              numero_pedido_abono: (pedA[k] ?? "").trim(),
            };
          }),
        });
      } else {
        if (!pedV.__unico?.trim() && !pedA.__unico?.trim()) throw new Error("Indica al menos un número de pedido para aprobar.");
        await apiOperacion("aprobarSolicitud", {
          solicitud_id: ventaId(venta),
          pedidos: [{ item_id: "0", numero_pedido_venta: (pedV.__unico ?? "").trim(), numero_pedido_abono: (pedA.__unico ?? "").trim() }],
        });
      }
      onOk();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo aprobar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-extrabold">Aprobar solicitud · {ventaNumero(venta)}</h2>
        <p className="text-xs text-slate-500 mt-1">Cliente: {ventaCliente(venta)} · Total: {formatoMoneda(ventaTotal(venta))}</p>
        <div className="mt-4 space-y-3">
          {cargandoItems && <p className="text-xs text-slate-500">Cargando ítems del backend…</p>}
          {items.length > 0 ? (
            items.map((it, i) => {
              const k = String((it as Record<string, unknown>).id ?? i);
              return (
                <div key={k + i} className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="label">N.º pedido venta · {String((it as Record<string, unknown>).nombre ?? (it as Record<string, unknown>).material ?? k)} *</label>
                    <input
                      className="input"
                      placeholder="Ej. PED-000123"
                      value={pedV[k] ?? ""}
                      onChange={(e) => setPedV((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label">N.º pedido abono · {(it as Record<string, unknown>).nombre ? String((it as Record<string, unknown>).nombre) : k}</label>
                    <input
                      className="input"
                      placeholder="Ej. ABO-000123 (opcional si hay venta)"
                      value={pedA[k] ?? ""}
                      onChange={(e) => setPedA((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="label">Número de pedido venta *</label>
                <input className="input" placeholder="Ej. PED-000123" value={pedV.__unico ?? ""} onChange={(e) => setPedV((p) => ({ ...p, __unico: e.target.value }))} />
              </div>
              <div>
                <label className="label">Número de pedido abono</label>
                <input className="input" placeholder="Ej. ABO-000123" value={pedA.__unico ?? ""} onChange={(e) => setPedA((p) => ({ ...p, __unico: e.target.value }))} />
              </div>
            </div>
          )}
        </div>
        {msg && <p className="mt-3 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
        <div className="flex gap-2 mt-4">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1" onClick={() => { setGuardando(true); aprobar(); }} disabled={guardando}>
            {guardando ? "Aprobando…" : "✓ Aprobar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VentasPage() {
  const [rows, setRows] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fEst, setFEst] = useState("TODOS");
  const [fCanal, setFCanal] = useState("TODOS");
  const [aprobar, setAprobar] = useState<Venta | null>(null);
  const [nueva, setNueva] = useState(false);
  const [exportando, setExportando] = useState(false);

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold tracking-widest text-emerald-600">REGISTRO DE VENTAS</p>
            <h1 className="text-2xl font-extrabold">Solicitudes de venta</h1>
            <p className="text-sm text-slate-500 mt-1">Solicitudes comerciales con aprobación, abonos e instalación.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button>
            <button className="btn-white" onClick={exportar} disabled={exportando}>{exportando ? "Exportando…" : "Exportar XLSX"}</button>
            <button className="btn-green" onClick={() => setNueva(true)}>+ Nueva solicitud</button>
          </div>
        </div>

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
                        <Link href={`/ventas/${encodeURIComponent(ventaId(v) || "")}`} className="btn-white !py-1 !px-3 text-xs !no-underline mr-2">Abrir</Link>
                        <button className="btn-green !py-1 !px-3 text-xs" title="Aprobar solicitud" onClick={() => setAprobar(v)}>✓</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {aprobar && (
          <ModalAprobar
            venta={aprobar}
            onClose={() => setAprobar(null)}
            onOk={() => { setAprobar(null); setInfo("Solicitud aprobada."); cargar(); }}
          />
        )}

        {nueva && (
          <VentaModal onClose={() => { setNueva(false); cargar(); }} />
        )}
      </Shell>
    </AuthGate>
  );
}
