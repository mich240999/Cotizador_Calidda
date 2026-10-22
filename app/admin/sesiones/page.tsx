"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion } from "@/components/Tablas";

type Config = {
  duracionMin: number;
  inactividadMin: number;
  recordarDias: number;
  unaSesion: boolean;
};

type Sesion = {
  id: string;
  user_id: string;
  usuario: string | null;
  email: string | null;
  user_agent: string | null;
  ip: string | null;
  origen: string | null;
  ultima_actividad: string;
  created_at: string;
  expira_en: string | null;
  recordarme?: boolean | null;
};

type Respuesta = {
  config: Config;
  sesiones: Sesion[];
  total: number;
  necesitaMigracion?: boolean;
};

const CONFIG_INICIAL: Config = {
  duracionMin: 480,
  inactividadMin: 30,
  recordarDias: 180,
  unaSesion: true,
};

function fechaLegible(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  });
}

function equipoDe(ua: string | null): string {
  if (!ua) return "Equipo desconocido";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  if (/okhttp|Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  return ua.slice(0, 36);
}

function horasDe(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "";
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

export default function SesionesPage() {
  const [config, setConfig] = useState<Config>(CONFIG_INICIAL);
  const [duracion, setDuracion] = useState(String(CONFIG_INICIAL.duracionMin));
  const [inactividad, setInactividad] = useState(String(CONFIG_INICIAL.inactividadMin));
  const [recordar, setRecordar] = useState(String(CONFIG_INICIAL.recordarDias));
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [necesitaMigracion, setNecesitaMigracion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const aplicarConfig = useCallback((c: Config) => {
    setConfig(c);
    setDuracion(String(c.duracionMin));
    setInactividad(String(c.inactividadMin));
    setRecordar(String(c.recordarDias));
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiOperacion<Respuesta>("cfgSesionesListar", {});
      if (r?.config) aplicarConfig(r.config);
      setSesiones(Array.isArray(r?.sesiones) ? r.sesiones : []);
      setNecesitaMigracion(!!r?.necesitaMigracion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las sesiones");
    } finally {
      setLoading(false);
    }
  }, [aplicarConfig]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!duracion.trim() || !inactividad.trim() || !recordar.trim()) {
      setError("Completa los tres tiempos de sesión.");
      return;
    }
    setGuardando(true);
    setError(null);
    setOk(null);
    try {
      const r = await apiOperacion<{ config: Config }>("cfgSesionesGuardar", {
        duracionMin: campo(Number(duracion), 5, 10080),
        inactividadMin: campo(Number(inactividad), 1, 1440),
        recordarDias: campo(Number(recordar), 1, 365),
        unaSesion: config.unaSesion,
      });
      if (r?.config) aplicarConfig(r.config);
      setNecesitaMigracion(false);
      setOk("Configuración guardada. Aplica a las sesiones nuevas y a la validación de las existentes.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const cerrar = async (s: Sesion) => {
    const nombre = s.usuario || s.email || "este equipo";
    if (!window.confirm(`¿Cerrar la sesión de ${nombre}?`)) return;
    setError(null);
    setOk(null);
    try {
      await apiOperacion("cerrarSesionActiva", { id: s.id });
      setOk("Sesión cerrada.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar la sesión");
    }
  };

  const campo = (valor: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Number.isFinite(valor) ? Math.round(valor) : min));

  return (
    <AuthGate>
      <Shell>
        <ModHead
          eyebrow="CONSOLA ADMINISTRATIVA"
          title="Sesiones"
          desc="Tiempos de sesión predeterminados y equipos conectados. Los cambios se aplican al iniciar sesión y al validar sesiones existentes."
        />

        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-500">Sesión normal</p>
            <p className="text-2xl font-extrabold text-[#0099D8] mt-1">{horasDe(config.duracionMin)}</p>
            <p className="text-[11px] text-slate-400 mt-1">Máximo sin “Recuérdame”.</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-500">Inactividad</p>
            <p className="text-2xl font-extrabold text-[#0099D8] mt-1">{config.inactividadMin} min</p>
            <p className="text-[11px] text-slate-400 mt-1">Sin actividad se cierra sola.</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-500">Equipos conectados</p>
            <p className="text-2xl font-extrabold text-[#0099D8] mt-1">{sesiones.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">Sesiones activas ahora.</p>
          </div>
        </div>

        <div className="card p-5 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold">Tiempos predeterminados</h2>
              <p className="text-xs text-slate-400 mt-1">Valores globales para todas las cuentas.</p>
            </div>
            <span className={`text-[11px] font-bold rounded-lg px-2 py-1 ${config.unaSesion ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {config.unaSesion ? "UNA SESIÓN POR USUARIO" : "MÚLTIPLES SESIONES"}
            </span>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="label">Duración de sesión normal (minutos)</label>
              <input
                type="number"
                min={5}
                max={10080}
                className="input"
                value={duracion}
                onChange={(e) => setDuracion(e.target.value)}
              />
              <p className="text-[11px] text-slate-400 mt-1">480 = 8 horas. Rango: 5 min a 7 días.</p>
            </div>
            <div>
              <label className="label">Cierre por inactividad (minutos)</label>
              <input
                type="number"
                min={1}
                max={1440}
                className="input"
                value={inactividad}
                onChange={(e) => setInactividad(e.target.value)}
              />
              <p className="text-[11px] text-slate-400 mt-1">30 = media hora sin actividad. Rango: 1 min a 24 h.</p>
            </div>
            <div>
              <label className="label">Duración con “Recuérdame” (días)</label>
              <input
                type="number"
                min={1}
                max={365}
                className="input"
                value={recordar}
                onChange={(e) => setRecordar(e.target.value)}
              />
              <p className="text-[11px] text-slate-400 mt-1">180 = 6 meses. Rango: 1 a 365 días.</p>
            </div>
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#0077B6]"
              checked={config.unaSesion}
              onChange={(e) => setConfig({ ...config, unaSesion: e.target.checked })}
            />
            <span>
              Permitir solo una sesión activa por usuario
              <span className="block text-[11px] font-normal text-slate-400">
                Si la cuenta ya está abierta en otro equipo, se pedirá mantener esa sesión o cerrarla para entrar aquí.
              </span>
            </span>
          </label>

          {error && <p className="mt-4 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{error}</p>}
          {ok && <p className="mt-4 text-sm rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2">{ok}</p>}
          {necesitaMigracion && (
            <p className="mt-4 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
              Falta la tabla <b>cfg_sesiones</b> y las columnas de vencimiento. Ejecuta{" "}
              <b>supabase/migracion_sesiones_01.sql</b> en el SQL Editor de Supabase para guardar estos valores.
            </p>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-white !text-[#0099D8]" onClick={cargar} disabled={loading || guardando}>
              Actualizar
            </button>
            <button className="btn-green" onClick={guardar} disabled={guardando || loading}>
              {guardando ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        </div>

        <div className="card p-5 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold">Equipos conectados</h2>
              <p className="text-xs text-slate-400 mt-1">Sesiones activas dentro del tiempo de inactividad configurado.</p>
            </div>
            <button className="btn-white !text-[#0099D8]" onClick={cargar} disabled={loading}>
              Actualizar
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500 mt-4">Cargando…</p>
          ) : sesiones.length === 0 ? (
            <p className="text-sm text-slate-500 mt-4">No hay sesiones activas.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
                    <th className="py-2 pr-4">Usuario</th>
                    <th className="py-2 pr-4">Equipo</th>
                    <th className="py-2 pr-4">Última actividad</th>
                    <th className="py-2 pr-4">Inicio</th>
                    <th className="py-2 pr-4">Vence</th>
                    <th className="py-2 pr-4">Recordar</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sesiones.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-4">
                        <p className="font-semibold">{s.usuario || "Sin ficha"}</p>
                        <p className="text-xs text-slate-400">{s.email || s.user_id}</p>
                      </td>
                      <td className="py-2.5 pr-4">
                        <p>{equipoDe(s.user_agent)}</p>
                        <p className="text-xs text-slate-400">{s.ip || "IP no registrada"}</p>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{fechaLegible(s.ultima_actividad)}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{fechaLegible(s.created_at)}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{fechaLegible(s.expira_en)}</td>
                      <td className="py-2.5 pr-4">{s.recordarme ? "Sí" : "No"}</td>
                      <td className="py-2.5 text-right">
                        <button
                          className="text-xs font-bold text-red-600 hover:text-red-700"
                          onClick={() => cerrar(s)}
                        >
                          Cerrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Shell>
    </AuthGate>
  );
}
