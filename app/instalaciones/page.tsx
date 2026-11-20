"use client";

import { useEffect, useMemo, useState } from "react";
import EntregaInstalacion from "@/components/EntregaInstalacion";
import RevisionEvidencias from "@/components/RevisionEvidencias";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState, formatoFecha, formatoMoneda } from "@/components/Tablas";
import { BadgeEstadoVenta, SUSTENTOS_INSTALACION, useRolVista } from "@/components/VentasComun";

type Fila = Record<string, unknown>;

const enRango = (iso: unknown, desde: string, hasta: string) => {
  if (!desde && !hasta) return true;
  const t = new Date(String(iso ?? "")).getTime();
  if (Number.isNaN(t)) return false;
  if (desde && t < new Date(`${desde}T00:00:00`).getTime()) return false;
  if (hasta && t > new Date(`${hasta}T23:59:59`).getTime()) return false;
  return true;
};

const estadoInstDe = (v: Fila) => String(v.instalacion_estado ?? "pendiente_instalar");

type AccionInstalacion = "detalle" | "entrega" | "revision";

function evidenciasDe(v: Fila): Fila[] {
  return Array.isArray(v.evidencias) ? v.evidencias : [];
}

function VentanaInstalacion({ v, accion, onClose, onChanged }: {
  v: Fila; accion: AccionInstalacion; onClose: () => void; onChanged: () => void;
}) {
  const evidencias = evidenciasDe(v);
  const titulo = accion === "detalle" ? "Detalle de venta e instalación"
    : accion === "revision" ? "Revisar evidencias"
    : evidencias.some((e) => e.estado === "rechazado") ? "Subsanar adjuntos" : "Subir adjuntos";
  const guardar = () => { onChanged(); onClose(); };
  const campos = [
    ["Cliente", v.cliente_nombre], ["Cuenta contrato", v.cuenta_contrato],
    ["Proveedor", v.proveedor_nombre], ["Asesor", v.asesor_nombre],
    ["Cotización", v.cotizacion_codigo], ["PV de venta", v.numero_pedido], ["Orden PV de venta", v.orden_pedido_venta],
    ...(Number(v.anticipo ?? 0) > 0 ? [["PV de abono", v.pv_abono] as const, ["Orden PV de abono", v.orden_pedido_abono] as const] : []),
    ["Estado de venta", <BadgeEstadoVenta estado={String(v.estado ?? "")} />],
    ["Estado de instalación", estadoInstDe(v).replace(/_/g, " ")],
    ["Total", formatoMoneda(Number(v.monto_total ?? 0))], ["Ambiente", v.ambiente],
    ["Anticipo", formatoMoneda(Number(v.anticipo ?? 0))], ["Cuotas", v.nro_cuotas],
  ] as const;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-labelledby="instalacion-titulo" className="bg-white rounded-2xl w-full max-w-4xl shadow-xl my-6 overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50 flex justify-between gap-3">
          <h2 id="instalacion-titulo" className="font-bold text-lg">{titulo} · {String(v.id)}</h2>
          <button className="btn-white" onClick={onClose}>Cerrar</button>
        </div>
        <div className="p-6">
          {accion === "entrega" ? <EntregaInstalacion id={String(v.id)} evidencias={evidencias} onSaved={guardar} /> : <>
            {accion === "detalle" && <dl className="grid gap-3 sm:grid-cols-2">
              {campos.map(([nombre, valor]) => <div key={nombre}><dt className="label">{nombre}</dt><dd>{typeof valor === "object" && valor !== null ? valor as React.ReactNode : String(valor ?? "—")}</dd></div>)}
            </dl>}
            {accion === "detalle" && Array.isArray(v.items) && v.items.length > 0 && <div className="mt-4 overflow-x-auto">
              <table className="tabla">
                <thead><tr><th>Material</th><th>Cantidad</th><th>Subtotal</th><th>Pedido de venta</th><th>Pedido de abono</th></tr></thead>
                <tbody>{(v.items as Fila[]).map((item) => <tr key={String(item.id)}>
                  <td>{String(item.material_nombre ?? item.id_material ?? "—")}</td>
                  <td>{String(item.cantidad ?? "—")}</td>
                  <td>{formatoMoneda(Number(item.subtotal ?? 0))}</td>
                  <td>{String(item.numero_pedido_venta ?? "—")}</td>
                  <td>{String(item.numero_pedido_abono ?? "—")}</td>
                </tr>)}</tbody>
              </table>
            </div>}
            <RevisionEvidencias solicitudId={String(v.id)} evidencias={evidencias} esAdmin={accion === "revision"} onChanged={guardar} />
          </>}
        </div>
      </div>
    </div>
  );
}

export default function InstalacionesPage() {
  const { esAdmin, esProveedor } = useRolVista();
  const [rows, setRows] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fSol, setFSol] = useState("");
  const [fInst, setFInst] = useState("");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [ventana, setVentana] = useState<{ v: Fila; accion: AccionInstalacion } | null>(null);
  const [liquidacion, setLiquidacion] = useState<Fila | null>(null);
  const [ordenVenta, setOrdenVenta] = useState("");
  const [ordenAbono, setOrdenAbono] = useState("");
  const [notaLiquidacion, setNotaLiquidacion] = useState("");
  const [errorLiquidacion, setErrorLiquidacion] = useState("");
  const [liquidando, setLiquidando] = useState<string | null>(null);
  const [revirtiendo, setRevirtiendo] = useState<string | null>(null);

  const cargar = async (qry?: string) => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiOperacion<unknown>("listarInstalaciones", { q: (qry ?? q).trim(), limit: 200, page: 1, pageSize: 200 });
      const arr = Array.isArray(d) ? d : ((d as { rows?: unknown })?.rows ?? []);
      setRows(Array.isArray(arr) ? (arr as Fila[]) : []);
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

  const filtradas = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((v) => {
      if (s) {
        const hay = [String(v.id ?? ""), String(v.cotizacion_codigo ?? ""), String(v.cliente_nombre ?? ""), String(v.cliente_documento ?? ""), String(v.cuenta_contrato ?? ""), String(v.proveedor_nombre ?? ""), String(v.numero_pedido ?? ""), String(v.orden_pedido_venta ?? ""), String(v.pv_abono ?? ""), String(v.orden_pedido_abono ?? "")].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (fSol && String(v.estado ?? "").toLowerCase() !== fSol) return false;
      if (fInst && estadoInstDe(v) !== fInst) return false;
      if (!enRango(v.created_at, fDesde, fHasta)) return false;
      return true;
    });
  }, [rows, q, fSol, fInst, fDesde, fHasta]);

  const puedeLiquidar = (v: Fila) => esAdmin && estadoInstDe(v) === "pendiente_liquidar" && String(v.estado ?? "").toLowerCase() !== "liquidada";
  const puedeRevertir = (v: Fila) => {
    const ei = estadoInstDe(v);
    return ei === "pendiente_liquidar" || (esAdmin && ei === "liquidada");
  };

  const abrirLiquidacion = (v: Fila) => {
    setLiquidacion(v);
    setOrdenVenta(String(v.orden_pedido_venta ?? ""));
    setOrdenAbono(String(v.orden_pedido_abono ?? ""));
    setNotaLiquidacion("");
    setErrorLiquidacion("");
  };

  const liquidar = async () => {
    if (!liquidacion) return;
    const v = liquidacion;
    if (!ordenVenta.trim()) { setErrorLiquidacion("Ingresa la orden del PV de venta."); return; }
    if (Number(v.anticipo ?? 0) > 0 && !ordenAbono.trim()) { setErrorLiquidacion("Esta venta tiene abono; ingresa también la orden del PV de abono."); return; }
    setError(null);
    setInfo(null);
    setErrorLiquidacion("");
    setLiquidando(String(v.id));
    try {
      await apiOperacion("liquidarVenta", {
        solicitud_id: String(v.id),
        orden_pedido_venta: ordenVenta.trim(),
        orden_pedido_abono: ordenAbono.trim(),
        nota: notaLiquidacion.trim(),
      });
      setInfo(`Venta ${String(v.id)} liquidada. Fin del flujo.`);
      setLiquidacion(null);
      await cargar();
    } catch (e) {
      setErrorLiquidacion(e instanceof Error ? e.message : "No se pudo liquidar");
    } finally {
      setLiquidando(null);
    }
  };

  const revertir = async (v: Fila) => {
    const id = String(v.id);
    const nota = window.prompt(`Motivo de la reversión de ${id} (obligatorio):`, "");
    if (nota === null) return;
    if (!nota.trim()) { setError("La reversión exige una nota."); return; }
    setError(null);
    setInfo(null);
    setRevirtiendo(id);
    try {
      const r = await apiOperacion<{ estado?: string }>("revertirLiquidacion", { solicitud_id: id, nota: nota.trim() });
      setInfo(`Venta ${id} revertida a ${r?.estado ?? "validada_proveedor"} con nota registrada.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revertir la liquidación");
    } finally {
      setRevirtiendo(null);
    }
  };

  const exportar = async () => {
    if (filtradas.length === 0) {
      setError("Sin filas para exportar con los filtros actuales.");
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const hoja = XLSX.utils.json_to_sheet(
        filtradas.map((v) => ({
          ESTADO: String(v.estado ?? "").toUpperCase(),
          N_COTIZACION: String(v.cotizacion_codigo ?? ""),
          CLIENTE: String(v.cliente_nombre ?? ""),
          CTA_CTO: String(v.cuenta_contrato ?? ""),
          PROVEEDOR: String(v.proveedor_nombre ?? ""),
          ASESOR: String(v.asesor_nombre ?? ""),
          PV_VENTA: String(v.numero_pedido ?? ""),
          ORDEN_PV_VENTA: String(v.orden_pedido_venta ?? ""),
          PV_ABONO: Number(v.anticipo ?? 0) > 0 ? String(v.pv_abono ?? "") : "",
          ORDEN_PV_ABONO: Number(v.anticipo ?? 0) > 0 ? String(v.orden_pedido_abono ?? "") : "",
          MONTO_TOTAL: Number(v.monto_total ?? 0),
          ANTICIPO: Number(v.anticipo ?? 0),
          MONTO_FINANCIADO: Number(v.monto_financiado ?? 0),
          NRO_CUOTAS: String(v.nro_cuotas ?? ""),
          AMBIENTE: String(v.ambiente ?? ""),
          MATERIAL: String(v.material_nombre ?? ""),
          FECHA_VENTA: String(v.created_at ?? ""),
          INSTALACION: estadoInstDe(v),
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, hoja, "Instalaciones");
      XLSX.writeFile(wb, "instalaciones.xlsx");
      setInfo(`Exportadas ${filtradas.length} filas a instalaciones.xlsx.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar");
    }
  };

  return (
    <AuthGate><Shell>
      <ModHead
        eyebrow="INSTALACIONES Y LIQUIDACIÓN"
        title="Instalaciones"
        desc="Ventas con PV generado: al aprobar todos los sustentos pasan a pendiente de liquidar. Busca, revisa las órdenes y exporta según los filtros."
        actions={<>
          <button className="btn-white !bg-white/95 dark:!bg-slate-800 dark:!text-slate-100 dark:!border-slate-600" onClick={() => cargar()} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
          <button className="btn-white !bg-white/95 dark:!bg-slate-800 dark:!text-slate-100 dark:!border-slate-600" onClick={exportar} disabled={filtradas.length === 0}>Exportar XLSX</button>
        </>}
      />
      <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Buscar (venta, cotización, cliente, cuenta contrato, proveedor, PV normal o abono)</label>
          <input className="input" placeholder="Ej. VTA-000001, COT-AMCA-00005, DNI, PV-123" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} />
        </div>
        <button className="btn-green !py-2" onClick={() => cargar()} disabled={loading}>{loading ? "Buscando…" : "Buscar"}</button>
        <div>
          <label className="label">Estado venta</label>
          <select className="input !w-auto" value={fSol} onChange={(e) => setFSol(e.target.value)}>
            <option value="">Todos</option>
            {["generada", "aprobada", "en_instalacion", "instalada", "subsanado_pendiente", "pendiente_liquidar", "validada_proveedor", "observada", "cerrada", "liquidada"].map((e) => (
              <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Instalación</label>
          <select className="input !w-auto" value={fInst} onChange={(e) => setFInst(e.target.value)}>
            <option value="">Todas</option>
            {["pendiente_instalar", "registrada", "subsanado_pendiente", "pendiente_liquidar", "validada_proveedor", "observada", "cerrada", "liquidada"].map((e) => (
              <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Desde</label>
          <input type="date" className="input !w-auto" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" className="input !w-auto" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
        </div>
        <button className="btn-white !py-2" onClick={() => { setQ(""); setFSol(""); setFInst(""); setFDesde(""); setFHasta(""); cargar(""); }}>Limpiar filtros</button>
      </div>

      {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
      {info && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}

      {loading ? (
        <div className="card p-10 mt-4 text-center text-slate-500">Cargando instalaciones…</div>
      ) : filtradas.length === 0 ? (
        <div className="mt-4"><EmptyState titulo="Sin instalaciones" detalle="No hay ventas con esos filtros." /></div>
      ) : (
        <div className="card mt-4">
          <div className="px-5 py-3 border-b font-semibold">Instalaciones · {filtradas.length}</div>
          <div className="overflow-x-auto"><table className="tabla">
            <thead><tr><th>ESTADO</th><th>N° COTIZACIÓN</th><th>CLIENTE</th><th>CTA CTO</th><th>PROVEEDOR</th><th>ASESOR</th><th>PV VENTA</th><th>ORDEN PV VENTA</th><th>PV ABONO</th><th>ORDEN PV ABONO</th><th>MONTO TOTAL</th><th>ANTICIPO</th><th>MONTO FINANCIADO</th><th>NRO CUOTAS</th><th>AMBIENTE</th><th>MATERIAL</th><th>FECHA VENTA</th><th>ACCIONES</th></tr></thead>
            <tbody>
              {filtradas.map((v) => (
                <tr key={String(v.id)}>
                  <td><BadgeEstadoVenta estado={String(v.estado ?? "")} /></td>
                  <td className="font-bold text-[#0099D8] whitespace-nowrap">{String(v.cotizacion_codigo ?? "—")}</td>
                  <td className="font-medium">{String(v.cliente_nombre ?? "—")}</td>
                  <td>{String(v.cuenta_contrato ?? "—")}</td>
                  <td>{String(v.proveedor_nombre ?? "—")}</td>
                  <td>{String(v.asesor_nombre ?? "—")}</td>
                  <td className="whitespace-nowrap">{String(v.numero_pedido ?? "—")}</td>
                  <td className="whitespace-nowrap">{String(v.orden_pedido_venta ?? "—")}</td>
                  <td className="whitespace-nowrap">{Number(v.anticipo ?? 0) > 0 ? String(v.pv_abono ?? "—") : "—"}</td>
                  <td className="whitespace-nowrap">{Number(v.anticipo ?? 0) > 0 ? String(v.orden_pedido_abono ?? "—") : "—"}</td>
                  <td className="whitespace-nowrap font-bold">{formatoMoneda(Number(v.monto_total ?? 0))}</td>
                  <td className="whitespace-nowrap">{formatoMoneda(Number(v.anticipo ?? 0))}</td>
                  <td className="whitespace-nowrap">{formatoMoneda(Number(v.monto_financiado ?? 0))}</td>
                  <td>{v.nro_cuotas != null ? String(v.nro_cuotas) : "—"}</td>
                  <td>{String(v.ambiente ?? "—")}</td>
                  <td>{String(v.material_nombre ?? "—")}</td>
                  <td className="whitespace-nowrap text-xs">{v.created_at ? formatoFecha(String(v.created_at)) : "—"}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex gap-1.5">
                      {(esProveedor || esAdmin) && ["generada", "aprobada", "en_instalacion", "instalada", "observada", "subsanado_pendiente"].includes(String(v.estado)) &&
                        (["pendiente_instalar", "pendiente", "observada"].includes(estadoInstDe(v)) || evidenciasDe(v).some((e) => e.estado === "rechazado")) &&
                        <button className="btn-white !py-1 !px-3 !text-xs" onClick={() => setVentana({ v, accion: "entrega" })}>
                          {estadoInstDe(v) === "observada" || evidenciasDe(v).some((e) => e.estado === "rechazado") ? "Subsanar adjuntos" : "Subir adjuntos"}
                        </button>}
                      {esAdmin && ["instalada", "observada", "subsanado_pendiente"].includes(String(v.estado)) && SUSTENTOS_INSTALACION.every(({ tipo }) => evidenciasDe(v).some((e) => e.tipo === tipo && e.url)) &&
                        <button className="btn-green !py-1 !px-3 !text-xs" onClick={() => setVentana({ v, accion: "revision" })}>Revisar evidencias</button>}
                      <button className="btn-white !py-1 !px-3 !text-xs" onClick={() => setVentana({ v, accion: "detalle" })}>Ver detalle</button>
                      {puedeLiquidar(v) && (
                        <button className="btn-green !py-1 !px-3 !text-xs" title="Registrar órdenes y liquidar" disabled={liquidando === String(v.id)} onClick={() => abrirLiquidacion(v)}>
                          {liquidando === String(v.id) ? "…" : "✓ Liquidar"}
                        </button>
                      )}
                      {puedeRevertir(v) && (
                        <button className="btn-white !py-1 !px-3 !text-xs" title="Revertir por error el paso a liquidar" disabled={revirtiendo === String(v.id)} onClick={() => revertir(v)}>
                          {revirtiendo === String(v.id) ? "…" : "↩ Revertir"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {ventana && <VentanaInstalacion {...ventana} onClose={() => setVentana(null)} onChanged={() => void cargar()} />}
      {liquidacion && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="liquidacion-titulo" className="my-8 w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl">
          <header className="flex items-start justify-between border-b bg-slate-50 px-6 py-4">
            <div><h2 id="liquidacion-titulo" className="text-lg font-bold">Órdenes para liquidar · {String(liquidacion.id)}</h2><p className="mt-1 text-xs text-slate-500">Registra las órdenes asociadas a los PV antes de confirmar la liquidación.</p></div>
            <button className="btn-white !px-3" onClick={() => setLiquidacion(null)} disabled={!!liquidando}>Cerrar</button>
          </header>
          <div className="space-y-4 p-6">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
              <div><b>PV de venta:</b> {String(liquidacion.numero_pedido ?? "—")}</div>
              {Number(liquidacion.anticipo ?? 0) > 0 && <div className="mt-1"><b>PV de abono:</b> {String(liquidacion.pv_abono ?? "—")}</div>}
            </div>
            <div><label className="label">Orden del pedido de venta *</label><input className="input" value={ordenVenta} onChange={(e) => setOrdenVenta(e.target.value)} placeholder="Número de orden de venta" autoFocus /></div>
            {Number(liquidacion.anticipo ?? 0) > 0 && <div><label className="label">Orden del pedido de abono *</label><input className="input" value={ordenAbono} onChange={(e) => setOrdenAbono(e.target.value)} placeholder="Número de orden de abono" /></div>}
            <div><label className="label">Nota de liquidación (opcional)</label><textarea className="input min-h-[80px]" value={notaLiquidacion} onChange={(e) => setNotaLiquidacion(e.target.value)} /></div>
            {errorLiquidacion && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorLiquidacion}</p>}
          </div>
          <footer className="flex justify-end gap-2 border-t bg-slate-50 px-6 py-4">
            <button className="btn-white" onClick={() => setLiquidacion(null)} disabled={!!liquidando}>Cancelar</button>
            <button className="btn-green" onClick={liquidar} disabled={!!liquidando}>{liquidando ? "Guardando…" : "Confirmar liquidación"}</button>
          </footer>
        </section>
      </div>}
    </Shell></AuthGate>
  );
}
