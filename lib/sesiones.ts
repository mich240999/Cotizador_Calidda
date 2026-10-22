import { createHash, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ConfigSesiones = {
  duracionMin: number;
  inactividadMin: number;
  recordarDias: number;
  unaSesion: boolean;
};

export const CONFIG_SESIONES_DEFAULT: ConfigSesiones = {
  duracionMin: 480,
  inactividadMin: 30,
  recordarDias: 180,
  unaSesion: true
};

export type SesionApp = {
  id: string;
  user_id: string;
  user_agent: string | null;
  ip?: string | null;
  origen: string | null;
  ultima_actividad: string;
  created_at: string;
  expira_en?: string | null;
  recordarme?: boolean | null;
  activa?: boolean | null;
};

const MS_MIN = 60_000;
const MS_DIA = 86_400_000;

export function esTablaFaltante(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message
      : String((e as { message?: unknown } | null)?.message ?? e ?? "");
  return /could not find the table|could not find the .*column|does not exist|schema cache|42P01|42703|PGRST204/i.test(
    msg
  );
}

function numero(v: unknown, porDefecto: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function normalizarConfig(row: Record<string, unknown> | null | undefined): ConfigSesiones {
  return {
    duracionMin: numero(row?.duracion_min, CONFIG_SESIONES_DEFAULT.duracionMin, 5, 10080),
    inactividadMin: numero(row?.inactividad_min, CONFIG_SESIONES_DEFAULT.inactividadMin, 1, 1440),
    recordarDias: numero(row?.recordar_dias, CONFIG_SESIONES_DEFAULT.recordarDias, 1, 365),
    unaSesion: row?.una_sesion === undefined ? CONFIG_SESIONES_DEFAULT.unaSesion : row.una_sesion !== false
  };
}

export async function leerConfigSesiones(
  service: SupabaseClient
): Promise<{ config: ConfigSesiones; necesitaMigracion: boolean }> {
  try {
    const { data, error } = await service
      .from("cfg_sesiones")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      if (esTablaFaltante(error)) {
        return { config: { ...CONFIG_SESIONES_DEFAULT }, necesitaMigracion: true };
      }
      throw error;
    }
    return {
      config: normalizarConfig(data as Record<string, unknown> | null),
      necesitaMigracion: false
    };
  } catch (e) {
    if (esTablaFaltante(e)) {
      return { config: { ...CONFIG_SESIONES_DEFAULT }, necesitaMigracion: true };
    }
    throw e;
  }
}

export function finSesion(sesion: SesionApp, config: ConfigSesiones): Date {
  if (sesion.expira_en) {
    const d = new Date(sesion.expira_en);
    if (Number.isFinite(d.getTime())) return d;
  }
  const inicio = Date.parse(sesion.created_at);
  if (!Number.isFinite(inicio)) return new Date(0);
  const base = sesion.recordarme ? config.recordarDias * MS_DIA : config.duracionMin * MS_MIN;
  return new Date(inicio + base);
}

export function sesionVigente(sesion: SesionApp, config: ConfigSesiones, ahora = Date.now()): boolean {
  if (!sesion || sesion.activa === false) return false;
  const actividad = Date.parse(sesion.ultima_actividad);
  if (!Number.isFinite(actividad) || actividad + config.inactividadMin * MS_MIN <= ahora) {
    return false;
  }
  return finSesion(sesion, config).getTime() > ahora;
}

export function expiracionDe(recordarme: boolean, config: ConfigSesiones, desde = new Date()): Date {
  const base = recordarme ? config.recordarDias * MS_DIA : config.duracionMin * MS_MIN;
  return new Date(desde.getTime() + base);
}

function hashSesion(id: string): string {
  return createHash("sha256").update(id, "utf8").digest("hex");
}

export async function crearSesionApp(
  service: SupabaseClient,
  datos: {
    userId: string;
    userAgent: string | null;
    ip: string | null;
    recordarme: boolean;
    config: ConfigSesiones;
  }
): Promise<{ id: string; expiraEn: string }> {
  const id = randomUUID();
  const ahora = new Date();
  const expira = expiracionDe(datos.recordarme, datos.config, ahora);
  const base = {
    id,
    user_id: datos.userId,
    token_hash: hashSesion(id),
    modulo: "auth",
    origen: "web",
    user_agent: datos.userAgent,
    ultima_actividad: ahora.toISOString(),
    activa: true
  };
  const completo = {
    ...base,
    ip: datos.ip,
    expira_en: expira.toISOString(),
    recordarme: datos.recordarme
  };

  let { error } = await service.from("sesiones_app").insert(completo);
  if (error && esTablaFaltante(error)) {
    ({ error } = await service.from("sesiones_app").insert(base));
  }
  if (error) throw error;

  return { id, expiraEn: expira.toISOString() };
}

const CAMPOS_SESION =
  "id,user_id,user_agent,ip,origen,ultima_actividad,created_at,expira_en,recordarme,activa";
const CAMPOS_SESION_BASE =
  "id,user_id,user_agent,origen,ultima_actividad,created_at,activa";

export async function listarSesionesActivas(
  service: SupabaseClient,
  userId: string,
  config: ConfigSesiones
): Promise<SesionApp[]> {
  let data: unknown = null;
  let error: unknown = null;
  ({ data, error } = await service
    .from("sesiones_app")
    .select(CAMPOS_SESION)
    .eq("user_id", userId)
    .eq("activa", true)
    .order("ultima_actividad", { ascending: false }));

  if (error && esTablaFaltante(error)) {
    ({ data, error } = await service
      .from("sesiones_app")
      .select(CAMPOS_SESION_BASE)
      .eq("user_id", userId)
      .eq("activa", true)
      .order("ultima_actividad", { ascending: false }));
  }
  if (error) {
    if (esTablaFaltante(error)) return [];
    throw error;
  }

  const filas = (data ?? []) as unknown as SesionApp[];
  const activas = filas.filter((s) => sesionVigente(s, config));
  const vencidas = filas.filter((s) => !sesionVigente(s, config)).map((s) => s.id);
  if (vencidas.length > 0) {
    try {
      await service.from("sesiones_app").update({ activa: false }).in("id", vencidas);
    } catch {
      /* limpieza best-effort */
    }
  }
  return activas;
}

export async function validarSesionApp(
  service: SupabaseClient,
  sesionId: string,
  userId: string,
  config: ConfigSesiones
): Promise<SesionApp | null> {
  let data: unknown = null;
  let error: unknown = null;
  ({ data, error } = await service
    .from("sesiones_app")
    .select(CAMPOS_SESION)
    .eq("id", sesionId)
    .eq("user_id", userId)
    .maybeSingle());

  if (error && esTablaFaltante(error)) {
    ({ data, error } = await service
      .from("sesiones_app")
      .select(CAMPOS_SESION_BASE)
      .eq("id", sesionId)
      .eq("user_id", userId)
      .maybeSingle());
  }
  if (error) {
    if (esTablaFaltante(error)) return null;
    throw error;
  }
  if (!data) return null;

  const sesion = data as unknown as SesionApp;
  if (!sesionVigente(sesion, config)) {
    await marcarSesionCerrada(service, sesionId, "expirada");
    return null;
  }
  return sesion;
}

export async function marcarSesionCerrada(
  service: SupabaseClient,
  sesionId: string,
  motivo: string
): Promise<void> {
  const completo = await service
    .from("sesiones_app")
    .update({
      activa: false,
      cerrada_motivo: motivo,
      cerrada_at: new Date().toISOString()
    })
    .eq("id", sesionId);
  if (!completo.error) return;
  if (!esTablaFaltante(completo.error)) return;
  await service.from("sesiones_app").update({ activa: false }).eq("id", sesionId);
}

export async function revocarOtrasSesiones(
  service: SupabaseClient,
  userId: string,
  exceptoId?: string
): Promise<number> {
  let consulta = service
    .from("sesiones_app")
    .update({
      activa: false,
      cerrada_motivo: "reemplazada",
      cerrada_at: new Date().toISOString()
    })
    .eq("user_id", userId)
    .eq("activa", true);
  if (exceptoId) consulta = consulta.neq("id", exceptoId);
  const { data, error } = await consulta.select("id");

  if (!error) return (data ?? []).length;
  if (!esTablaFaltante(error)) throw error;

  let respaldo = service
    .from("sesiones_app")
    .update({ activa: false })
    .eq("user_id", userId)
    .eq("activa", true);
  if (exceptoId) respaldo = respaldo.neq("id", exceptoId);
  const { data: datos } = await respaldo.select("id");
  return (datos ?? []).length;
}
