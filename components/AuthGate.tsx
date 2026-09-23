"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import LogoCalidda from "@/components/LogoCalidda";

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
      <div className="min-h-screen flex items-center justify-center bg-[#F4F7FA] text-slate-500 text-sm">
        Verificando sesión…
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row bg-white">
        {/* Izquierda: panel azul */}
        <div className="lg:w-[46%] bg-[#0099D8] text-white flex flex-col justify-between p-8 lg:p-12 min-h-[320px]">
          <div>
            <div className="flex items-center gap-2">
              <LogoCalidda className="h-10 w-auto" fallbackClassName="text-2xl text-white" />
            </div>
            <p className="mt-8 text-xs font-bold tracking-[0.2em] text-white/80">
              PLATAFORMA COMERCIAL
            </p>
            <h2 className="mt-2 text-4xl font-extrabold leading-tight">Soluciones Hogar</h2>
            <p className="mt-4 text-white/85 text-sm leading-relaxed max-w-sm">
              Gestiona clientes, cotizaciones y financiamiento de productos para el hogar
              de forma simple y segura. Cotiza, simula cuotas y haz seguimiento comercial
              en un solo lugar.
            </p>
          </div>
          <div className="mt-10 text-[11px] text-white/60">Versión 1.0.0</div>
        </div>

        {/* Derecha: login email + clave */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-white">
          <div className="w-full max-w-md">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ACCESO SEGURO
            </span>
            <h1 className="mt-4 text-3xl font-extrabold text-slate-900">
              {vista === "login" ? "Inicia sesión" : "Recupera tu contraseña"}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {vista === "login"
                ? "Ingresa con tu correo y contraseña registrados en Soluciones Hogar."
                : "Te enviaremos un enlace para crear una nueva contraseña."}
            </p>
            <div className="mt-6 space-y-3">
              <div>
                <label className="label" htmlFor="auth-email">Correo electrónico</label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  className="input"
                  placeholder="usuario@empresa.com"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (vista === "login" ? ingresar() : recuperar())}
                />
              </div>
              {vista === "login" && (
                <div>
                  <label className="label" htmlFor="auth-pass">Contraseña</label>
                  <input
                    id="auth-pass"
                    type="password"
                    autoComplete="current-password"
                    className="input"
                    placeholder="••••••••"
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && ingresar()}
                  />
                </div>
              )}
              {vista === "login" ? (
                <button className="btn-green w-full !py-3" onClick={ingresar} disabled={busy}>
                  {busy ? "Ingresando…" : "Iniciar sesión"}
                </button>
              ) : (
                <button className="btn-green w-full !py-3" onClick={recuperar} disabled={busy}>
                  {busy ? "Enviando…" : "Enviar enlace de recuperación"}
                </button>
              )}
              <button
                className="btn-white w-full !py-2.5 text-sm"
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
              <p className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</p>
            )}
            {aviso && (
              <p className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">{aviso}</p>
            )}
            <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-4 text-[11px] text-slate-500 leading-relaxed">
              <p className="font-bold text-slate-600 mb-1">Notas de seguridad</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Solo pueden ingresar cuentas activas registradas en Soluciones Hogar.</li>
                <li>El enlace de recuperación vence en 1 hora y es de un solo uso.</li>
                <li>Sesión supervisada con heartbeat cada 120 s.</li>
              </ul>
            </div>
            <p className="mt-6 text-center text-[11px] text-slate-400">Versión 1.0.0</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
