"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * AuthGate — Cálidda Soluciones Hogar
 * Preserva lógica original: getSession + onAuthStateChange,
 * signInWithOAuth (google/azure) y heartbeat cada 120s + visibilitychange.
 * UI reconstruida según capturas: split azul + panel login.
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
  const [loginLoading, setLoginLoading] = useState<"google" | "azure" | null>(null);
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

  const login = useCallback(
    async (provider: "google" | "azure") => {
      setError(null);
      setLoginLoading(provider);
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
        });
        if (error) throw error;
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
        setLoginLoading(null);
      }
    },
    [supabase]
  );

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
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 font-black text-xl">
                ✦
              </span>
              <span className="font-extrabold text-2xl tracking-tight">Cálidda</span>
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

        {/* Derecha: login */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-white">
          <div className="w-full max-w-md">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ACCESO SEGURO
            </span>
            <h1 className="mt-4 text-3xl font-extrabold text-slate-900">Inicia sesión</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Ingresa con tu cuenta corporativa para continuar a Soluciones Hogar.
            </p>
            <div className="mt-6 space-y-3">
              <button className="btn-green w-full !py-3" onClick={() => login("google")} disabled={loginLoading !== null}>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#00A651] font-bold text-xs">G</span>
                {loginLoading === "google" ? "Conectando…" : "Continuar con Google"}
              </button>
              <button className="btn-white w-full !py-3" onClick={() => login("azure")} disabled={loginLoading !== null}>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-white font-bold text-[10px]">▦</span>
                {loginLoading === "azure" ? "Conectando…" : "Continuar con Microsoft"}
              </button>
            </div>
            {error && (
              <p className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</p>
            )}
            <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-4 text-[11px] text-slate-500 leading-relaxed">
              <p className="font-bold text-slate-600 mb-1">Notas de seguridad</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Flujo OAuth con <code>state</code> + <code>nonce</code> y PKCE.</li>
                <li>Google → provider <code>google</code> · Microsoft → provider <code>azure</code>.</li>
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
