"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion, EmptyState, formatoFecha, formatoMoneda } from "@/components/Tablas";
import {
  BadgeAbono,
  BadgeEstadoVenta,
  MEDIOS_ABONO,
  SUSTENTOS_INSTALACION,
  SelectorRol,
  TimelineVenta,
  Venta,
  useRolVista,
  ventaAbonos,
  ventaCliente,
  ventaDoc,
  ventaEstado,
  ventaItems,
  ventaNumero,
  ventaObservaciones,
  ventaProveedor,
  ventaTotal,
} from "@/components/VentasComun";

export default function VentaDetallePage() {
  const params = useParams();
  const id = String((params as { id?: string })?.id ?? "");
  const { rol, setRol, esAdmin } = useRolVista();

  const [venta, setVenta] = useState<Venta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showAbono, setShowAbono] = useState(false);
  const [abMonto, setAbMonto] = useState("");
  const [abMedio, setAbMedio] = useState<string>(MEDIOS_ABONO[0]);
  const [abComp, setAbComp] = useState("");

  const [showInst, setShowInst] = useState(false);
  const [sustentos, setSustentos] = useState<Record<string, string>>({});

  const [showAprobar, setShowAprobar] = useState(false);
  const [pedidos, setPedidos] = useState<Record<string, string>>({});
  const [showObservar, setShowObservar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [etapaObs, setEtapaObs] = useState("aprobación");
  const [abonoObs, setAbonoObs] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiOperacion<unknown>("getVenta", { id });
      const o = (d ?? {}) as {
        solicitud?: Venta; items?: Venta[]; abonos?: Venta[]; instalacion?: Venta | null;
      };
      const sol = (o.solicitud ?? d) as Venta;
      if (!sol || typeof sol !== "object" || !sol.id) throw new Error("El backend no devolvió el detalle de la venta.");
      const obs: Venta[] = [];
      const adm = (sol as Record<string, unknown>).observacion_admin;
      if (adm) obs.push({ etapa: "administración", motivo: adm, created_at: (sol as Record<string, unknown>).updated_at });
      const ins = (o.instalacion ?? null) as Venta | null;
      if (ins && (ins as Record<string, unknown>).observacion) {
        obs.push({ etapa: "instalación", motivo: (ins as Record<string, unknown>).observacion, created_at: (ins as Record<string, unknown>).updated_at });
      }
      setVenta({ ...sol, items: o.items ?? [], abonos: o.abonos ?? [], instalacion: ins, observaciones: obs });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el detalle");
      setVenta(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const correr = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      setInfo(okMsg);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operación fallida (backend)");
    } finally {
      setBusy(false);
    }
  };

  const registrarAbono = () =>
    correr(async () => {
      const m = Number(abMonto);
      if (!Number.isFinite(m) || m <= 0) throw new Error("Monto del abono inválido.");
      if (!abComp.trim()) throw new Error("El comprobante (URL) es obligatorio.");
      await apiOperacion("registrarAbono", { solicitud_id: id, monto: m, medio: abMedio, comprobante_url: abComp.trim() });
      setShowAbono(false);
      setAbMonto("");
      setAbComp("");
    }, "Abono registrado en estado pendiente. Stephany lo validará.");

  const validarAbono = (abonoId: string) =>
    correr(() => apiOperacion("validarAbono", { abono_id: abonoId, accion: "validar" }), "Abono validado.");

  const registrarInstalacion = () =>
    correr(async () => {
      const urls: Record<string, string> = {};
      for (const s of SUSTENTOS_INSTALACION) urls[s.key] = (sustentos[s.key] ?? "").trim();
      const faltan = SUSTENTOS_INSTALACION.filter((s) => !urls[s.key]);
      if (faltan.length > 0) throw new Error(`Sustentos obligatorios faltantes: ${faltan.map((s) => s.label).join(", ")}.`);
      await apiOperacion("registrarInstalacion", { solicitud_id: id, ...urls });
      setShowInst(false);
    }, "Instalación registrada.");

  const aprobar = () =>
    correr(async () => {
      const items = venta ? ventaItems(venta) : [];
      if (items.length > 0) {
        const faltan = items.filter((it, i) => {
          const k = String((it as Record<string, unknown>).id ?? i);
          return !(pedidos[k + "_v"] ?? "").trim() && !(pedidos[k + "_a"] ?? "").trim();
        });
        if (faltan.length > 0) throw new Error("Cada ítem exige al menos un número (pedido de venta o de abono).");
        await apiOperacion("aprobarSolicitud", {
          solicitud_id: id,
          pedidos: items.map((it, i) => {
            const k = String((it as Record<string, unknown>).id ?? i);
            return {
              item_id: k,
              numero_pedido_venta: (pedidos[k + "_v"] ?? "").trim(),
              numero_pedido_abono: (pedidos[k + "_a"] ?? "").trim(),
            };
          }),
        });
      } else {
        const v = (pedidos.__v ?? "").trim();
        const a = (pedidos.__a ?? "").trim();
        if (!v && !a) throw new Error("Indica al menos un número de pedido para aprobar.");
        await apiOperacion("aprobarSolicitud", {
          solicitud_id: id,
          pedidos: [{ item_id: "0", numero_pedido_venta: v, numero_pedido_abono: a }],
        });
      }
      setShowAprobar(false);
    }, "Venta aprobada.");

  const observar = () =>
    correr(async () => {
      if (!motivo.trim()) throw new Error("El motivo de la observación es obligatorio.");
      if (etapaObs === "instalación") {
        await apiOperacion("observarInstalacion", { solicitud_id: id, observacion: motivo.trim() });
      } else if (etapaObs === "abonos") {
        if (!abonoObs) throw new Error("Elige el abono a observar desde su fila.");
        await apiOperacion("validarAbono", { abono_id: abonoObs, accion: "observar", observacion: motivo.trim() });
        setAbonoObs(null);
      } else {
        await apiOperacion("observarSolicitud", { solicitud_id: id, observacion: `[${etapaObs}] ${motivo.trim()}` });
      }
      setShowObservar(false);
      setMotivo("");
    }, "Observación registrada.");

  const cerrar = () => correr(() => apiOperacion("validacionFinal", { solicitud_id: id }), "Validación final: venta cerrada.");

  const items = venta ? ventaItems(venta) : [];
  const abonos = venta ? ventaAbonos(venta) : [];
  const obss = venta ? ventaObservaciones(venta) : [];
  const totalCalc = items.reduce((a, it) => {
    const r = it as Record<string, unknown>;
    return a + Number(r.subtotal ?? (Number(r.cantidad ?? 0) * Number(r.precio_unit ?? 0) - Number(r.descuento_monto ?? 0)));
  }, 0);

  return (
    <AuthGate>
      <Shell>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/ventas" className="text-xs font-bold text-[#0099D8]">← Registro de ventas</Link>
          <span className="ml-auto"><SelectorRol rol={rol} setRol={setRol} /></span>
        </div>

        {loading ? (
          <div className="card p-6 mt-4 text-sm text-[#0099D8]">Cargando detalle…</div>
        ) : !venta ? (
          <div className="mt-4">
            {error && <p className="card p-4 mb-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
            <EmptyState titulo="Sin detalle de venta" detalle="El backend no devolvió la venta (obtenerVenta). Revisa el mensaje de error." />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <div>
                <h1 className="text-2xl font-extrabold">Venta {ventaNumero(venta)}</h1>
                <p className="text-sm text-slate-500">{ventaCliente(venta)}{ventaDoc(venta) ? ` · ${ventaDoc(venta)}` : ""} · {ventaProveedor(venta)} · <b>{formatoMoneda(totalCalc > 0 ? totalCalc : ventaTotal(venta))}</b></p>
              </div>
              <span className="ml-auto"><BadgeEstadoVenta estado={ventaEstado(venta)} /></span>
            </div>

            {error && <p className="card p-3 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
            {info && <p className="card p-3 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}

            <section className="card p-5 mt-4">
              <h3 className="font-bold mb-3">Línea de tiempo</h3>
              <TimelineVenta estado={ventaEstado(venta)} />
            </section>

            <section className="card mt-4">
              <div className="px-5 py-3 border-b font-semibold">Ítems y números de pedido · {items.length}</div>
              {items.length === 0 ? (
                <div className="p-5"><EmptyState titulo="Sin ítems" detalle="El backend no devolvió ítems para esta venta." /></div>
              ) : (
                <div className="overflow-x-auto"><table className="tabla">
                  <thead><tr><th>MATERIAL</th><th>CANT.</th><th>PRECIO</th><th>NETO</th><th>N.º PEDIDO VENTA</th><th>N.º PEDIDO ABONO</th></tr></thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={String((it as Record<string, unknown>).id ?? i)}>
                        <td className="font-medium">{String((it as Record<string, unknown>).nombre ?? (it as Record<string, unknown>).material ?? (it as Record<string, unknown>).id_material ?? "—")}</td>
                        <td>{String((it as Record<string, unknown>).cantidad ?? "—")}</td>
                        <td>S/ {Number((it as Record<string, unknown>).precio_unit ?? 0).toFixed(2)}</td>
                        <td className="font-bold">S/ {Number((it as Record<string, unknown>).subtotal ?? (Number((it as Record<string, unknown>).cantidad ?? 0) * Number((it as Record<string, unknown>).precio_unit ?? 0) - Number((it as Record<string, unknown>).descuento_monto ?? 0))).toFixed(2)}</td>
                        <td className="font-mono text-xs">{String((it as Record<string, unknown>).numero_pedido_venta ?? "—")}</td>
                        <td className="font-mono text-xs">{String((it as Record<string, unknown>).numero_pedido_abono ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </section>

            <section className="card mt-4">
              <div className="px-5 py-3 border-b font-semibold flex items-center gap-2">
                Abonos · {abonos.length}
                {!esAdmin && <button className="btn-white !py-1 !px-3 text-xs ml-auto" onClick={() => setShowAbono((s) => !s)}>Registrar abono</button>}
              </div>
              {showAbono && !esAdmin && (
                <div className="p-5 grid md:grid-cols-4 gap-3 border-b bg-slate-50">
                  <div><label className="label">Monto (S/) *</label><input type="number" min={0} step="any" className="input" value={abMonto} onChange={(e) => setAbMonto(e.target.value)} /></div>
                  <div><label className="label">Medio</label><select className="input" value={abMedio} onChange={(e) => setAbMedio(e.target.value)}>{MEDIOS_ABONO.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
                  <div className="md:col-span-2"><label className="label">Comprobante (URL)</label><input className="input" placeholder="https://…" value={abComp} onChange={(e) => setAbComp(e.target.value)} /></div>
                  <div className="md:col-span-4 flex justify-end gap-2">
                    <button className="btn-white" onClick={() => setShowAbono(false)}>Cancelar</button>
                    <button className="btn-green" onClick={registrarAbono} disabled={busy}>{busy ? "Guardando…" : "Guardar abono"}</button>
                  </div>
                </div>
              )}
              {abonos.length === 0 ? (
                <div className="p-5"><EmptyState titulo="Sin abonos" detalle="Aún no hay abonos registrados para esta venta." /></div>
              ) : (
                <div className="overflow-x-auto"><table className="tabla">
                  <thead><tr><th>MONTO</th><th>MEDIO</th><th>COMPROBANTE</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
                  <tbody>
                    {abonos.map((a, i) => {
                      const est = String(a.estado ?? "pendiente");
                      return (
                        <tr key={String(a.id ?? i)}>
                          <td className="font-bold">S/ {Number(a.monto ?? 0).toFixed(2)}</td>
                          <td className="capitalize">{String(a.medio ?? "—")}</td>
                          <td className="max-w-[220px] truncate text-xs text-[#0099D8]">{String(a.comprobante_url ?? a.comprobante ?? "—")}</td>
                          <td><BadgeAbono estado={est} /></td>
                          <td className="whitespace-nowrap">{esAdmin && est.toLowerCase() !== "validado" && (
                            <>
                              <button className="btn-green !py-1 !px-3 text-xs mr-2" onClick={() => validarAbono(String(a.id ?? ""))} disabled={busy}>Validar</button>
                              <button className="btn-white !py-1 !px-3 text-xs" onClick={() => { setAbonoObs(String(a.id ?? "")); setEtapaObs("abonos"); setShowObservar(true); }} disabled={busy}>Observar</button>
                            </>
                          )}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
            </section>

            <section className="card p-5 mt-4">
              <div className="flex items-center gap-2">
                <h3 className="font-bold">Instalación (4 sustentos)</h3>
                {!esAdmin && <button className="btn-white !py-1 !px-3 text-xs ml-auto" onClick={() => setShowInst((s) => !s)}>Registrar instalación</button>}
              </div>
              {showInst && !esAdmin ? (
                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  {SUSTENTOS_INSTALACION.map((s) => (
                    <div key={s.key}>
                      <label className="label">{s.label} *</label>
                      <input className="input" placeholder="URL del sustento" value={sustentos[s.key] ?? ""} onChange={(e) => setSustentos((p) => ({ ...p, [s.key]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="md:col-span-2 flex justify-end gap-2">
                    <button className="btn-white" onClick={() => setShowInst(false)}>Cancelar</button>
                    <button className="btn-green" onClick={registrarInstalacion} disabled={busy}>{busy ? "Guardando…" : "Guardar instalación"}</button>
                  </div>
                </div>
              ) : (
                <ul className="mt-2 text-sm text-slate-600 list-disc pl-5">
                  {SUSTENTOS_INSTALACION.map((s) => <li key={s.key}>{s.label}</li>)}
                </ul>
              )}
            </section>

            <section className="card mt-4">
              <div className="px-5 py-3 border-b font-semibold">Observaciones por etapa · {obss.length}</div>
              {obss.length === 0 ? (
                <div className="p-5"><EmptyState titulo="Sin observaciones" detalle="No hay observaciones registradas por etapa." /></div>
              ) : (
                <ul className="divide-y">
                  {obss.map((o, i) => (
                    <li key={String(o.id ?? i)} className="px-5 py-3 text-sm">
                      <p className="font-bold capitalize">{String(o.etapa ?? "general")} <span className="font-normal text-slate-400">· {o.created_at ? formatoFecha(String(o.created_at)) : ""}</span></p>
                      <p className="text-slate-600">{String(o.motivo ?? o.texto ?? o.observacion ?? "")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card p-5 mt-4">
              <h3 className="font-bold mb-3">Acciones</h3>
              {!esAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-white" onClick={() => setShowAbono((s) => !s)}>Registrar abono</button>
                  <button className="btn-white" onClick={() => setShowInst((s) => !s)}>Registrar instalación</button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-green" onClick={() => setShowAprobar((s) => !s)}>✓ Aprobar</button>
                  <button className="btn-white" onClick={() => setShowObservar((s) => !s)}>Observar</button>
                  <button className="btn-white" onClick={cerrar} disabled={busy}>Validación final · Cerrar</button>
                </div>
              )}

              {showAprobar && esAdmin && (
                <div className="mt-4 rounded-xl border border-slate-200 p-4 space-y-3">
                  <p className="text-sm font-bold">Aprobar con números de pedido por ítem (obligatorios)</p>
                  {items.length === 0 ? (
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Número de pedido venta *</label>
                        <input className="input" value={pedidos.__v ?? ""} onChange={(e) => setPedidos((p) => ({ ...p, __v: e.target.value }))} placeholder="Ej. PED-000123" />
                      </div>
                      <div>
                        <label className="label">Número de pedido abono</label>
                        <input className="input" value={pedidos.__a ?? ""} onChange={(e) => setPedidos((p) => ({ ...p, __a: e.target.value }))} placeholder="Ej. ABO-000123" />
                      </div>
                    </div>
                  ) : items.map((it, i) => {
                    const k = String((it as Record<string, unknown>).id ?? i);
                    return (
                      <div key={k + i} className="grid md:grid-cols-2 gap-3">
                        <div>
                          <label className="label">N.º pedido venta · {String((it as Record<string, unknown>).nombre ?? (it as Record<string, unknown>).material ?? k)} *</label>
                          <input className="input" value={pedidos[k + "_v"] ?? ""} onChange={(e) => setPedidos((p) => ({ ...p, [k + "_v"]: e.target.value }))} placeholder="Ej. PED-000123" />
                        </div>
                        <div>
                          <label className="label">N.º pedido abono · {String((it as Record<string, unknown>).nombre ?? (it as Record<string, unknown>).material ?? k)}</label>
                          <input className="input" value={pedidos[k + "_a"] ?? ""} onChange={(e) => setPedidos((p) => ({ ...p, [k + "_a"]: e.target.value }))} placeholder="Ej. ABO-000123" />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-end gap-2">
                    <button className="btn-white" onClick={() => setShowAprobar(false)}>Cancelar</button>
                    <button className="btn-green" onClick={aprobar} disabled={busy}>{busy ? "Aprobando…" : "✓ Confirmar aprobación"}</button>
                  </div>
                </div>
              )}

              {showObservar && esAdmin && (
                <div className="mt-4 rounded-xl border border-slate-200 p-4 space-y-3">
                  <div>
                    <label className="label">Etapa observada</label>
                    <select className="input !w-56" value={etapaObs} onChange={(e) => setEtapaObs(e.target.value)}>
                      <option value="aprobación">Aprobación</option>
                      <option value="abonos">Abonos</option>
                      <option value="instalación">Instalación</option>
                      <option value="cierre">Cierre</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Motivo *</label>
                    <textarea className="input min-h-[80px]" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Describe el motivo de la observación" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button className="btn-white" onClick={() => setShowObservar(false)}>Cancelar</button>
                    <button className="btn-green" onClick={observar} disabled={busy}>{busy ? "Guardando…" : "Guardar observación"}</button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </Shell>
    </AuthGate>
  );
}
