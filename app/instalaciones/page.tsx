"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState, formatoFecha, formatoMoneda } from "@/components/Tablas";
import { AccAprobar, AccVer } from "@/components/Accion";
import { BadgeEstadoVenta, subirArchivoStorage, useRolVista } from "@/components/VentasComun";

type Fila = Record<string, unknown>;

const INSTALABLE = ["generada", "aprobada", "en_instalacion", "instalada", "observada", "validada_proveedor"];

const enRango = (iso: unknown, desde: string, hasta: string) => {
  if (!desde && !hasta) return true;
  const t = new Date(String(iso ?? "")).getTime();
  if (Number.isNaN(t)) return false;
  if (desde && t < new Date(`${desde}T00:00:00`).getTime()) return false;
  if (hasta && t > new Date(`${hasta}T23:59:59`).getTime()) return false;
  return true;
};

const estadoInstDe = (v: Fila) => String(v.instalacion_estado ?? "pendiente_instalar");

function CampoArchivo({ titulo, url, setUrl, obligatorio }: {
  titulo: string; url: string; setUrl: (u: string) => void; obligatorio?: boolean;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const subir = async (f: File) => {
    setErr(null);
    setSubiendo(true);
    try {
      setUrl(await subirArchivoStorage(f, "sustentos"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
    }
  };
  return (
    <div>
      <label className="label">{titulo} {obligatorio && <span className="text-red-600">*</span>}</label>
      <input className="input" placeholder="https://… (o sube el archivo)" value={url} onChange={(e) => setUrl(e.target.value)} />
      <input
        type="file" accept=".pdf,image/*" className="input mt-2"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = ""; }}
      />
      {subiendo && <p className="text-[11px] text-slate-500 mt-1">Subiendo…</p>}
      {err && <p className="text-[11px] text-red-600 mt-1">{err}</p>}
      {url && <p className="text-[11px] text-emerald-700 mt-1 break-all">✓ Listo</p>}
    </div>
  );
}

function RegistroLiquidacion({ v, onClose, onHecho }: { v: Fila; onClose: () => void; onHecho: () => void }) {
  const [tipo, setTipo] = useState<"anticipo" | "acta">("acta");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = (k: string) => (u: string) => setUrls((p) => ({ ...p, [k]: u }));

  const guardar = async () => {
    setMsg(null);
    setGuardando(true);
    try {
      const r = await apiOperacion<{ parcial?: boolean }>("registrarLiquidacion", {
        solicitud_id: String(v.id),
        tipo,
        voucher_url: urls.voucher ?? "",
        foto_antes_url: urls.antes ?? "",
        foto_durante_url: urls.durante ?? "",
        foto_despues_url: urls.despues ?? "",
        foto_dni_url: urls.dni ?? "",
        foto_cliente_dni_url: urls.cliente_dni ?? "",
        acta_url: urls.acta ?? "",
        boleta_url: urls.boleta ?? "",
      });
      if ((r as { parcial?: boolean })?.parcial) {
        setMsg("Guardado parcial (instalada): falta la migración de BD para el flujo nuevo.");
        return;
      }
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
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl my-6 overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="font-bold text-lg">Solicitar liquidación · {String(v.id)}</h2>
            <p className="text-xs text-slate-500">Elige UNA forma. Al guardar pasa a pendiente de liquidar.</p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <label className={`rounded-xl border p-4 cursor-pointer ${tipo === "anticipo" ? "border-[#0099D8] bg-sky-50" : "border-slate-200"}`}>
              <input type="radio" checked={tipo === "anticipo"} onChange={() => setTipo("anticipo")} className="mr-2" />
              <span className="font-bold text-sm">Por anticipo / adelanto</span>
              <span className="block text-xs text-slate-500 mt-1">Sube el voucher (PDF o foto).</span>
            </label>
            <label className={`rounded-xl border p-4 cursor-pointer ${tipo === "acta" ? "border-[#0099D8] bg-sky-50" : "border-slate-200"}`}>
              <input type="radio" checked={tipo === "acta"} onChange={() => setTipo("acta")} className="mr-2" />
              <span className="font-bold text-sm">Por acta de entrega</span>
              <span className="block text-xs text-slate-500 mt-1">Fotos + acta + boleta (foto o PDF).</span>
            </label>
          </div>
          {tipo === "anticipo" ? (
            <CampoArchivo titulo="Voucher del anticipo (PDF o foto)" url={urls.voucher ?? ""} setUrl={set("voucher")} obligatorio />
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              <CampoArchivo titulo="Foto del antes" url={urls.antes ?? ""} setUrl={set("antes")} obligatorio />
              <CampoArchivo titulo="Foto del durante" url={urls.durante ?? ""} setUrl={set("durante")} obligatorio />
              <CampoArchivo titulo="Foto del después" url={urls.despues ?? ""} setUrl={set("despues")} obligatorio />
              <CampoArchivo titulo="Foto del DNI" url={urls.dni ?? ""} setUrl={set("dni")} obligatorio />
              <CampoArchivo titulo="Foto del cliente con su DNI" url={urls.cliente_dni ?? ""} setUrl={set("cliente_dni")} obligatorio />
              <CampoArchivo titulo="Acta de conformidad (foto o PDF)" url={urls.acta ?? ""} setUrl={set("acta")} obligatorio />
              <CampoArchivo titulo="Boleta de venta (foto o PDF)" url={urls.boleta ?? ""} setUrl={set("boleta")} obligatorio />
            </div>
          )}
          {msg && <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50">
          <button className="btn-white" onClick={onClose}>Cancelar</button>
          <button className="btn-green" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar y pasar a pendiente de liquidar"}</button>
        </div>
      </div>
    </div>
  );
}

function VerInstalacion({ v, onClose }: { v: Fila; onClose: () => void }) {
  const ins = (v.instalacion ?? {}) as Record<string, unknown>;
  const archivos = ([
    ["Voucher del anticipo", ins.voucher_url],
    ["Foto del antes", ins.foto_antes_url],
    ["Foto del durante", ins.foto_durante_url],
    ["Foto del después", ins.foto_despues_url],
    ["Foto del DNI", ins.foto_dni_url],
    ["Foto del cliente con su DNI", ins.foto_cliente_dni_url],
    ["Acta de conformidad", ins.acta_url],
    ["Boleta de venta", ins.boleta_url],
  ] as [string, unknown][]).filter(([, u]) => String(u ?? "").trim() !== "");
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-6 overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="font-bold text-lg">Instalación · {String(v.id)}</h2>
            <p className="text-xs text-slate-500">
              Estado: {estadoInstDe(v).replace(/_/g, " ").toUpperCase()}
              {ins.tipo_liquidacion ? ` · Vía ${String(ins.tipo_liquidacion) === "anticipo" ? "anticipo" : "acta de entrega"}` : ""}
            </p>
          </div>
          <button className="btn-white !px-3" onClick={onClose}>✕</button>
        </div>
        <div className="p-6">
          {archivos.length === 0 ? (
            <p className="text-sm text-slate-500">El proveedor aún no sube evidencias (pendiente de instalar).</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {archivos.map(([t, u]) => {
                const href = /^https?:\/\//i.test(String(u ?? "").trim()) ? String(u).trim() : null;
                return (
                  <div key={t} className="rounded-xl border border-slate-200 p-3">
                    <p className="font-bold text-sm">{t}</p>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="text-xs text-[#0099D8] mt-1 break-all block">Abrir archivo →</a>
                    ) : (
                      <p className="text-xs text-slate-400 mt-1">Enlace no válido</p>
                    )}
                  </div>
                );
              })}
            </div>
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
    return INSTALABLE.includes(est) && !["pendiente_liquidar", "liquidada"].includes(ei) && est !== "liquidada";
  };
  const puedeLiquidar = (v: Fila) => esAdmin && estadoInstDe(v) === "pendiente_liquidar" && String(v.estado ?? "").toLowerCase() !== "liquidada";
  const puedeRevertir = (v: Fila) => {
    const ei = estadoInstDe(v);
    return ei === "pendiente_liquidar" || (esAdmin && ei === "liquidada");
  };

  const liquidar = async (v: Fila) => {
    setError(null);
    setInfo(null);
    setLiquidando(String(v.id));
    try {
      await apiOperacion("liquidarVenta", { solicitud_id: String(v.id) });
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
    if (!window.confirm(`¿Revertir la liquidación de ${id}? La venta volverá al paso anterior.`)) return;
    setError(null);
    setInfo(null);
    setRevirtiendo(id);
    try {
      const r = await apiOperacion<{ estado?: string }>("revertirLiquidacion", { solicitud_id: id });
      setInfo(`Venta ${id} revertida a ${r?.estado ?? "validada_proveedor"}.`);
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
          <button className="btn-white !bg-white/95" onClick={() => cargar()} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
          <button className="btn-white !bg-white/95" onClick={exportar} disabled={filtradas.length === 0}>Exportar XLSX</button>
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
            {["generada", "aprobada", "en_instalacion", "instalada", "pendiente_liquidar", "validada_proveedor", "observada", "cerrada", "liquidada"].map((e) => (
              <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Instalación</label>
          <select className="input !w-auto" value={fInst} onChange={(e) => setFInst(e.target.value)}>
            <option value="">Todas</option>
            {["pendiente_instalar", "registrada", "pendiente_liquidar", "validada_proveedor", "observada", "cerrada", "liquidada"].map((e) => (
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
                        <button className="btn-green !py-1 !px-3 !text-xs" title="Solicitar liquidación" onClick={() => setReg(v)}>🔧</button>
                      )}
                      <AccVer title="Ver evidencias" onClick={() => setVer(v)} />
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
      {ver && <VerInstalacion v={ver} onClose={() => setVer(null)} />}
    </Shell></AuthGate>
  );
}
