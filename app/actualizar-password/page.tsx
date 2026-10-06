"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import LogoCalidda from "@/components/LogoCalidda";

/**
 * /actualizar-password — destino del enlace de recuperación.
 * Acepta los dos formatos de Supabase: ?code= (PKCE, lo canjea aquí)
 * o sesión ya establecida (#access_token). Sin sesión válida avisa
 * que el enlace venció. Al guardar, cierra sesión y pide login de nuevo.
 */
export default function ActualizarPasswordPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [estado, setEstado] = useState<"verificando" | "lista" | "invalido">("verificando");
  const [clave1, setClave1] = useState("");
  const [clave2, setClave2] = useState("");
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          window.history.replaceState({}, "", "/actualizar-password");
        }
        const { data } = await supabase.auth.getUser();
        if (!vivo) return;
        setEstado(data.user ? "lista" : "invalido");
      } catch {
        if (vivo) setEstado("invalido");
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async () => {
    setError(null);
    if (clave1.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (clave1 !== clave2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: clave1 });
      if (error) throw error;
      setOk(true);
      await supabase.auth.signOut();
      setTimeout(() => router.push("/"), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      <div className="relative overflow-hidden lg:w-[46%] bg-gradient-to-br from-[#0B5FA5] via-[#0088C7] to-[#00A9CE] text-white flex flex-col justify-between p-6 sm:p-8 lg:p-16 min-h-0">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]" viewBox="0 0 600 800" fill="none" stroke="white" strokeWidth="1.5" preserveAspectRatio="xMidYMid slice">
          <path d="M-40 140 C 160 200, 300 320, 380 560" />
          <path d="M-40 190 C 170 250, 320 370, 410 610" />
          <path d="M-40 240 C 180 300, 340 420, 440 660" />
          <path d="M-40 290 C 190 350, 360 470, 470 710" />
          <path d="M-40 340 C 200 400, 380 520, 500 760" />
        </svg>
        <div className="relative">
          <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" className="h-12 w-12 sm:h-16 sm:w-16 text-white">
            <line x1="50" y1="8" x2="50" y2="92" />
            <line x1="8" y1="50" x2="92" y2="50" />
            <line x1="20" y1="20" x2="80" y2="80" />
            <line x1="80" y1="20" x2="20" y2="80" />
          </svg>
          <h2 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight">
            Nueva<br />contraseña
          </h2>
          <p className="mt-4 text-white/85 text-sm sm:text-base leading-relaxed max-w-sm">
            Crea una clave segura para volver a entrar a Ambientes Cálidos.
          </p>
        </div>
        <p className="relative mt-6 text-xs sm:text-sm text-white/60">© 2026 Cálidda. Todos los derechos reservados.</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-5 sm:p-8 lg:p-16 bg-white">
        <div className="w-full max-w-sm py-6 lg:py-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <LogoCalidda className="h-9 sm:h-11 w-auto" />
            <span className="text-xl sm:text-2xl font-extrabold text-black tracking-tight">Ambientes Cálidos</span>
          </div>
          <h1 className="mt-8 text-2xl sm:text-3xl font-extrabold text-black tracking-tight">Actualiza tu contraseña</h1>
          <p className="mt-2 text-sm text-slate-500">Ingrésala dos veces para confirmar el cambio.</p>

          {estado === "verificando" && (
            <div className="mt-8 flex items-center gap-3 text-sm text-slate-500">
              <span className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-[#0077B6] animate-spin" />
              Verificando enlace…
            </div>
          )}

          {estado === "invalido" && (
            <div className="mt-6 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              Enlace inválido o vencido (dura 1 hora y es de un solo uso).
              Vuelve al login y pide otro correo de recuperación.
            </div>
          )}

          {estado === "lista" && (
            <div className="mt-8 space-y-7">
              <div className="relative">
                <svg className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                <input
                  type={ver ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full border-0 border-b-2 border-slate-200 bg-transparent pl-8 pr-10 py-2.5 text-[15px] text-black placeholder:text-slate-400 focus:border-black focus:outline-none focus:ring-0"
                  placeholder="Nueva contraseña (mín. 8)"
                  value={clave1}
                  onChange={(e) => setClave1(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setVer((v) => !v)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black text-base"
                  title={ver ? "Ocultar" : "Mostrar"}
                >
                  {ver ? "◠" : "👁"}
                </button>
              </div>
              <div>
                <input
                  type={ver ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full border-0 border-b-2 border-slate-200 bg-transparent px-0 py-2.5 text-[15px] text-black placeholder:text-slate-400 focus:border-black focus:outline-none focus:ring-0"
                  placeholder="Repite la contraseña"
                  value={clave2}
                  onChange={(e) => setClave2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && guardar()}
                />
              </div>
              <button
                className="w-full rounded-xl bg-[#0077B6] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#005B96] disabled:opacity-60"
                onClick={guardar}
                disabled={busy || ok}
              >
                {busy ? "Guardando…" : ok ? "¡Lista! Redirigiendo al login…" : "Guardar nueva contraseña"}
              </button>
            </div>
          )}

          {error && (
            <p className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</p>
          )}
          {ok && (
            <p className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2.5">
              Contraseña actualizada. Vuelve a ingresar con tu nueva clave.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
