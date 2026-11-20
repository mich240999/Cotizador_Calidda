"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import LogoCalidda from "./LogoCalidda";

/**
 * AuthGate — Ambientes Cáliddos
 * Auth email + contraseña de Supabase (sin OAuth).
 * - Login: signInWithPassword
 * - Recuperación: resetPasswordForEmail -> link a /auth/callback?next=/actualizar-password
 * - Heartbeat de sesión cada 120s + visibilitychange.
 */

async function heartbeat(): Promise<boolean> {
  try {
    const res = await fetch("/api/sesion/heartbeat", { method: "POST", keepalive: true });
    return res.status !== 401;
  } catch {
    return true;
  }
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

/** Caché de sesión entre navegaciones: evita el flash "Verificando sesión"
 *  al remontar el AuthGate en cada página (muy visible en celular). */
let _emailCache: string | null | undefined;

type RespuestaLogin = {
  ok?: boolean;
  error?: string;
  codigo?: string;
  usuario?: { email?: string };
};

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseBrowser();
  const [loading, setLoading] = useState(_emailCache === undefined);
  const [email, setEmail] = useState<string | null>(_emailCache ?? null);
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [vista, setVista] = useState<"login" | "recuperar">("login");
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordarme, setRecordarme] = useState(true);
  const [conflicto, setConflicto] = useState(false);

  useEffect(() => {
    try {
      const temaOscuro = localStorage.getItem("sh-theme") === "dark";
      document.documentElement.classList.toggle("dark", temaOscuro);
      const guardado = localStorage.getItem("calidda_correo");
      if (guardado) setCorreo(guardado);
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    // Si el callback trajo ?error= (ej. enlace expirado), se muestra una vez.
    try {
      const q = new URLSearchParams(window.location.search);
      const e = q.get("error");
      if (e) {
        const amable = /expir|otp_expired|invalid/i.test(e)
          ? "El enlace expiró o ya se usó. Pide un correo de recuperación nuevo."
          : decodeURIComponent(e).replace(/\+/g, " ");
        setError(amable);
        setVista("recuperar");
        window.history.replaceState({}, "", window.location.pathname);
      }
      if (q.get("motivo") === "sesion_cerrada") {
        setError("Tu sesión se cerró porque se inició en otro equipo.");
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch { /* sin URL */ }
    // getUser valida la sesión contra el servidor (getSession solo lee local).
    // Si el token expiró/revocaron, se limpia y se muestra el login.
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!mounted) return;
        _emailCache = data.user?.email ?? null;
        setEmail(_emailCache);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, sess) => {
      if (evt === "SIGNED_OUT") {
        _emailCache = null;
        setEmail(null);
        return;
      }
      if (sess?.user?.email !== undefined) _emailCache = sess.user.email;
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
    let vivo = true;

    const latir = async () => {
      const ok = await heartbeat();
      if (ok || !vivo) return;
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch { /* sin red */ }
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch { /* la cookie ya no vale */ }
      _emailCache = null;
      setEmail(null);
      setAviso("Tu sesión se cerró porque se inició en otro equipo.");
    };

    latir();
    const id = setInterval(latir, 120_000);
    const onVis = () => {
      if (document.visibilityState === "visible") latir();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [email, supabase]);

  const ingresar = useCallback(async (cerrarOtras = false) => {
    setError(null);
    setAviso(null);
    if (!correo.trim() || !clave) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: correo.trim().toLowerCase(),
          password: clave,
          recordarme,
          cerrarOtras,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as RespuestaLogin;
      if (res.status === 409 && json?.codigo === "SESION_ACTIVA") {
        setConflicto(true);
        return;
      }
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "No se pudo iniciar sesión");
      }
      const emailFinal = json?.usuario?.email ?? correo.trim().toLowerCase();
      try {
        if (recordarme) localStorage.setItem("calidda_correo", emailFinal);
        else localStorage.removeItem("calidda_correo");
      } catch {
        /* almacenamiento no disponible */
      }
      // Sincroniza el cliente con las cookies recién emitidas por el servidor.
      await supabase.auth.getUser().catch(() => undefined);
      _emailCache = emailFinal;
      setEmail(emailFinal);
      setConflicto(false);
      setClave("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }, [supabase, correo, clave, recordarme]);

  const mantenerSesion = () => {
    setConflicto(false);
    setClave("");
    setAviso("Mantuvimos la sesión abierta en el otro equipo.");
  };

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
      <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-gradient-to-br from-[#0B5FA5] via-[#0088C7] to-[#00A9CE] transition-colors lg:h-[100dvh] lg:min-h-0 lg:flex-row lg:overflow-hidden lg:bg-white dark:lg:bg-slate-950">
        {/* Marca compacta en móvil: conserva identidad visual sin quitar espacio al formulario. */}
        <div className="relative flex min-h-[218px] shrink-0 flex-col justify-center overflow-hidden px-6 pb-14 pt-8 text-white sm:min-h-[245px] sm:px-10 lg:hidden">
          <div aria-hidden className="pointer-events-none absolute -right-14 -top-24 h-64 w-64 rounded-full border-[34px] border-white/10" />
          <div aria-hidden className="pointer-events-none absolute -bottom-36 -left-20 h-64 w-64 rounded-full bg-[#00A9CE]/35 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <Asterisco className="h-10 w-10 text-white drop-shadow-sm sm:h-12 sm:w-12" />
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-white/75">Cálidda · Ambientes</span>
          </div>
          <h2 className="relative mt-4 text-[1.8rem] font-extrabold leading-tight tracking-tight sm:mt-5 sm:text-4xl">
            Hola, Ambientes<br />Cáliddos
          </h2>
          <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-white/80 sm:text-base">
            Cotizaciones y gestión comercial, en un solo lugar.
          </p>
        </div>
        {/* Izquierda: panel marca azul profundo */}
        <div className="relative hidden h-full min-h-0 overflow-hidden lg:flex lg:w-[46%] bg-gradient-to-br from-[#0B5FA5] via-[#0088C7] to-[#00A9CE] text-white flex-col justify-between p-10 xl:p-16">
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]" viewBox="0 0 600 800" fill="none" stroke="white" strokeWidth="1.5" preserveAspectRatio="xMidYMid slice">
            <path d="M-40 140 C 160 200, 300 320, 380 560" />
            <path d="M-40 190 C 170 250, 320 370, 410 610" />
            <path d="M-40 240 C 180 300, 340 420, 440 660" />
            <path d="M-40 290 C 190 350, 360 470, 470 710" />
            <path d="M-40 340 C 200 400, 380 520, 500 760" />
          </svg>
          <div className="relative">
            <Asterisco className="h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20 text-white" />
            <h2 className="mt-6 lg:mt-6 xl:mt-10 text-4xl sm:text-5xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight">
              Hola,<br />Ambientes<br />Cáliddos!
            </h2>
            <p className="mt-4 lg:mt-6 xl:mt-8 text-white/85 text-sm sm:text-base leading-relaxed max-w-sm">
              Cotizaciones, clientes y gestión comercial en un solo lugar.
              Cotiza más rápido, simula financiamiento y cierra más ventas.
            </p>
          </div>
          <p className="relative mt-6 text-xs xl:mt-10 xl:text-sm text-white/60">© 2026 Cálidda. Todos los derechos reservados.</p>
        </div>

        {/* Derecha: acceso */}
        <div className="relative z-10 -mt-8 flex min-h-0 flex-1 items-start justify-center overflow-y-auto rounded-t-[2rem] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7 shadow-[0_-14px_40px_rgba(2,49,87,0.16)] dark:bg-slate-950 sm:mx-auto sm:w-full sm:max-w-lg sm:rounded-3xl sm:p-8 sm:shadow-2xl lg:mx-0 lg:mt-0 lg:max-w-none lg:items-center lg:overflow-hidden lg:rounded-none lg:p-10 lg:shadow-none xl:p-16">
          <div className="w-full max-w-sm py-2 sm:py-0">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <LogoCalidda className="h-9 sm:h-11 w-auto" />
              <span className="text-xl sm:text-2xl font-extrabold text-slate-950 dark:text-white tracking-tight">Ambientes Cáliddos</span>
            </div>

            <h1 className="mt-6 text-2xl sm:mt-8 sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
              {vista === "login" ? "¡Bienvenido de nuevo!" : "Recupera tu acceso"}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {vista === "login" ? (
                <>Ingresa con tu <u className="font-semibold text-slate-700 dark:text-slate-200">cuenta autorizada</u>, es rápido y seguro.</>
              ) : (
                "Te enviaremos un enlace para crear una nueva contraseña."
              )}
            </p>

            <div className="mt-6 space-y-5 sm:mt-8 sm:space-y-7">
              <div className="relative">
                <svg className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
                <input
                  type="email"
                  autoComplete="email"
                  className="w-full border-0 border-b-2 border-slate-200 bg-transparent pl-8 pr-0 py-2.5 text-[15px] font-semibold text-slate-950 placeholder:font-normal placeholder:text-slate-400 focus:border-[#0099D8] focus:outline-none focus:ring-0 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder="tucorreo@empresa.com"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (vista === "login" ? ingresar() : recuperar())}
                />
              </div>
              {vista === "login" && (
                <div className="relative">
                  <svg className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                  <input
                    type={verClave ? "text" : "password"}
                    autoComplete="current-password"
                    className="w-full border-0 border-b-2 border-slate-200 bg-transparent pl-8 pr-10 py-2.5 text-[15px] text-slate-950 placeholder:text-slate-400 focus:border-[#0099D8] focus:outline-none focus:ring-0 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder="Password"
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && ingresar()}
                  />
                  <button
                    type="button"
                    onClick={() => setVerClave((v) => !v)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#0077B6] transition hover:bg-sky-50 hover:text-[#005B96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0099D8] dark:text-sky-300 dark:hover:bg-slate-800 dark:hover:text-sky-200"
                    title={verClave ? "Ocultar" : "Mostrar"}
                    aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {verClave ? (
                        <>
                          <path d="M3 3 21 21" />
                          <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                          <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-3 3.8" />
                          <path d="M6.2 6.3C3.9 8 3 12 3 12s3.5 7 9 7a10 10 0 0 0 3-.5" />
                        </>
                      ) : (
                        <>
                          <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
                          <circle cx="12" cy="12" r="2.5" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              )}
              {vista === "login" && (
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={recordarme}
                    onChange={(e) => setRecordarme(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-[#0077B6]"
                  />
                  Recuérdame en este equipo
                </label>
              )}
              {vista === "login" ? (
                <button
                  className="w-full rounded-xl bg-[#0077B6] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#005B96] active:bg-[#004E89] disabled:opacity-60 dark:bg-sky-700 dark:hover:bg-sky-600 dark:active:bg-sky-800"
                  onClick={() => ingresar()}
                  disabled={busy}
                >
                  {busy ? "Ingresando…" : "Ingresar ahora"}
                </button>
              ) : (
                <button
                  className="w-full rounded-xl bg-[#0077B6] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#005B96] active:bg-[#004E89] disabled:opacity-60 dark:bg-sky-700 dark:hover:bg-sky-600 dark:active:bg-sky-800"
                  onClick={recuperar}
                  disabled={busy}
                >
                  {busy ? "Enviando…" : "Enviar enlace"}
                </button>
              )}
            </div>

            {error && (
              <p className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">{error}</p>
            )}
            {aviso && (
              <p className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2.5 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300">{aviso}</p>
            )}

            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400 sm:mt-8">
              {vista === "login" ? (
                <>¿Olvidaste tu contraseña? <button className="font-bold text-slate-950 underline underline-offset-2 hover:no-underline dark:text-sky-300" onClick={() => { setVista("recuperar"); setError(null); setAviso(null); }}>Clic aquí</button></>
              ) : (
                <button className="font-bold text-slate-950 underline underline-offset-2 hover:no-underline dark:text-sky-300" onClick={() => { setVista("login"); setError(null); setAviso(null); }}>← Volver a iniciar sesión</button>
              )}
            </p>
          </div>
        </div>
        {conflicto && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:p-6">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="conflicto-sesion-titulo"
              className="w-full max-w-xl rounded-2xl border border-amber-200 bg-[#fffdf5] p-5 text-amber-950 shadow-2xl dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100 sm:p-7"
            >
              <div className="flex items-start gap-3">
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl">!</span>
                <div>
                  <h2 id="conflicto-sesion-titulo" className="text-lg font-extrabold sm:text-xl">
                    Tu cuenta ya tiene una sesión activa
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-amber-900/80 dark:text-slate-300">
                    Si continúas, se cerrará la sesión anterior. ¿Cómo deseas proceder?
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={mantenerSesion}
                  disabled={busy}
                  className="min-h-12 flex-1 rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-bold text-amber-950 transition hover:bg-amber-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  Mantener la sesión actual
                </button>
                <button
                  type="button"
                  onClick={() => ingresar(true)}
                  disabled={busy}
                  className="min-h-12 flex-1 rounded-xl bg-[#0077B6] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#005B96] disabled:opacity-60"
                >
                  {busy ? "Ingresando…" : "Cerrar sesión anterior y entrar"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
