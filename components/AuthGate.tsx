"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import LogoCalidda from "./LogoCalidda";

/**
 * AuthGate — Ambientes Cálidos
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

/** Asterisco de 8 puntas (marca) en blanco. */
function Asterisco({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" className={className}>
      <line x1="50" y1="8" x2="50" y2="92" />
      <line x1="8" y1="50" x2="92" y2="50" />
      <line x1="20" y1="20" x2="80" y2="80" />
      <line x1="80" y1="20" x2="20" y2="80" />
    </svg>
  );
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
      <div className="min-h-screen flex items-center justify-center bg-[#0B5FA5]">
        <div className="flex items-center gap-3 text-white">
          <span className="h-8 w-8 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
          <span className="text-sm font-semibold">Verificando sesión…</span>
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row bg-white">
        {/* Izquierda: panel marca azul profundo */}
        <div className="relative overflow-hidden lg:w-[46%] bg-gradient-to-br from-[#0B5FA5] via-[#0088C7] to-[#00A9CE] text-white flex flex-col justify-between p-10 lg:p-16 min-h-[420px]">
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]" viewBox="0 0 600 800" fill="none" stroke="white" strokeWidth="1.5" preserveAspectRatio="xMidYMid slice">
            <path d="M-40 140 C 160 200, 300 320, 380 560" />
            <path d="M-40 190 C 170 250, 320 370, 410 610" />
            <path d="M-40 240 C 180 300, 340 420, 440 660" />
            <path d="M-40 290 C 190 350, 360 470, 470 710" />
            <path d="M-40 340 C 200 400, 380 520, 500 760" />
          </svg>
          <div className="relative">
            <Asterisco className="h-20 w-20 text-white" />
            <h2 className="mt-10 text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight">
              Hola,<br />Ambientes<br />Cálidos!
            </h2>
            <p className="mt-8 text-white/85 text-base leading-relaxed max-w-sm">
              Cotizaciones, clientes y gestión comercial en un solo lugar.
              Cotiza más rápido, simula financiamiento y cierra más ventas.
            </p>
          </div>
          <p className="relative mt-10 text-sm text-white/60">© 2026 Ambientes Cálidos. Todos los derechos reservados.</p>
        </div>

        {/* Derecha: acceso */}
        <div className="flex-1 flex items-center justify-center p-8 lg:p-16 bg-white">
          <div className="w-full max-w-sm">
            <div className="flex items-center gap-3">
              <LogoCalidda className="h-11 w-auto" />
              <span className="text-2xl font-extrabold text-black tracking-tight">Ambientes Cálidos</span>
            </div>

            <h1 className="mt-12 text-3xl font-extrabold text-black tracking-tight">
              {vista === "login" ? "¡Bienvenido de nuevo!" : "Recupera tu acceso"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {vista === "login" ? (
                <>Ingresa con tu <u className="font-semibold text-slate-700">cuenta autorizada</u>, es rápido y seguro.</>
              ) : (
                "Te enviaremos un enlace para crear una nueva contraseña."
              )}
            </p>

            <div className="mt-8 space-y-7">
              <div>
                <input
                  type="email"
                  autoComplete="email"
                  className="w-full border-0 border-b-2 border-slate-200 bg-transparent px-0 py-2.5 text-[15px] font-semibold text-black placeholder:font-normal placeholder:text-slate-400 focus:border-black focus:outline-none focus:ring-0"
                  placeholder="tucorreo@empresa.com"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (vista === "login" ? ingresar() : recuperar())}
                />
              </div>
              {vista === "login" && (
                <div className="relative">
                  <input
                    type={verClave ? "text" : "password"}
                    autoComplete="current-password"
                    className="w-full border-0 border-b-2 border-slate-200 bg-transparent px-0 py-2.5 pr-10 text-[15px] text-black placeholder:text-slate-400 focus:border-black focus:outline-none focus:ring-0"
                    placeholder="Password"
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && ingresar()}
                  />
                  <button
                    type="button"
                    onClick={() => setVerClave((v) => !v)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black text-base"
                    title={verClave ? "Ocultar" : "Mostrar"}
                  >
                    {verClave ? "◠" : "👁"}
                  </button>
                </div>
              )}
              {vista === "login" ? (
                <button
                  className="w-full rounded-xl bg-[#0077B6] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#005B96] active:bg-[#004E89] disabled:opacity-60"
                  onClick={ingresar}
                  disabled={busy}
                >
                  {busy ? "Ingresando…" : "Ingresar ahora"}
                </button>
              ) : (
                <button
                  className="w-full rounded-xl bg-[#0077B6] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#005B96] active:bg-[#004E89] disabled:opacity-60"
                  onClick={recuperar}
                  disabled={busy}
                >
                  {busy ? "Enviando…" : "Enviar enlace"}
                </button>
              )}
            </div>

            {error && (
              <p className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</p>
            )}
            {aviso && (
              <p className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2.5">{aviso}</p>
            )}

            <p className="mt-8 text-center text-sm text-slate-500">
              {vista === "login" ? (
                <>¿Olvidaste tu contraseña? <button className="font-bold text-black underline underline-offset-2 hover:no-underline" onClick={() => { setVista("recuperar"); setError(null); setAviso(null); }}>Clic aquí</button></>
              ) : (
                <button className="font-bold text-black underline underline-offset-2 hover:no-underline" onClick={() => { setVista("login"); setError(null); setAviso(null); }}>← Volver a iniciar sesión</button>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
