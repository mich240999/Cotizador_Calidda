"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState, formatoFecha, formatoMoneda } from "@/components/Tablas";
import { AccAbrir, AccValidar } from "@/components/Accion";
import VentaModal, { PrefillVenta } from "@/components/VentaModal";
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
  const [validando, setValidando] = useState<string | null>(null);

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
      const datos = await apiOperacion<unknown>("listarVentas", { estado: "borrador", limit: 200, page: 1, pageSize: 200 });
      const arr = Array.isArray(datos) ? datos : ((datos as { rows?: unknown })?.rows ?? []);
      setPendientes(Array.isArray(arr) ? (arr as Venta[]) : []);
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
  const aprobarAbonos = async (v: Venta) => {
    const idv = ventaId(v);
    setError(null);
    setInfo(null);
    setValidando(idv);
    try {
      const d = await apiOperacion<{ abonos?: { id?: string | number; estado?: string }[] }>("getVenta", { id: idv });
      const lista = Array.isArray(d?.abonos) ? d.abonos : [];
      const pends = lista.filter((a) => String(a.estado ?? "").toLowerCase() === "pendiente");
      if (pends.length === 0) {
        setInfo(`Sin abonos pendientes en ${ventaNumero(v)}. La aprobación de la venta se hace dentro del detalle.`);
        return;
      }
      for (const a of pends) {
        await apiOperacion("validarAbono", { abono_id: String(a.id ?? ""), accion: "validar" });
      }
      setInfo(`Abonos aprobados en ${ventaNumero(v)}: ${pends.length}.`);
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

  const historico = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((v) => {
      const r = v as Record<string, unknown>;
      if (s) {
        const hay = [ventaNumero(v), ventaCliente(v), ventaDoc(v), String(r.cliente_nombre ?? ""), String(r.cuenta_contrato ?? ""), String(r.cotizacion_codigo ?? "")].join(" ").toLowerCase();
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
      prov: ventaProveedor(v),
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
                        {c.solicitud_id ? (
                          <span className="text-[11px] font-bold bg-slate-100 text-slate-500 rounded-lg px-2 py-1">Ya registrada</span>
                        ) : (
                          <button className="btn-green !py-1.5 !text-xs whitespace-nowrap" disabled={generando === c.id} onClick={() => generarSolicitud(c)}>
                            {generando === c.id ? "Abriendo…" : "Generar solicitud"}
                          </button>
                        )}
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
                            <td><AccAbrir title="Abrir solicitud" href={`/ventas/${encodeURIComponent(ventaId(v) || "")}`} /></td>
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
              <label className="label">Buscar</label>
              <input className="input" placeholder="Número, cotización, cliente, cuenta contrato" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
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
            <button className="btn-white !py-2" onClick={() => { setQ(""); setFEst("TODOS"); setFDesde(""); setFHasta(""); }}>Limpiar</button>
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
                            <AccAbrir title="Ver solicitud" href={`/ventas/${encodeURIComponent(ventaId(v) || "")}`} />
                            <AccValidar title="Aprobar abonos pendientes" disabled={validando === ventaId(v)} onClick={() => aprobarAbonos(v)} />
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
          <VentaModal prefill={prefill} onClose={() => { setAbrirModal(false); setPrefill(null); buscarCotizaciones(); cargar(); cargarPendientes(); }} />
        )}
      </Shell>
    </AuthGate>
  );
}
