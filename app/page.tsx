"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import LogoCalidda from "@/components/LogoCalidda";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

function CuentaValidada() {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string>("—");
  const [rol, setRol] = useState<string>("—");
  const [estado, setEstado] = useState<string>("—");
  useEffect(() => {
    const sb = getSupabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setEmail(u?.email ?? null);
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const raw =
        (meta.full_name as string) ||
        (meta.name as string) ||
        (u?.email ? u.email.split("@")[0] : "") ||
        "";
      setName(raw ? String(raw).toUpperCase() : "—");
    });
    fetch("/api/mi-perfil")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) {
          if (j.rol) setRol(String(j.rol));
          if (j.estado) setEstado(String(j.estado));
        }
      })
      .catch(() => {});
  }, []);

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
          <span className="inline-flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-white/15 text-2xl sm:text-3xl font-black">✓</span>
          <h2 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight">
            Cuenta<br />validada!
          </h2>
          <p className="mt-4 text-white/85 text-sm sm:text-base leading-relaxed max-w-sm">
            Tu identidad fue verificada correctamente. Ya puedes entrar a gestionar
            cotizaciones, clientes y ventas.
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
          <div className="mt-10 rounded-2xl border border-slate-200 p-5 text-sm">
            <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100"><span className="text-slate-400">Nombre</span><span className="font-bold text-right">{name}</span></div>
            <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100"><span className="text-slate-400">Email</span><span className="font-bold text-right truncate ml-4">{email ?? "—"}</span></div>
            <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100"><span className="text-slate-400">Rol</span><span className="font-bold">{rol}</span></div>
            <div className="flex justify-between gap-4 py-1.5"><span className="text-slate-400">Estado</span><span className={`font-bold ${estado === "Activa" ? "text-emerald-600" : ""}`}>{estado}</span></div>
          </div>
          <Link href="/dashboard" className="mt-6 block w-full rounded-xl bg-[#0077B6] py-3.5 text-center text-[15px] font-semibold text-white transition hover:bg-[#005B96] no-underline">
            Entrar a Ambientes Cálidos
          </Link>
          <p className="mt-6 text-center text-[11px] text-slate-400">Versión 1.0.0</p>
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
