/**
 * lib/financiamiento.ts — Matemática financiera Ambientes Cáliddos.
 *
 * Fórmula del archivo Simulador_CuotasAMCA.xlsx:
 *   TEM   = (1 + TEA)^(1/12) − 1
 *   cuota = PMT(TEM, n, -capital) + IGV × TEM × capital
 * El interés/IGV se usa para calcular el pago periódico, no se agrega al
 * precio de la cotización ni al monto financiado de la venta.
 */

export const PLAZOS_SIMULACION = [3, 6, 9, 12, 18, 24, 36, 48, 60] as const;

/** IGV que grava el interés del financiamiento (Perú 18%). */
export const IGV_INTERES = 0.18;

export function redondeo2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Tasa Efectiva Mensual a partir de la TEA (decimal). */
export function temDesdeTea(tea: number): number {
  if (!Number.isFinite(tea) || tea < 0 || tea > 10) {
    throw new Error("TEA inválida (decimal 0..10, ej. 0.40 para 40%)");
  }
  return Math.pow(1 + tea, 1 / 12) - 1;
}

/** Cuota fija mensual (sistema francés), redondeada a 2 decimales. */
export function cuotaFrancesa(capital: number, tea: number, n: number): number {
  if (!Number.isFinite(capital) || capital <= 0) throw new Error("capital debe ser > 0");
  if (!Number.isInteger(n) || n <= 0 || n > 360) throw new Error("n debe ser entero 1..360");
  const tem = temDesdeTea(tea);
  if (tem === 0) return redondeo2(capital / n);
  const pot = Math.pow(1 + tem, n);
  return redondeo2((capital * tem * pot) / (pot - 1));
}

/** Tasa mensual recargada (solo para compatibilidad con respuestas antiguas). */
export function temConIgv(tea: number, igv = IGV_INTERES): number {
  return temDesdeTea(tea) * (1 + igv);
}

/** PMT francés mensual más 18% del interés mensual sobre el capital original. */
export function cuotaFrancesaConIgv(capital: number, tea: number, n: number, igv = IGV_INTERES): number {
  if (!Number.isFinite(capital) || capital <= 0) throw new Error("capital debe ser > 0");
  if (!Number.isInteger(n) || n <= 0 || n > 360) throw new Error("n debe ser entero 1..360");
  const tem = temDesdeTea(tea);
  const pmt = tem === 0
    ? capital / n
    : (capital * tem) / (1 - Math.pow(1 + tem, -n));
  return redondeo2(pmt + igv * tem * capital);
}

export interface FilaSimulacion {
  plazo: number;
  tem: number;
  cuota: number;
}

/** Tabla de simulación para los plazos dados (defecto 3..60).
 *  Por defecto incluye el IGV del interés en la cuota (conIgv = true).
 */
export function tablaSimulacion(
  capital: number,
  tea: number,
  plazos: readonly number[] = PLAZOS_SIMULACION,
  conIgv = true
): FilaSimulacion[] {
  // El libro reporta TEM antes del recargo de IGV, que se agrega como término
  // aparte al PMT (no multiplicando la tasa dentro de la amortización).
  const tem = temDesdeTea(tea);
  const fn = conIgv ? cuotaFrancesaConIgv : cuotaFrancesa;
  return plazos.map((plazo) => ({
    plazo,
    tem: redondeo2(tem * 100) / 100, // TEM decimal redondeada a 4 cifras reales
    cuota: cuotaFrancesaSegura(fn, capital, tea, plazo)
  }));
}

function cuotaFrancesaSegura(
  fn: (capital: number, tea: number, n: number) => number,
  capital: number,
  tea: number,
  plazo: number
): number {
  try {
    if (!(capital > 0)) return 0;
    return fn(capital, tea, plazo);
  } catch {
    return 0;
  }
}
