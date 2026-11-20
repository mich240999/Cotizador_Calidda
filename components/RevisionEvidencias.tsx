"use client";

import { useEffect, useState } from "react";
import { apiOperacion } from "@/components/Tablas";
import { BadgeEvidencia, SUSTENTOS_INSTALACION } from "@/components/VentasComun";

type Evidencia = { tipo?: unknown; url?: unknown; estado?: unknown; observacion?: unknown };

export default function RevisionEvidencias({ solicitudId, evidencias, esAdmin, onChanged }: {
  solicitudId: string; evidencias: Evidencia[]; esAdmin: boolean; onChanged: () => void;
}) {
  const [seleccionadas, setSeleccionadas] = useState<Record<string, boolean>>({});
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setSeleccionadas(Object.fromEntries(evidencias.map((e) => [String(e.tipo), e.estado === "aprobado"])));
    setComentarios(Object.fromEntries(evidencias.map((e) => [String(e.tipo), String(e.observacion ?? "")])));
  }, [evidencias]);

  const completas = SUSTENTOS_INSTALACION.every((s) => evidencias.some((e) => e.tipo === s.tipo && e.url));
  const guardar = async () => {
    const decisiones = SUSTENTOS_INSTALACION.map((s) => ({
      tipo: s.tipo, aprobada: !!seleccionadas[s.tipo], observacion: (comentarios[s.tipo] ?? "").trim(),
    }));
    const faltante = decisiones.find((d) => !d.aprobada && !d.observacion);
    if (faltante) {
      const nombre = SUSTENTOS_INSTALACION.find((s) => s.tipo === faltante.tipo)?.label ?? faltante.tipo;
      setError(`Indica qué falló en ${nombre}.`);
      return;
    }
    setError("");
    setGuardando(true);
    try {
      await apiOperacion("revisarEvidencias", { solicitud_id: solicitudId, decisiones });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la revisión.");
    } finally {
      setGuardando(false);
    }
  };

  return <div className="mt-3 space-y-3">
    {esAdmin && completas && <p className="text-sm text-slate-600">Marca las evidencias que apruebas. Describe qué debe corregirse en las que queden sin marcar.</p>}
    <div className="grid sm:grid-cols-2 gap-3">
      {SUSTENTOS_INSTALACION.map((s) => {
        const ev = evidencias.find((e) => e.tipo === s.tipo);
        const url = String(ev?.url ?? "");
        const estado = String(ev?.estado ?? "pendiente");
        const esImagen = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
        return <div key={s.tipo} className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 pt-2">
            <p className="text-xs font-bold">{s.label}</p>
            <BadgeEvidencia estado={estado} />
          </div>
          {url ? <>
            {esImagen && <img src={url} alt={s.label} className="mt-2 h-32 w-full object-cover" loading="lazy" />}
            <a className="block px-3 py-2 text-xs font-bold text-[#0099D8] hover:underline" href={url} target="_blank" rel="noreferrer">Ver archivo ↗</a>
          </> : <p className="px-3 py-2 text-xs text-slate-400">Aún no entregado</p>}
          {esAdmin && url && completas && <div className="border-t border-slate-100 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={!!seleccionadas[s.tipo]} onChange={(e) => setSeleccionadas((p) => ({ ...p, [s.tipo]: e.target.checked }))} /> Aprobar
            </label>
            {!seleccionadas[s.tipo] && <textarea className="input !text-xs" placeholder="Indica qué debe corregirse" value={comentarios[s.tipo] ?? ""} onChange={(e) => setComentarios((p) => ({ ...p, [s.tipo]: e.target.value }))} />}
          </div>}
          {!esAdmin && ev?.observacion ? <p className="mx-3 mb-2 text-xs text-red-700">Observación: {String(ev.observacion)}</p> : null}
        </div>;
      })}
    </div>
    {error && <p className="text-sm text-red-700">{error}</p>}
    {esAdmin && completas && <div className="flex justify-end"><button className="btn-green" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Aprobar seleccionadas"}</button></div>}
  </div>;
}
