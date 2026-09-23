"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

function CuentaValidada() {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string>("MS ADMIN");
  useEffect(() => {
    const sb = getSupabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setEmail(u?.email ?? null);
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const n =
        (meta.full_name as string) || (meta.name as string) || u?.email?.split("@")[0] || "MS ADMIN";
      setName(String(n).toUpperCase());
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      <div className="lg:w-[46%] bg-[#0099D8] text-white flex flex-col justify-between p-8 lg:p-12">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 font-black text-xl">✦</span>
            <span className="font-extrabold text-2xl tracking-tight">Cálidda</span>
          </div>
          <p className="mt-8 text-xs font-bold tracking-[0.2em] text-white/80">PLATAFORMA COMERCIAL</p>
          <h2 className="mt-2 text-4xl font-extrabold leading-tight">Soluciones Hogar</h2>
          <p className="mt-4 text-white/85 text-sm leading-relaxed max-w-sm">
            Gestiona clientes, cotizaciones y financiamiento de productos para el hogar de forma
            simple y segura.
          </p>
        </div>
        <div className="mt-10 text-[11px] text-white/60">Versión 1.0.0</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md text-center">
          <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-3xl font-bold">
            ✓
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">Cuenta validada</h1>
          <p className="mt-1 text-sm text-slate-500">Tu identidad fue verificada correctamente.</p>
          <div className="mt-6 card p-5 text-left text-sm space-y-2">
            <div className="flex justify-between"><span className="text-slate-400">Nombre</span><span className="font-semibold">{name}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Email</span><span className="font-semibold truncate ml-4">{email ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Rol</span><span className="font-semibold">ADMIN</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Vigencia</span><span className="font-semibold">2026 activo</span></div>
          </div>
          <Link href="/dashboard" className="btn-green w-full !py-3 mt-6">
            Entrar a Soluciones Hogar
          </Link>
          <p className="mt-4 text-[11px] text-slate-400">Versión 1.0.0</p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  useEffect(() => {
    const beat = () => fetch("/api/cron/heartbeat", { method: "GET", keepalive: true }).catch(() => {});
    beat();
    const id = setInterval(beat, 120_000);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <AuthGate>
      <CuentaValidada />
    </AuthGate>
  );
}
