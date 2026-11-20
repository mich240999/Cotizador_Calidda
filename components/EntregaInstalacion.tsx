"use client";

import { useState } from "react";
import { apiOperacion } from "./Tablas";
import { SUSTENTOS_INSTALACION, subirArchivoStorage } from "./VentasComun";

export default function EntregaInstalacion({ id, evidencias, onSaved }: {
  id: string; evidencias: Record<string, unknown>[]; onSaved: () => void;
}) {
  const [archivos, setArchivos] = useState<Record<string, File>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const subsanar = evidencias.some((e) => e.estado === "rechazado");
  const campos = SUSTENTOS_INSTALACION.map((campo) => ({
    ...campo, evidencia: evidencias.find((e) => e.tipo === campo.tipo),
  }));
  const editables = campos.filter(({ evidencia }) => !subsanar || !evidencia?.url || evidencia.estado === "rechazado");

  async function guardar() {
    if (editables.some(({ key }) => !archivos[key])) {
      setError("Selecciona un archivo para cada evidencia solicitada.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      const urls = Object.fromEntries(campos.map(({ key, evidencia }) => [key, String(evidencia?.url ?? "")]));
      for (const { key } of editables) urls[key] = await subirArchivoStorage(archivos[key], "sustentos");
      await apiOperacion("registrarInstalacion", { solicitud_id: id, ...urls });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo entregar la instalación.");
    } finally {
      setGuardando(false);
    }
  }

  return <div className="space-y-4">
    {editables.map(({ key, label, evidencia }) => <div key={key}>
      <label className="label" htmlFor={key}>{label}</label>
      {Boolean(evidencia?.observacion) && <p className="text-sm text-red-700">{String(evidencia?.observacion)}</p>}
      <input id={key} type="file" accept="image/*,.pdf" className="input" disabled={guardando} onChange={(event) => {
        const archivo = event.target.files?.[0];
        setArchivos((prev) => {
          const siguientes = { ...prev };
          if (archivo) siguientes[key] = archivo;
          else delete siguientes[key];
          return siguientes;
        });
      }} />
    </div>)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end"><button className="btn-green" disabled={guardando} onClick={guardar}>{guardando ? "Enviando…" : "Enviar a revisión"}</button></div>
  </div>;
}
