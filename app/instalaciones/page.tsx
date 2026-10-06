"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState, formatoFecha } from "@/components/Tablas";
import { BadgeEstadoVenta, subirArchivoStorage, SUSTENTOS_INSTALACION } from "@/components/VentasComun";

type Fila = {
  id: string;
  cliente?: string | null;
  cliente_doc?: string | null;
  proveedor?: string | null;
  canal?: string | null;
  estado?: string | null;
  instalacion_estado?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export default function InstalacionesPage() {
  const [rows, setRows] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fEst, setFEst] = useState("");
  const [fInst, setFInst] = useState("");
  const [reg, setReg] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [obsProv, setObsProv] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportando, setExportando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiOperacion<{ rows?: Fila[] }>("listarInstalacionesPendientes", { limit: 500 });
      const arr = Array.isArray(d) ? d : (d?.rows ?? []);
      setRows(Array.isArray(arr) ? (arr as Fila[]) : []);
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
      if (s && ![v.id, v.cliente ?? "", v.cliente_doc ?? "", v.proveedor ?? ""].join(" ").toLowerCase().includes(s)) return false;
      if (fEst && String(v.estado ?? "").toLowerCase() !== fEst) return false;
      if (fInst && String(v.instalacion_estado ?? "pendiente").toLowerCase() !== fInst) return false;
      return true;
    });
  }, [rows, q, fEst, fInst]);

  const exportar = async () => {
    if (filtradas.length === 0) {
      setError("Sin filas para exportar con los filtros actuales.");
      return;
    }
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const hoja = XLSX.utils.json_to_sheet(
        filtradas.map((v) => ({
          VENTA: String(v.id),
          CLIENTE: v.cliente ?? "",
          DOCUMENTO: v.cliente_doc ?? "",
          PROVEEDOR: v.proveedor ?? "",
          CANAL: v.canal ?? "",
          ESTADO_VENTA: String(v.estado ?? "").replace(/_/g, " "),
          ESTADO_INSTALACION: String(v.instalacion_estado ?? "pendiente").replace(/_/g, " "),
          ACTUALIZACION: v.updated_at ? formatoFecha(String(v.updated_at)) : "",
        }))
      );
      hoja["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, hoja, "Instalaciones");
      XLSX.writeFile(wb, "instalaciones.xlsx");
      setInfo(`Exportadas ${filtradas.length} filas a instalaciones.xlsx.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  };

  const subir = async (f: File, key: string) => {
    setError(null);
    setSubiendo(key);
    try {
      const url = await subirArchivoStorage(f, "sustentos");
      setUrls((p) => ({ ...p, [key]: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(null);
    }
  };

  const guardar = async (id: string) => {
    setError(null);
    setInfo(null);
    const body: Record<string, string> = {};
    for (const s of SUSTENTOS_INSTALACION) body[s.key] = (urls[`${id}:${s.key}`] ?? "").trim();
    const faltan = SUSTENTOS_INSTALACION.filter((s) => !body[s.key]);
    if (faltan.length > 0) {
      setError(`Sustentos obligatorios faltantes: ${faltan.map((s) => s.label).join(", ")}.`);
      return;
    }
    setBusy(true);
    try {
      await apiOperacion("registrarInstalacion", {
        solicitud_id: id,
        ...body,
        observacion: (obsProv[id] ?? "").trim(),
        foto_extra_url: (urls[`${id}:foto_extra_url`] ?? "").trim(),
      });
      setInfo(`Instalación registrada en ${id}: pasa a INSTALADA. Stephany la valida y liquida.`);
      setReg(null);
      setUrls({});
      setObsProv((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setBusy(false);
    }
  };

  const puedeRegistrar = (v: Fila) =>
    ["aprobada", "en_instalacion", "instalada", "observada"].includes(String(v.estado ?? "").toLowerCase());

  return (
    <AuthGate><Shell>
      <ModHead
        eyebrow="VISTA DEL PROVEEDOR"
        title="Instalaciones"
        desc="Todas las ventas de tu empresa con su estado de instalación. Registra los 4 sustentos por venta."
        actions={<>
          <button className="btn-white !bg-white/95" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
          <button className="btn-white !bg-white/95" onClick={exportar} disabled={exportando || filtradas.length === 0}>{exportando ? "Exportando…" : "Exportar XLSX"}</button>
        </>}
      />
      <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Buscar</label>
          <input className="input" placeholder="Venta, cliente, documento o proveedor" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="label">Estado venta</label>
          <select className="input !w-auto" value={fEst} onChange={(e) => setFEst(e.target.value)}>
            <option value="">Todas</option>
            {["aprobada", "en_instalacion", "instalada", "validada_proveedor", "observada", "cerrada", "liquidada"].map((e) => (
              <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Instalación</label>
          <select className="input !w-auto" value={fInst} onChange={(e) => setFInst(e.target.value)}>
            <option value="">Todas</option>
            {["pendiente", "registrada", "validada_proveedor", "observada", "cerrada"].map((e) => (
              <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <button className="btn-white !py-2" onClick={() => { setQ(""); setFEst(""); setFInst(""); }}>Limpiar filtros</button>
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
            <thead><tr><th>VENTA</th><th>CLIENTE</th><th>ESTADO VENTA</th><th>INSTALACIÓN</th><th>ACTUALIZACIÓN</th><th>ACCIONES</th></tr></thead>
            <tbody>
              {filtradas.map((v) => (
                <tr key={String(v.id)}>
                  <td className="font-mono text-xs font-bold">{String(v.id)}</td>
                  <td className="font-medium">{v.cliente ?? "—"}{v.cliente_doc ? <span className="block text-[11px] text-slate-400">{v.cliente_doc}</span> : null}</td>
                  <td><BadgeEstadoVenta estado={String(v.estado ?? "")} /></td>
                  <td>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      {String(v.instalacion_estado ?? "pendiente").replace(/_/g, " ").toUpperCase()}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{v.updated_at ? formatoFecha(String(v.updated_at)) : "—"}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex gap-1.5">
                      <Link href={`/ventas/${encodeURIComponent(String(v.id))}`} className="btn-white !py-1 !px-3 !text-xs !no-underline" title="Ver venta">👁</Link>
                      {puedeRegistrar(v) && (
                        <button className="btn-green !py-1 !px-3 !text-xs" title="Registrar instalación" onClick={() => setReg(reg === String(v.id) ? null : String(v.id))}>🔧</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {reg && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-xl my-6">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-extrabold">Registrar instalación · {reg}</h2>
                <p className="text-xs text-slate-500">Al guardar, la venta pasa a INSTALADA.</p>
              </div>
              <button className="btn-white !px-3" onClick={() => setReg(null)}>✕</button>
            </div>
            <div className="p-6 grid md:grid-cols-2 gap-3">
              {SUSTENTOS_INSTALACION.map((s) => {
                const k = `${reg}:${s.key}`;
                return (
                  <div key={s.key}>
                    <label className="label">{s.label} *</label>
                    <input className="input" placeholder="https://…" value={urls[k] ?? ""} onChange={(e) => setUrls((p) => ({ ...p, [k]: e.target.value }))} />
                    <input
                      type="file" accept=".pdf,image/*" className="input mt-2"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f, k); e.target.value = ""; }}
                    />
                    {subiendo === k && <p className="text-[11px] text-slate-500 mt-1">Subiendo archivo…</p>}
                  </div>
                );
              })}
              <div className="md:col-span-2">
                <label className="label">Observación del proveedor (opcional)</label>
                <textarea
                  className="input min-h-[70px]"
                  placeholder="Ej. Se instaló con retraso por acceso al predio…"
                  value={obsProv[reg] ?? ""}
                  onChange={(e) => setObsProv((p) => ({ ...p, [reg]: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Foto adicional (opcional)</label>
                <input className="input" placeholder="https://…" value={urls[`${reg}:foto_extra_url`] ?? ""} onChange={(e) => setUrls((p) => ({ ...p, [`${reg}:foto_extra_url`]: e.target.value }))} />
                <input
                  type="file" accept=".pdf,image/*" className="input mt-2"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f, `${reg}:foto_extra_url`); e.target.value = ""; }}
                />
                {subiendo === `${reg}:foto_extra_url` && <p className="text-[11px] text-slate-500 mt-1">Subiendo archivo…</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
              <button className="btn-white" onClick={() => setReg(null)}>Cancelar</button>
              <button className="btn-green" onClick={() => guardar(reg)} disabled={busy}>{busy ? "Guardando…" : "Guardar instalación"}</button>
            </div>
          </div>
        </div>
      )}
    </Shell></AuthGate>
  );
}
