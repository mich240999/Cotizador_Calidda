/**
 * lib/detallesMueble.ts — Detalles del mueble de la cotización.
 *
 * Los 6 campos (marca de melamina, colores, tiradores, vidrios) son
 * obligatorios al crear la cotización. Se guardan como bloque de texto
 * estructurado al inicio de `observaciones` (sin columnas nuevas en BD):
 *
 *   [DETALLES DEL MUEBLE]
 *   Marca de Melamina: ...
 *   ...
 *   [FIN DETALLES]
 *
 *   <observaciones libres>
 */

export interface DetalleMueble {
  marca_melamina: string;
  color_estructura: string;
  color_puertas: string;
  color_tablero: string;
  tiradores: string;
  vidrios: string;
}

export const DETALLES_LABELS: { clave: keyof DetalleMueble; etiqueta: string }[] = [
  { clave: "marca_melamina", etiqueta: "Marca de Melamina" },
  { clave: "color_estructura", etiqueta: "Color estructura de mueble" },
  { clave: "color_puertas", etiqueta: "Color de Puertas" },
  { clave: "color_tablero", etiqueta: "Color Tablero" },
  { clave: "tiradores", etiqueta: "Tiradores" },
  { clave: "vidrios", etiqueta: "Vidrios" },
];

const INICIO = "[DETALLES DEL MUEBLE]";
const FIN = "[FIN DETALLES]";

/** Compón el bloque de detalles antepuesto a las observaciones libres. */
export function componerObservaciones(detalles: DetalleMueble, observaciones: string): string {
  const lineas = DETALLES_LABELS.map(
    ({ clave, etiqueta }) => `${etiqueta}: ${String(detalles[clave] ?? "").trim()}`
  );
  const bloque = `${INICIO}\n${lineas.join("\n")}\n${FIN}`;
  const libre = String(observaciones ?? "").trim();
  return libre ? `${bloque}\n\n${libre}` : bloque;
}

/** Extrae el bloque de detalles; `resto` trae las observaciones libres. */
export function extraerDetalles(obs: string | null | undefined): {
  detalles: { etiqueta: string; valor: string }[];
  resto: string;
} {
  const texto = String(obs ?? "");
  const i0 = texto.indexOf(INICIO);
  const i1 = texto.indexOf(FIN);
  if (i0 < 0 || i1 < 0 || i1 < i0) return { detalles: [], resto: texto.trim() };
  const cuerpo = texto.slice(i0 + INICIO.length, i1);
  const valores = new Map<string, string>();
  for (const ln of cuerpo.split("\n")) {
    const m = ln.match(/^([^:]+):\s*(.*)$/);
    if (m) valores.set(m[1].trim(), m[2].trim());
  }
  const detalles = DETALLES_LABELS.map(({ etiqueta }) => ({
    etiqueta,
    valor: valores.get(etiqueta) ?? "",
  })).filter((d) => d.valor !== "");
  const resto = (texto.slice(0, i0) + texto.slice(i1 + FIN.length)).trim();
  return { detalles, resto };
}
