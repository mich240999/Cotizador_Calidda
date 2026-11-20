"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState, formatoFecha, formatoMoneda } from "@/components/Tablas";
import { AccAprobar, AccSolicitar, AccVer } from "@/components/Accion";
import { BadgeEstadoVenta, BadgeEvidencia, ETIQUETA_EVIDENCIA, useRolVista } from "@/components/VentasComun";

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

function RegistroLiquidacion({ v, onClose, onHecho }: { v: Fila; onClose: () => void; onHecho: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const pedidos = Array.isArray(v.items) ? (v.items as Fila[]) : [];
  const sinPedido = pedidos.filter((it) => !String(it.numero_pedido_venta ?? "").trim() && !String(it.numero_pedido_abono ?? "").trim());

  const guardar = async () => {
    setMsg(null);
    setGuardando(true);
    try {
      await apiOperacion("registrarLiquidacion", {
        solicitud_id: String(v.id),
        tipo: "acta",
      });
      onHecho();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-6 overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="font-bold text-lg">Solicitar liquidación por acta · {String(v.id)}</h2>
            <p className="text-xs text-slate-500">Solo existe la vía de acta de entrega. Las evidencias ya fueron aprobadas una por una.</p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <p className="font-bold">Acta de entrega y sustentos aprobados</p>
            <p className="text-xs mt-1">Al solicitar, la venta pasa a <b>pendiente de liquidar</b>. Administración verificará los pedidos registrados y liquidará.</p>
          </div>
          <div className={`rounded-xl border p-4 text-sm ${sinPedido.length ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {sinPedido.length
              ? `Faltan números de pedido en ${sinPedido.length} ítem(s). Regístralos en el detalle de la venta antes de solicitar.`
              : "Todos los ítems tienen número de pedido de venta o abono."}
          </div>
          {msg && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>Cancelar</button>
          <button className="btn-green" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Solicitar liquidación"}</button>
        </div>
      </div>
    </div>
  );
}

function VerInstalacion({ v, esAdmin, onClose, onChanged }: { v: Fila; esAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  const ins = (v.instalacion ?? {}) as Record<string, unknown>;
  const evidencias = Array.isArray(v.evidencias) ? (v.evidencias as Fila[]) : [];
  const [lista, setLista] = useState<Fila[]>(evidencias);
  const [obs, setObs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const revisar = async (tipo: string, accion: "aprobar" | "rechazar") => {
    setMsg(null);
    setBusy(tipo);
    try {
      const observacion = String(obs[tipo] ?? "").trim();
      if (accion === "rechazar" && !observacion) throw new Error("Indica qué debe subsanar el proveedor.");
      const r = await apiOperacion<{ evidencias?: Fila[] }>("revisarEvidencia", { solicitud_id: String(v.id), tipo, accion, observacion });
      if (Array.isArray(r?.evidencias)) setLista(r.evidencias);
      setObs((p) => ({ ...p, [tipo]: "" }));
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo revisar la evidencia");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl my-6 overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="font-bold text-lg">Evidencias de instalación · {String(v.id)}</h2>
            <p className="text-xs text-slate-500">
              Estado: {estadoInstDe(v).replace(/_/g, " ").toUpperCase()} · Vía acta de entrega
            </p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6">
          {lista.length === 0 ? (
            <p className="text-sm text-slate-500">El proveedor aún no entrega el acta ni los sustentos.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {lista.map((ev) => {
                const tipo = String(ev.tipo ?? "");
                const url = String(ev.url ?? "");
                const esImg = /^data:image|\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
                const estado = String(ev.estado ?? "pendiente");
                return (
                  <div key={tipo} className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 pt-2">
                      <p className="font-bold text-sm">{ETIQUETA_EVIDENCIA[tipo] ?? tipo}</p>
                      <BadgeEvidencia estado={estado} />
                    </div>
                    {esImg && <img src={url} alt={tipo} className="mt-2 h-36 w-full object-cover" loading="lazy" />}
                    <a href={url} target="_blank" rel="noreferrer" className="block px-3 py-2 text-xs font-bold text-[#0099D8] hover:underline">Abrir archivo ↗</a>
                    {String(ev.observacion ?? "").trim() && (
                      <p className="mx-3 mb-2 rounded-lg bg-red-50 border border-red-200 px-2 py-1 text-[11px] text-red-700">Observación: {String(ev.observacion)}</p>
                    )}
                    {esAdmin && (
                      <div className="border-t border-slate-100 p-3 space-y-2">
                        <input className="input !py-1 !text-xs" placeholder="Observación de esta evidencia" value={obs[tipo] ?? ""} onChange={(e) => setObs((p) => ({ ...p, [tipo]: e.target.value }))} />
                        <div className="flex gap-2">
                          <button className="btn-green !py-1 !px-2 !text-[11px]" disabled={busy === tipo} onClick={() => void revisar(tipo, "aprobar")}>✓ Aprobar</button>
                          <button className="btn-white !py-1 !px-2 !text-[11px]" disabled={busy === tipo} onClick={() => void revisar(tipo, "rechazar")}>✕ Rechazar</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {msg && <p className="mt-3 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
          {String(ins.observacion ?? "").trim() && (
            <p className="mt-3 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">Subsanación pendiente: {String(ins.observacion)}</p>
          )}
        </div>
        <div className="flex justify-end px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export default function InstalacionesPage() {
  const { esAdmin } = useRolVista();
  const [rows, setRows] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fSol, setFSol] = useState("");
  const [fInst, setFInst] = useState("");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [reg, setReg] = useState<Fila | null>(null);
  const [ver, setVer] = useState<Fila | null>(null);
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
        const hay = [String(v.id ?? ""), String(v.cotizacion_codigo ?? ""), String(v.cliente_nombre ?? ""), String(v.cliente_documento ?? ""), String(v.cuenta_contrato ?? ""), String(v.proveedor_nombre ?? ""), String(v.numero_pedido ?? ""), String(v.pv_abono ?? "")].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (fSol && String(v.estado ?? "").toLowerCase() !== fSol) return false;
      if (fInst && estadoInstDe(v) !== fInst) return false;
      if (!enRango(v.created_at, fDesde, fHasta)) return false;
      return true;
    });
  }, [rows, q, fSol, fInst, fDesde, fHasta]);

  const puedeRegistrar = (v: Fila) => {
    const est = String(v.estado ?? "").toLowerCase();
    const ei = estadoInstDe(v);
    const evs = Array.isArray(v.evidencias) ? (v.evidencias as Fila[]) : [];
    const todas = ["foto_antes", "foto_durante", "foto_despues", "foto_dni", "foto_cliente_dni", "acta", "boleta"]
      .every((t) => evs.some((e) => String(e.tipo) === t && String(e.estado) === "aprobado"));
    return est === "validada_proveedor" && todas && !["pendiente_liquidar", "liquidada"].includes(ei);
  };
  const puedeLiquidar = (v: Fila) => esAdmin && estadoInstDe(v) === "pendiente_liquidar" && String(v.estado ?? "").toLowerCase() !== "liquidada";
  const puedeRevertir = (v: Fila) => {
    const ei = estadoInstDe(v);
    return ei === "pendiente_liquidar" || (esAdmin && ei === "liquidada");
  };

  const liquidar = async (v: Fila) => {
    const nota = window.prompt("Nota de liquidación (opcional):", "") ?? "";
    setError(null);
    setInfo(null);
    setLiquidando(String(v.id));
    try {
      await apiOperacion("liquidarVenta", { solicitud_id: String(v.id), nota });
      setInfo(`Venta ${String(v.id)} liquidada. Fin del flujo.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo liquidar");
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
        desc="Ventas con PV generado: el proveedor solicita liquidación y luego se liquida. Busca arriba, tabla debajo."
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
            <thead><tr><th>ESTADO</th><th>N° COTIZACIÓN</th><th>CLIENTE</th><th>CTA CTO</th><th>PROVEEDOR</th><th>ASESOR</th><th>MONTO TOTAL</th><th>ANTICIPO</th><th>MONTO FINANCIADO</th><th>NRO CUOTAS</th><th>AMBIENTE</th><th>MATERIAL</th><th>FECHA VENTA</th><th>ACCIONES</th></tr></thead>
            <tbody>
              {filtradas.map((v) => (
                <tr key={String(v.id)}>
                  <td><BadgeEstadoVenta estado={String(v.estado ?? "")} /></td>
                  <td className="font-bold text-[#0099D8] whitespace-nowrap">{String(v.cotizacion_codigo ?? "—")}</td>
                  <td className="font-medium">{String(v.cliente_nombre ?? "—")}</td>
                  <td>{String(v.cuenta_contrato ?? "—")}</td>
                  <td>{String(v.proveedor_nombre ?? "—")}</td>
                  <td>{String(v.asesor_nombre ?? "—")}</td>
                  <td className="whitespace-nowrap font-bold">{formatoMoneda(Number(v.monto_total ?? 0))}</td>
                  <td className="whitespace-nowrap">{formatoMoneda(Number(v.anticipo ?? 0))}</td>
                  <td className="whitespace-nowrap">{formatoMoneda(Number(v.monto_financiado ?? 0))}</td>
                  <td>{v.nro_cuotas != null ? String(v.nro_cuotas) : "—"}</td>
                  <td>{String(v.ambiente ?? "—")}</td>
                  <td>{String(v.material_nombre ?? "—")}</td>
                  <td className="whitespace-nowrap text-xs">{v.created_at ? formatoFecha(String(v.created_at)) : "—"}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex gap-1.5">
                      {puedeRegistrar(v) && (
                        <AccSolicitar title="Solicitar liquidación" onClick={() => setReg(v)} />
                      )}
                      <AccVer title="Ver evidencias" onClick={() => setVer(v)} />
                      <Link href={`/ventas/${encodeURIComponent(String(v.id))}`} className="btn-white !py-1 !px-3 !text-xs" title="Gestionar instalación y venta">Gestionar</Link>
                      {puedeLiquidar(v) && (
                        <button className="btn-green !py-1 !px-3 !text-xs" title="Liquidar (ya liquidado en SAP)" disabled={liquidando === String(v.id)} onClick={() => liquidar(v)}>
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

      {reg && <RegistroLiquidacion v={reg} onClose={() => setReg(null)} onHecho={() => cargar()} />}
      {ver && <VerInstalacion v={ver} esAdmin={esAdmin} onClose={() => setVer(null)} onChanged={() => void cargar()} />}
    </Shell></AuthGate>
  );
}
