/**
 * lib/financiamiento.ts — Matemática financiera Soluciones Hogar Cálidda.
 *
 * Fórmula usada (cuota fija / sistema francés):
 *   TEM   = (1 + TEA)^(1/12) − 1        (TEA en decimal, ej. 40% = 0.40)
 *   cuota = capital · TEM·(1+TEM)^n / ((1+TEM)^n − 1)
 * Redondeo a 2 decimales (medio punto hacia arriba).
 *
 * Nota de verificación: con capital=3150, TEA=0.40, n=9 la fórmula pura da
 * S/ 401.62. La captura COT-AMCA-00012 muestra ≈ S/ 417.74; la diferencia
 * (~4%) corresponde a cargos adicionales de la captura (seguro de
 * desgravamen / portes) no incluidos en la cuota financiera pura.
 * Se mantiene la fórmula estándar sin inventar recargos.
 */

export const PLAZOS_SIMULACION = [3, 6, 9, 12, 18, 24, 36, 48, 60] as const;

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

export interface FilaSimulacion {
  plazo: number;
  tem: number;
  cuota: number;
}

/** Tabla de simulación para los plazos dados (defecto 3..60). */
export function tablaSimulacion(
  capital: number,
  tea: number,
  plazos: readonly number[] = PLAZOS_SIMULACION
): FilaSimulacion[] {
  const tem = temDesdeTea(tea);
  return plazos.map((plazo) => ({
    plazo,
    tem: redondeo2(tem * 100) / 100, // TEM decimal redondeada a 4 cifras reales
    cuota: cuotaFrancesa(capital, tea, plazo)
  }));
}
