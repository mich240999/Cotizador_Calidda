"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import LogoCalidda from "./LogoCalidda";

/**
 * AuthGate — Cálidda Soluciones Hogar
 * Auth email + contraseña de Supabase (sin OAuth).
 * - Login: signInWithPassword
 * - Recuperación: resetPasswordForEmail -> link a /auth/callback?next=/actualizar-password
 * - Heartbeat de sesión cada 120s + visibilitychange.
 */

async function heartbeat() {
  try {
    await fetch("/api/cron/heartbeat", { method: "GET", keepalive: true });
  } catch {}
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [vista, setVista] = useState<"login" | "recuperar">("login");
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setEmail(data.session?.user?.email ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setEmail(sess?.user?.email ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!email) return;
    heartbeat();
    const id = setInterval(heartbeat, 120_000);
    const onVis = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [email]);

  const ingresar = useCallback(async () => {
    setError(null);
    setAviso(null);
    if (!correo.trim() || !clave) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: correo.trim().toLowerCase(),
        password: clave,
      });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }, [supabase, correo, clave]);

  const recuperar = useCallback(async () => {
    setError(null);
    setAviso(null);
    if (!correo.trim()) {
      setError("Ingresa tu correo para enviarte el enlace de recuperación.");
      return;
    }
    setBusy(true);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=/actualizar-password`
          : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(correo.trim().toLowerCase(), {
        redirectTo,
      });
      if (error) throw error;
      setAviso("Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo (y spam).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el correo");
    } finally {
      setBusy(false);
    }
  }, [supabase, correo]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0077B6] via-[#0099D8] to-[#00B4A2]">
        <div className="flex items-center gap-3 text-white">
          <span className="h-8 w-8 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
          <span className="text-sm font-semibold">Verificando sesión…</span>
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Izquierda: panel marca con gradiente */}
        <div className="relative overflow-hidden lg:w-[46%] bg-gradient-to-br from-[#006494] via-[#0099D8] to-[#00B4A2] text-white flex flex-col justify-between p-8 lg:p-12 min-h-[340px]">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute bottom-16 right-10 h-24 w-24 rounded-full border border-white/20" />
          <div className="relative">
            <div className="inline-flex items-center gap-3 rounded-2xl bg-white px-5 py-3 shadow-lg">
              <LogoCalidda className="h-11 w-auto" />
            </div>
            <p className="mt-10 text-xs font-bold tracking-[0.25em] text-white/80">
              PLATAFORMA COMERCIAL
            </p>
            <h2 className="mt-2 text-4xl lg:text-5xl font-extrabold leading-tight">Soluciones<br />Hogar</h2>
            <p className="mt-4 text-white/85 text-sm leading-relaxed max-w-sm">
              Cotizaciones, clientes y gestión comercial en un solo lugar.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-white/90">
              {["Cotiza materiales con tarifa vigente", "Simula financiamiento con TEA", "Sigue tus ventas hasta el cierre"].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs font-bold">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mt-10 flex items-center justify-between text-[11px] text-white/60">
            <span>Versión 1.0.0</span>
            <span>Gas Natural del Perú</span>
          </div>
        </div>

        {/* Derecha: tarjeta de acceso */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-[#F4F7FA] relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -left-20 h-64 w-64 rounded-full bg-[#0099D8]/5" />
          <div className="relative w-full max-w-md rounded-3xl bg-white p-8 shadow-xl shadow-slate-200/70 border border-slate-100">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              ACCESO SEGURO
            </span>
            <h1 className="mt-4 text-3xl font-extrabold text-slate-900 tracking-tight">
              {vista === "login" ? "Inicia sesión" : "Recupera tu acceso"}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {vista === "login"
                ? "Selecciona tu cuenta autorizada para ingresar."
                : "Te enviaremos un enlace para crear una nueva contraseña."}
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="auth-email">Correo electrónico</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">✉</span>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    className="input !pl-10"
                    placeholder="usuario@empresa.com"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (vista === "login" ? ingresar() : recuperar())}
                  />
                </div>
              </div>
              {vista === "login" && (
                <div>
                  <label className="label" htmlFor="auth-pass">Contraseña</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">🔒</span>
                    <input
                      id="auth-pass"
                      type={verClave ? "text" : "password"}
                      autoComplete="current-password"
                      className="input !pl-10 !pr-12"
                      placeholder="••••••••"
                      value={clave}
                      onChange={(e) => setClave(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && ingresar()}
                    />
                    <button
                      type="button"
                      onClick={() => setVerClave((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm"
                      title={verClave ? "Ocultar" : "Mostrar"}
                    >
                      {verClave ? "◠" : "👁"}
                    </button>
                  </div>
                </div>
              )}
              {vista === "login" ? (
                <button
                  className="btn-green w-full !py-3 !rounded-2xl !text-base shadow-lg shadow-emerald-600/20 hover:-translate-y-px active:translate-y-0 transition-transform disabled:transform-none"
                  onClick={ingresar}
                  disabled={busy}
                >
                  {busy ? "Ingresando…" : "Iniciar sesión →"}
                </button>
              ) : (
                <button
                  className="btn-green w-full !py-3 !rounded-2xl !text-base shadow-lg shadow-emerald-600/20 hover:-translate-y-px active:translate-y-0 transition-transform disabled:transform-none"
                  onClick={recuperar}
                  disabled={busy}
                >
                  {busy ? "Enviando…" : "Enviar enlace de recuperación"}
                </button>
              )}
              <button
                className="w-full text-sm font-semibold text-[#0099D8] hover:underline"
                onClick={() => {
                  setVista(vista === "login" ? "recuperar" : "login");
                  setError(null);
                  setAviso(null);
                }}
              >
                {vista === "login" ? "¿Olvidaste tu contraseña?" : "← Volver a iniciar sesión"}
              </button>
            </div>
            {error && (
              <p className="mt-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</p>
            )}
            {aviso && (
              <p className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2.5">{aviso}</p>
            )}
            <p className="mt-6 text-center text-[11px] text-slate-400">
              Solo podrán continuar las cuentas activas registradas en Soluciones Hogar · v1.0.0
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
