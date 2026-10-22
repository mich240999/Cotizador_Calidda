import type { SupabaseClient } from "@supabase/supabase-js";

export const CLAVE_CORREO_COTIZACION = "cotizacion_pdf";

export const ASUNTO_COTIZACION_DEFAULT = "Cotización {codigo} Ambientes Cáliddos";

export const MENSAJE_COTIZACION_DEFAULT = [
  "Estimado(a) {cliente}:",
  "",
  "Adjuntamos su cotización {codigo} de Ambientes Cáliddos por un total de S/ {total}.",
  "",
  "Financiamiento: adelanto S/ {adelanto}, valor a financiar S/ {capital}, TEA {tea}%, {plazo} cuotas de S/ {cuota} (cuota con IGV del interés incluido).",
  "",
  "{detalles}",
  "",
  "{observaciones}",
  "",
  "Documento generado por Ambientes Cáliddos."
].join("\n");

export type ConfigCorreoCotizacion = {
  asunto: string;
  mensaje: string;
};

export type LecturaConfigCorreoCotizacion = {
  config: ConfigCorreoCotizacion;
  necesitaMigracion: boolean;
};

export function interpolarPlantilla(tpl: string, vars: Record<string, string | number>): string {
  return String(tpl ?? "").replace(/\{([a-zA-Z0-9_]+)\}/g, (original, clave: string) =>
    Object.prototype.hasOwnProperty.call(vars, clave) ? String(vars[clave]) : original
  );
}

function tablaFaltante(error: { code?: string; message?: string }): boolean {
  return /42P01|does not exist|Could not find the table|no existe/i.test(`${error.code ?? ""} ${error.message ?? ""}`);
}

export async function obtenerConfigCorreoCotizacion(
  service: SupabaseClient
): Promise<LecturaConfigCorreoCotizacion> {
  const { data, error } = await service
    .from("cfg_correos")
    .select("asunto,mensaje")
    .eq("clave", CLAVE_CORREO_COTIZACION)
    .maybeSingle();

  if (error) {
    if (tablaFaltante(error)) {
      return {
        config: { asunto: ASUNTO_COTIZACION_DEFAULT, mensaje: MENSAJE_COTIZACION_DEFAULT },
        necesitaMigracion: true
      };
    }
    throw new Error(error.message);
  }

  const fila = data as { asunto?: string | null; mensaje?: string | null } | null;
  return {
    config: {
      asunto: fila?.asunto?.trim() || ASUNTO_COTIZACION_DEFAULT,
      mensaje: fila?.mensaje?.trim() || MENSAJE_COTIZACION_DEFAULT
    },
    necesitaMigracion: false
  };
}
