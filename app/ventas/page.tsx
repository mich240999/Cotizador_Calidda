"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState, formatoFecha, formatoMoneda } from "@/components/Tablas";
import { AccAprobar, AccVer } from "@/components/Accion";
import VentaModal, { PrefillVenta } from "@/components/VentaModal";
import {
  BadgeEstadoVenta,
  ESTADOS_VENTA,
  etiquetaEstado,
  Venta,
  ventaCliente,
  ventaDoc,
  ventaEstado,
  ventaFecha,
  ventaId,
  ventaNumero,
  ventaProveedor,
  ventaTotal,
} from "@/components/VentasComun";

type CotBusqueda = {
  id: string;
  codigo?: string;
  created_at?: string;
  estado?: string;
  total?: number;
  subtotal?: number;
  asesor?: string | null;
  proveedor?: string | null;
  cuenta_contrato?: string | null;
  cliente_nombre?: string | null;
  cliente_doc?: string | null;
  solicitud_id?: string | null;
};

const fmtFechaCorta = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString("es-PE");
};

const enRango = (iso: unknown, desde: string, hasta: string) => {
  if (!desde && !hasta) return true;
  const t = new Date(String(iso ?? "")).getTime();
  if (Number.isNaN(t)) return false;
  if (desde && t < new Date(`${desde}T00:00:00`).getTime()) return false;
  if (hasta && t > new Date(`${hasta}T23:59:59`).getTime()) return false;
  return true;
};

function PVModal({ v, onClose, onHecho }: { v: Venta; onClose: () => void; onHecho: () => void }) {
  const r = v as Record<string, unknown>;
  const anticipo = Number(r.anticipo ?? 0) || 0;
  const [codigo, setCodigo] = useState("");
  const [pv, setPv] = useState("");
  const [pvAbono, setPvAbono] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setMsg(null);
    if (!codigo.trim()) { setMsg("Registra el código de la llamada."); return; }
    if (!pv.trim()) { setMsg("Registra el pedido de venta."); return; }
    if (anticipo > 0 && !pvAbono.trim()) { setMsg("Hay anticipo: registra el PV de abono."); return; }
    setGuardando(true);
    try {
      const res = await apiOperacion<{ parcial?: boolean }>("registrarPV", {
        solicitud_id: ventaId(v),
        codigo_llamada: codigo.trim(),
        numero_pedido_venta: pv.trim(),
        ...(anticipo > 0 ? { numero_pedido_abono: pvAbono.trim() } : {}),
      });
      if ((res as { parcial?: boolean })?.parcial) {
        setMsg("PV guardado parcial: falta la migración de BD para código de llamada y PV de abono.");
        return;
      }
      onHecho();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50">
          <h2 className="font-bold text-lg">Registrar PV · {ventaNumero(v)}</h2>
          <p className="text-xs text-slate-500">{ventaCliente(v)} · {formatoMoneda(Number(r.monto_total ?? ventaTotal(v)))}{anticipo > 0 ? ` · Anticipo ${formatoMoneda(anticipo)}` : ""}</p>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="label">Código de la llamada *</label>
            <input className="input" placeholder="Código" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div>
            <label className="label">Pedido de venta (PV) *</label>
            <input className="input" placeholder="N° pedido" value={pv} onChange={(e) => setPv(e.target.value)} />
          </div>
          <div>
            <label className="label">PV de abono {anticipo > 0 ? "*" : "(sin abono inicial)"}</label>
            <input className="input" placeholder="N° pedido de abono" value={pvAbono} onChange={(e) => setPvAbono(e.target.value)} disabled={anticipo <= 0} />
            {anticipo <= 0 && <p className="text-[11px] text-slate-400 mt-1">Bloqueado: la solicitud no tiene anticipo.</p>}
          </div>
          {msg && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>Cancelar</button>
          <button className="btn-green" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Generar solicitud"}</button>
        </div>
      </div>
    </div>
  );
}

function VisorVenta({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await apiOperacion<Record<string, unknown>>("getVenta", { id });
        setD(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar");
      }
    })();
  }, [id]);
  const sol = (d?.solicitud ?? {}) as Record<string, unknown>;
  const items = (Array.isArray(d?.items) ? d.items : []) as Record<string, unknown>[];
  const abonos = (Array.isArray(d?.abonos) ? d.abonos : []) as Record<string, unknown>[];
  const ins = (d?.instalacion ?? null) as Record<string, unknown> | null;
  const fila: [string, string][] = [
    ["Número", String(sol.id ?? id)],
    ["Estado", String(sol.estado ?? "—").toUpperCase()],
    ["Cliente", String(sol.cliente_nombre ?? ventaCliente(sol as Venta))],
    ["Proveedor", String(sol.proveedor_nombre ?? "")],
    ["Asesor", String(sol.asesor_nombre ?? "")],
    ["Canal", String(sol.canal ?? "—")],
    ["Pago", String(sol.pago_modo ?? "—")],
    ["Código de llamada", String(sol.codigo_llamada ?? "—")],
    ["Pedido de venta", String(sol.numero_pedido ?? "—")],
    ["PV de abono", String(sol.pv_abono ?? "—")],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl my-6 overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="font-bold text-lg">Solicitud {String(sol.id ?? id)}</h2>
            <p className="text-xs text-slate-500">Detalle completo de la venta y datos del pedido.</p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-5">
          {error && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{error}</p>}
          {!d && !error && <p className="text-sm text-[#0099D8]">Cargando…</p>}
          {d && (<>
            <div>
              <p className="font-bold text-sm mb-2">Datos de la solicitud</p>
              <dl className="grid sm:grid-cols-2 gap-2 text-sm">
                {fila.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-semibold text-right break-all">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <p className="font-bold text-sm mb-2">Materiales · {items.length}</p>
              <div className="table-wrap"><table className="tabla">
                <thead><tr><th>MATERIAL</th><th>CANT.</th><th>P. UNIT</th><th>MODO</th><th>SUBTOTAL</th></tr></thead>
                <tbody>
                  {items.map((it, i) => {
                    const cod = String(it.material_codigo ?? "");
                    const nom = String(it.material_nombre ?? it.nombre ?? it.id_material ?? "—");
                    const des = String(it.material_descripcion ?? "");
                    return (
                      <tr key={String(it.id ?? i)}>
                        <td>
                          <p className="font-bold">{cod ? `${cod} · ${nom}` : nom}</p>
                          {des && des !== nom && <p className="text-[11px] text-slate-500">{des}</p>}
                        </td>
                        <td>{String(it.cantidad ?? "")}</td>
                        <td>{formatoMoneda(Number(it.precio_unit ?? 0))}</td>
                        <td className="capitalize">{String(it.modo ?? "")}</td>
                        <td>{formatoMoneda(Number(it.subtotal ?? 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
            {abonos.length > 0 && (
              <div>
                <p className="font-bold text-sm mb-2">Abonos · {abonos.length}</p>
                <div className="table-wrap"><table className="tabla">
                  <thead><tr><th>MONTO</th><th>MEDIO</th><th>ESTADO</th></tr></thead>
                  <tbody>
                    {abonos.map((a, i) => (
                      <tr key={String(a.id ?? i)}>
                        <td>{formatoMoneda(Number(a.monto ?? 0))}</td>
                        <td className="capitalize">{String(a.medio ?? "")}</td>
                        <td>{String(a.estado ?? "").toUpperCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}
            {ins && (
              <div>
                <p className="font-bold text-sm mb-2">Instalación · {String(ins.estado ?? "").toUpperCase()}</p>
                <p className="text-xs text-slate-500">Evidencias registradas en el módulo de instalaciones.</p>
              </div>
            )}
          </>)}
        </div>
        <div className="flex justify-end px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export default function VentasPage() {
  // ---- Mitad 1: buscar cotización / pendientes ----
  const [qCot, setQCot] = useState("");
  const [fEstCot, setFEstCot] = useState("");
  const [fDesdeCot, setFDesdeCot] = useState("");
  const [fHastaCot, setFHastaCot] = useState("");
  const [cots, setCots] = useState<CotBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [pendientes, setPendientes] = useState<Venta[]>([]);
  const [cargandoPend, setCargandoPend] = useState(false);
  const [prefill, setPrefill] = useState<PrefillVenta | null>(null);
  const [abrirModal, setAbrirModal] = useState(false);
  const [generando, setGenerando] = useState<string | null>(null);
  const [pvDe, setPvDe] = useState<Venta | null>(null);
  const [visorId, setVisorId] = useState<string | null>(null);

  const puedePV = (v: Venta) => ["borrador", "observado"].includes(ventaEstado(v).toLowerCase());

  const refrescarTodo = () => { buscarCotizaciones(); cargar(); cargarPendientes(); };

  // ---- Mitad 2: histórico ----
  const [rows, setRows] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fEst, setFEst] = useState("TODOS");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [exportando, setExportando] = useState(false);

  const buscarCotizaciones = async () => {
    setBuscando(true);
    setError(null);
    try {
      const r = await apiOperacion<unknown>("buscarCotizacionesParaVenta", {
        q: qCot.trim(), estado: fEstCot, desde: fDesdeCot, hasta: fHastaCot, limit: 100,
      });
      setCots(Array.isArray(r) ? (r as CotBusqueda[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar");
      setCots([]);
    } finally {
      setBuscando(false);
    }
  };

  const cargarPendientes = async () => {
    setCargandoPend(true);
    try {
      const listas = await Promise.all(
        ["borrador", "observado"].map(async (est) => {
          try {
            const datos = await apiOperacion<unknown>("listarVentas", { estado: est, limit: 200, page: 1, pageSize: 200 });
            const arr = Array.isArray(datos) ? datos : ((datos as { rows?: unknown })?.rows ?? []);
            return Array.isArray(arr) ? (arr as Venta[]) : [];
          } catch {
            return [] as Venta[];
          }
        })
      );
      setPendientes([...listas[0], ...listas[1]]);
    } catch {
      setPendientes([]);
    } finally {
      setCargandoPend(false);
    }
  };

  useEffect(() => {
    cargarPendientes();
  }, []);

  const pendientesFiltrados = useMemo(
    () => pendientes.filter((v) => enRango((v as Record<string, unknown>).created_at, fDesdeCot, fHastaCot)),
    [pendientes, fDesdeCot, fHastaCot]
  );

  const generarSolicitud = async (c: CotBusqueda) => {
    setGenerando(c.id);
    setError(null);
    try {
      const d = await apiOperacion<{
        cotizacion?: { id: string; codigo: string };
        cliente?: { id: string; nombres: string; doc: string; email: string; telefono: string; cuenta_contrato: string | null; ambiente: string };
        items?: { descripcion: string; material_codigo: string; cantidad: number; precio_unit: number; descuento_pct: number }[];
        financiamiento?: { cuota_inicial: number; capital: number; plazo: number; tea: number };
        proveedor?: string; asesor?: string; asesor_telefono?: string;
      }>("obtenerCotizacionParaVenta", { cotizacion_id: c.id });
      if (!d?.cotizacion || !d?.cliente) throw new Error("Sin datos de la cotización");
      setPrefill({
        cotizacion_id: String(d.cotizacion.id),
        codigo: String(d.cotizacion.codigo ?? c.codigo ?? ""),
        cliente: {
          id: String(d.cliente.id ?? ""),
          nombres: String(d.cliente.nombres ?? ""),
          doc: String(d.cliente.doc ?? ""),
          email: String(d.cliente.email ?? ""),
          telefono: String(d.cliente.telefono ?? ""),
          cuenta_contrato: d.cliente.cuenta_contrato ?? null,
          ambiente: String((d.cliente as { ambiente?: string }).ambiente ?? ""),
        },
        items: (d.items ?? []).map((it) => ({
          descripcion: String(it.descripcion ?? ""),
          material_codigo: String(it.material_codigo ?? ""),
          cantidad: Number(it.cantidad ?? 0),
          precio_unit: Number(it.precio_unit ?? 0),
          descuento_pct: Number(it.descuento_pct ?? 0),
        })),
        financiamiento: {
          cuota_inicial: Number(d.financiamiento?.cuota_inicial ?? 0),
          capital: Number(d.financiamiento?.capital ?? 0),
          plazo: Number(d.financiamiento?.plazo ?? 9) || 9,
          tea: Number(d.financiamiento?.tea ?? 0.40) || 0.40,
        },
        proveedor: String(d.proveedor ?? ""),
        asesor: String(d.asesor ?? ""),
        asesor_telefono: String(d.asesor_telefono ?? ""),
      });
      setAbrirModal(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la solicitud");
    } finally {
      setGenerando(null);
    }
  };

  // ---- Histórico ----
  const cargar = async (qry?: string) => {
    setLoading(true);
    setError(null);
    try {
      const datos = await apiOperacion<unknown>("listarVentas", { q: (qry ?? q).trim(), limit: 200, page: 1, pageSize: 200 });
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
    cargar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const historico = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((v) => {
      const r = v as Record<string, unknown>;
      if (s) {
        const hay = [ventaNumero(v), ventaCliente(v), ventaDoc(v), String(r.cliente_nombre ?? ""), String(r.cuenta_contrato ?? ""), String(r.cotizacion_codigo ?? ""), String(r.numero_pedido ?? ""), String(r.pv_abono ?? "")].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (fEst !== "TODOS" && ventaEstado(v).toLowerCase() !== fEst) return false;
      if (!enRango(r.created_at, fDesde, fHasta)) return false;
      return true;
    });
  }, [rows, q, fEst, fDesde, fHasta]);

  const exportar = async () => {
    setExportando(true);
    setError(null);
    try {
      const XLSX = await import("xlsx");
      const hoja = XLSX.utils.json_to_sheet(
        historico.map((v) => {
          const r = v as Record<string, unknown>;
          return {
            ESTADO: ventaEstado(v),
            N_COTIZACION: String(r.cotizacion_codigo ?? ""),
            CLIENTE: ventaCliente(v),
            CTA_CTO: String(r.cuenta_contrato ?? ""),
            PROVEEDOR: ventaProveedor(v),
            ASESOR: String(r.asesor_nombre ?? ""),
            MONTO_TOTAL: Number(r.monto_total ?? ventaTotal(v)),
            ANTICIPO: Number(r.anticipo ?? 0),
            MONTO_FINANCIADO: Number(r.monto_financiado ?? 0),
            NRO_CUOTAS: String(r.nro_cuotas ?? ""),
            AMBIENTE: String(r.ambiente ?? ""),
            MATERIAL: String(r.material_nombre ?? ""),
            FECHA_VENTA: ventaFecha(v),
          };
        })
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, hoja, "Solicitudes");
      XLSX.writeFile(wb, "solicitudes_venta.xlsx");
      setInfo(`Exportadas ${historico.length} filas a solicitudes_venta.xlsx.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  };

  const filaHist = (v: Venta) => {
    const r = v as Record<string, unknown>;
    return {
      estado: ventaEstado(v),
      cot: String(r.cotizacion_codigo ?? "—"),
      cli: ventaCliente(v),
      cta: String(r.cuenta_contrato ?? "—"),
      prov: String(r.proveedor_nombre ?? ventaProveedor(v)),
      ase: String(r.asesor_nombre ?? "—"),
      total: Number(r.monto_total ?? ventaTotal(v)),
      ant: Number(r.anticipo ?? 0),
      fin: Number(r.monto_financiado ?? 0),
      cuotas: r.nro_cuotas != null ? String(r.nro_cuotas) : "—",
      amb: String(r.ambiente ?? "—"),
      mat: String(r.material_nombre ?? "—"),
      fecha: ventaFecha(v),
    };
  };

  return (
    <AuthGate>
      <Shell>
        <ModHead
          eyebrow="REGISTRO DE VENTAS"
          title="Solicitudes de venta"
          desc="Las solicitudes nacen de una cotización: busca por DNI, nombre o cuenta contrato y genera la solicitud."
          actions={<>
            <button className="btn-white" onClick={() => { cargar(); cargarPendientes(); }} disabled={loading}>Actualizar</button>
            <button className="btn-white" onClick={exportar} disabled={exportando}>{exportando ? "Exportando…" : "Exportar XLSX"}</button>
          </>}
        />

        {/* Mitad 1: buscar cotización y registrar venta */}
        <div className="card p-4 mt-4">
          <p className="font-bold">1. Buscar cotización para vender</p>
          <p className="text-xs text-slate-400">Por DNI, nombre, cuenta contrato o código. Sin búsqueda se listan las solicitudes pendientes de generar PV.</p>
          <div className="flex flex-wrap gap-3 items-end mt-3">
            <div className="flex-1 min-w-[220px]">
              <label className="label">Buscar (DNI, nombre, cuenta contrato, código)</label>
              <input className="input" placeholder="Ej. 71532445, Juan Perez, 5696624, COT-AMCA-00005" value={qCot} onChange={(e) => setQCot(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscarCotizaciones()} />
            </div>
            <div>
              <label className="label">Estado cot.</label>
              <select className="input !w-auto" value={fEstCot} onChange={(e) => setFEstCot(e.target.value)}>
                <option value="">Todas</option>
                <option value="BORRADOR">Borrador</option>
                <option value="ENVIADA">Enviada</option>
                <option value="APROBADA">Aprobada</option>
                <option value="RECHAZADA">Rechazada</option>
              </select>
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input !w-auto" value={fDesdeCot} onChange={(e) => setFDesdeCot(e.target.value)} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input !w-auto" value={fHastaCot} onChange={(e) => setFHastaCot(e.target.value)} />
            </div>
            <button className="btn-green !py-2" onClick={buscarCotizaciones} disabled={buscando}>{buscando ? "Buscando…" : "Buscar"}</button>
            <button className="btn-white !py-2" onClick={() => { setQCot(""); setFEstCot(""); setFDesdeCot(""); setFHastaCot(""); setCots([]); }}>Limpiar</button>
          </div>

          {qCot.trim() || cots.length > 0 ? (
            <div className="table-wrap mt-3">
              <table className="tabla">
                <thead><tr><th>COTIZACIÓN</th><th>FECHA</th><th>CLIENTE</th><th>CTA. CTO.</th><th>ASESOR</th><th>TOTAL</th><th>ACCIÓN</th></tr></thead>
                <tbody>
                  {cots.length === 0 && !buscando && (
                    <tr><td colSpan={7} className="text-center text-slate-400 py-6">Sin resultados para esa búsqueda.</td></tr>
                  )}
                  {cots.map((c) => (
                    <tr key={c.id}>
                      <td className="font-bold text-[#0099D8]">{c.codigo ?? c.id.slice(0, 8)}</td>
                      <td className="whitespace-nowrap text-xs">{fmtFechaCorta(c.created_at)}</td>
                      <td className="font-medium">{c.cliente_nombre ?? "—"}{c.cliente_doc ? <span className="block text-[11px] text-slate-400">Doc {c.cliente_doc}</span> : null}</td>
                      <td>{c.cuenta_contrato ?? "—"}</td>
                      <td>{c.asesor ?? "—"}</td>
                      <td className="whitespace-nowrap font-bold">{formatoMoneda(c.total)}</td>
                      <td>
                        <button className="btn-green !py-1.5 !text-xs whitespace-nowrap" disabled={generando === c.id} onClick={() => generarSolicitud(c)}>
                          {generando === c.id ? "Abriendo…" : "Generar solicitud"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-xs font-bold text-slate-500 mb-2">SOLICITUDES PENDIENTES DE GENERAR PV · {pendientesFiltrados.length}</p>
              {cargandoPend ? (
                <p className="text-sm text-[#0099D8] py-4">Cargando pendientes…</p>
              ) : pendientesFiltrados.length === 0 ? (
                <EmptyState titulo="Sin pendientes" detalle="No hay solicitudes en borrador." />
              ) : (
                <div className="table-wrap">
                  <table className="tabla">
                    <thead><tr><th>NÚMERO</th><th>COTIZACIÓN</th><th>CLIENTE</th><th>ASESOR</th><th>TOTAL</th><th>ACCIÓN</th></tr></thead>
                    <tbody>
                      {pendientesFiltrados.map((v, i) => {
                        const r = v as Record<string, unknown>;
                        return (
                          <tr key={ventaId(v) || i}>
                            <td className="font-mono text-xs font-bold">{ventaNumero(v)}</td>
                            <td>{String(r.cotizacion_codigo ?? "—")}</td>
                            <td className="font-medium">{ventaCliente(v)}</td>
                            <td>{String(r.asesor_nombre ?? "—")}</td>
                            <td className="whitespace-nowrap font-bold">{formatoMoneda(Number(r.monto_total ?? ventaTotal(v)))}</td>
                            <td className="whitespace-nowrap">
                              <div className="flex gap-1.5">
                                {puedePV(v) && <AccAprobar title="Registrar PV" onClick={() => setPvDe(v)} />}
                                <AccVer title="Ver solicitud" onClick={() => setVisorId(ventaId(v))} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
        {info && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}

        {/* Mitad 2: histórico */}
        <div className="card p-4 mt-4">
          <p className="font-bold">2. Histórico de solicitudes</p>
          <div className="flex flex-wrap gap-3 items-end mt-3">
            <div className="flex-1 min-w-[200px]">
              <label className="label">Buscar (número, cotización, cliente, cuenta contrato, PV)</label>
              <input className="input" placeholder="Número, cotización, cliente, cuenta contrato, PV normal o de abono" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} />
            </div>
            <button className="btn-green !py-2" onClick={() => cargar()} disabled={loading}>{loading ? "Buscando…" : "Buscar"}</button>
            <div>
              <label className="label">Estado</label>
              <select className="input !w-auto" value={fEst} onChange={(e) => setFEst(e.target.value)}>
                <option value="TODOS">Todos</option>
                {ESTADOS_VENTA.map((e) => <option key={e} value={e}>{etiquetaEstado(e)}</option>)}
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
            <button className="btn-white !py-2" onClick={() => { setQ(""); setFEst("TODOS"); setFDesde(""); setFHasta(""); cargar(""); }}>Limpiar</button>
          </div>
        </div>

        {loading ? (
          <div className="card p-6 mt-4 text-sm text-[#0099D8]">Cargando solicitudes…</div>
        ) : historico.length === 0 ? (
          <div className="mt-4"><EmptyState titulo="Sin solicitudes" detalle="No hay solicitudes con esos filtros." /></div>
        ) : (
          <div className="card mt-4">
            <div className="px-5 py-3 border-b font-semibold">Solicitudes · {historico.length}</div>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead><tr><th>ESTADO</th><th>N° COTIZACIÓN</th><th>CLIENTE</th><th>CTA CTO</th><th>PROVEEDOR</th><th>ASESOR</th><th>MONTO TOTAL</th><th>ANTICIPO</th><th>MONTO FINANCIADO</th><th>NRO CUOTAS</th><th>AMBIENTE</th><th>MATERIAL</th><th>FECHA VENTA</th><th>ACCIONES</th></tr></thead>
                <tbody>
                  {historico.map((v, i) => {
                    const f = filaHist(v);
                    return (
                      <tr key={ventaId(v) || i}>
                        <td><BadgeEstadoVenta estado={f.estado} /></td>
                        <td className="font-bold text-[#0099D8] whitespace-nowrap">{f.cot}</td>
                        <td className="font-medium">{f.cli}</td>
                        <td>{f.cta}</td>
                        <td>{f.prov}</td>
                        <td>{f.ase}</td>
                        <td className="whitespace-nowrap font-bold">{formatoMoneda(f.total)}</td>
                        <td className="whitespace-nowrap">{formatoMoneda(f.ant)}</td>
                        <td className="whitespace-nowrap">{formatoMoneda(f.fin)}</td>
                        <td>{f.cuotas}</td>
                        <td>{f.amb}</td>
                        <td>{f.mat}</td>
                        <td className="whitespace-nowrap text-xs">{f.fecha ? formatoFecha(f.fecha) : "—"}</td>
                        <td className="whitespace-nowrap">
                          <div className="flex gap-1.5">
                            {puedePV(v) && <AccAprobar title="Registrar PV" onClick={() => setPvDe(v)} />}
                            <AccVer title="Ver solicitud" onClick={() => setVisorId(ventaId(v))} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {abrirModal && prefill && (
          <VentaModal prefill={prefill} onClose={() => { setAbrirModal(false); setPrefill(null); refrescarTodo(); }} />
        )}
        {pvDe && (
          <PVModal v={pvDe} onClose={() => setPvDe(null)} onHecho={() => refrescarTodo()} />
        )}
        {visorId && (
          <VisorVenta id={visorId} onClose={() => setVisorId(null)} />
        )}
      </Shell>
    </AuthGate>
  );
}
