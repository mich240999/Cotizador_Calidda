"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState, formatoFecha } from "@/components/Tablas";
import { BadgeEstadoVenta } from "@/components/VentasComun";
import { subirArchivoStorage } from "@/components/VentasComun";
import { SUSTENTOS_INSTALACION } from "@/components/VentasComun";

type Pendiente = {
  id: string;
  cliente?: string | null;
  cliente_doc?: string | null;
  proveedor?: string | null;
  canal?: string | null;
  estado?: string | null;
  instalacion_estado?: string | null;
  updated_at?: string | null;
};

export default function InstalacionesPage() {
  const [rows, setRows] = useState<Pendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reg, setReg] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [obsProv, setObsProv] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiOperacion<{ rows?: Pendiente[] }>("listarInstalacionesPendientes", { limit: 200 });
      const arr = Array.isArray(d) ? d : (d?.rows ?? []);
      setRows(Array.isArray(arr) ? (arr as Pendiente[]) : []);
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

  return (
    <AuthGate><Shell>
      <ModHead
        eyebrow="VISTA DEL PROVEEDOR"
        title="Instalaciones pendientes"
        desc="Ventas aprobadas de tu empresa listas para instalar. Registra los 4 sustentos por venta."
        actions={<button className="btn-white !bg-white/95" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>}
      />
      {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
      {info && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}
      {loading ? (
        <div className="card p-10 mt-4 text-center text-slate-500">Cargando instalaciones…</div>
      ) : rows.length === 0 ? (
        <div className="mt-4"><EmptyState titulo="Sin pendientes" detalle="No tienes ventas aprobadas por instalar." /></div>
      ) : (
        <div className="space-y-4 mt-4">
          {rows.map((v) => (
            <div key={String(v.id)} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <p className="font-mono font-bold">{String(v.id)}</p>
                  <p className="text-sm text-slate-500">
                    {v.cliente ?? ""}{v.cliente_doc ? ` · ${v.cliente_doc}` : ""} · {v.proveedor ?? ""}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Instalación: {String(v.instalacion_estado ?? "pendiente").replace(/_/g, " ")} · {v.updated_at ? formatoFecha(String(v.updated_at)) : ""}
                  </p>
                </div>
                <span className="ml-auto"><BadgeEstadoVenta estado={String(v.estado ?? "")} /></span>
              </div>
              {reg === String(v.id) ? (
                <div className="grid md:grid-cols-2 gap-3 mt-4">
                  {SUSTENTOS_INSTALACION.map((s) => {
                    const k = `${v.id}:${s.key}`;
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
                      value={obsProv[String(v.id)] ?? ""}
                      onChange={(e) => setObsProv((p) => ({ ...p, [String(v.id)]: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Foto adicional (opcional)</label>
                    <input className="input" placeholder="https://…" value={urls[`${v.id}:foto_extra_url`] ?? ""} onChange={(e) => setUrls((p) => ({ ...p, [`${v.id}:foto_extra_url`]: e.target.value }))} />
                    <input
                      type="file" accept=".pdf,image/*" className="input mt-2"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f, `${v.id}:foto_extra_url`); e.target.value = ""; }}
                    />
                    {subiendo === `${v.id}:foto_extra_url` && <p className="text-[11px] text-slate-500 mt-1">Subiendo archivo…</p>}
                  </div>
                  <div className="md:col-span-2 flex justify-end gap-2">
                    <button className="btn-white" onClick={() => setReg(null)}>Cancelar</button>
                    <button className="btn-green" onClick={() => guardar(String(v.id))} disabled={busy}>{busy ? "Guardando…" : "Guardar instalación"}</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Link href={`/ventas/${encodeURIComponent(String(v.id))}`} className="btn-white !py-1.5 !text-xs !no-underline">Ver venta</Link>
                  <button className="btn-green !py-1.5 !text-xs" onClick={() => setReg(String(v.id))}>Registrar instalación</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell></AuthGate>
  );
}
