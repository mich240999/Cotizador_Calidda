/**
 * lib/financiamiento.ts — Matemática financiera Ambientes Cáliddos.
 *
 * Fórmula usada (cuota fija / sistema francés CON IGV del interés):
 *   TEM      = (1 + TEA)^(1/12) − 1     (TEA en decimal, ej. 40% = 0.40)
 *   TEM_IGV  = TEM × (1 + IGV)           (IGV del interés, por defecto 18%)
 *   cuota    = capital · TEM_IGV·(1+TEM_IGV)^n / ((1+TEM_IGV)^n − 1)
 * Redondeo a 2 decimales (medio punto hacia arriba).
 *
 * El IGV grava solo el componente de interés de cada cuota; a cuota fija
 * constante esto equivale a calcular el sistema francés con la tasa
 * efectiva mensual recargada TEM×(1+IGV).
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

/** TEM recargada con el IGV del interés: TEM × (1 + IGV). */
export function temConIgv(tea: number, igv = IGV_INTERES): number {
  return temDesdeTea(tea) * (1 + igv);
}

/** Cuota fija mensual CON IGV del interés incluido, redondeada a 2 decimales. */
export function cuotaFrancesaConIgv(capital: number, tea: number, n: number, igv = IGV_INTERES): number {
  if (!Number.isFinite(capital) || capital <= 0) throw new Error("capital debe ser > 0");
  if (!Number.isInteger(n) || n <= 0 || n > 360) throw new Error("n debe ser entero 1..360");
  const temIgv = temConIgv(tea, igv);
  if (temIgv <= 0) return redondeo2(capital / n);
  const pot = Math.pow(1 + temIgv, n);
  return redondeo2((capital * temIgv * pot) / (pot - 1));
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
  const tem = conIgv ? temConIgv(tea) : temDesdeTea(tea);
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
