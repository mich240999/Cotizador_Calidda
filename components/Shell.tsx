"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import LogoCalidda from "@/components/LogoCalidda";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ICONOS: Record<string, JSX.Element> = {
  dashboard: (
    <svg viewBox="0 0 24 24" {...STROKE} className="h-5 w-5">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  ),
  clientes: (
    <svg viewBox="0 0 24 24" {...STROKE} className="h-5 w-5">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 8.5a3 3 0 0 1 0 5.8M18.5 14.7c1.6.8 2.5 2.3 2.5 4.3" />
    </svg>
  ),
  cotizaciones: (
    <svg viewBox="0 0 24 24" {...STROKE} className="h-5 w-5">
      <path d="M6 2.5h9L19.5 7v14.5h-13.5z" />
      <path d="M14.5 2.5V8H20" />
      <path d="M9 12h6M9 15.5h6" />
    </svg>
  ),
  ventas: (
    <svg viewBox="0 0 24 24" {...STROKE} className="h-5 w-5">
      <path d="M3 12V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
      <path d="M3 9.5h18" />
      <path d="m7 15 2 2 4-4.5" />
    </svg>
  ),
  instalaciones: (
    <svg viewBox="0 0 24 24" {...STROKE} className="h-5 w-5">
      <path d="M14.5 6.5a4 4 0 0 0-5.6 5L4 16.4V20h3.6l4.9-4.9a4 4 0 0 0 5-5.6l-3 3-2.5-.5-.5-2.5z" />
    </svg>
  ),
  materiales: (
    <svg viewBox="0 0 24 24" {...STROKE} className="h-5 w-5">
      <path d="m12 2.5 8.5 4.7v9.6L12 21.5l-8.5-4.7V7.2z" />
      <path d="M12 12 3.6 7.3M12 12l8.4-4.7M12 12v9.3" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" {...STROKE} className="h-5 w-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.36.95a7 7 0 0 0-2.42-1.4L13.7 2.6h-3.4l-.38 2.54a7 7 0 0 0-2.42 1.4l-2.36-.95-2 3.46 2 1.55a7 7 0 0 0 0 2.8l-2 1.55 2 3.46 2.36-.95a7 7 0 0 0 2.42 1.4l.38 2.54h3.4l.38-2.54a7 7 0 0 0 2.42-1.4l2.36.95 2-3.46-2-1.55c.1-.46.14-.93.14-1.4z" />
    </svg>
  ),
};

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/clientes", label: "Clientes", icon: "clientes" },
  { href: "/cotizaciones", label: "Cotizaciones", icon: "cotizaciones" },
  { href: "/ventas", label: "Ventas", icon: "ventas" },
  { href: "/instalaciones", label: "Instalaciones", icon: "instalaciones", roles: ["ADMIN", "PROVEEDOR"] },
  { href: "/materiales", label: "Materiales", icon: "materiales" },
  { href: "/admin", label: "Administración", icon: "admin", roles: ["ADMIN"] },
];

function initials(email: string | null) {
  if (!email) return "MS";
  const u = email.split("@")[0];
  const parts = u.split(/[._-]+/);
  const s = (parts[0]?.[0] ?? "M") + (parts[1]?.[0] ?? "S");
  return s.toUpperCase();
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [oscuro, setOscuro] = useState(false);
  const [plegado, setPlegado] = useState(false);
  const [miRol, setMiRol] = useState("");

  useEffect(() => {
    const sb = getSupabaseBrowser();
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    fetch("/api/mi-perfil")
      .then((r) => r.json())
      .then((j) => { if (j?.ok && j.rol) setMiRol(String(j.rol).toUpperCase()); })
      .catch(() => {});
    return () => sub.subscription.unsubscribe();
  }, []);

  const visibles = ITEMS.filter((it) => {
    const r = (it as { roles?: string[] }).roles;
    if (!r) return true;
    if (!miRol) return true; // mientras carga, muestra todo
    return r.includes(miRol);
  });

  useEffect(() => {
    try {
      const g = localStorage.getItem("sh-theme") === "dark";
      setOscuro(g);
      document.documentElement.classList.toggle("dark", g);
      setPlegado(localStorage.getItem("sh-sidebar") === "off");
    } catch { /* sin storage */ }
  }, []);

  const alternarTema = () => {
    const n = !oscuro;
    setOscuro(n);
    document.documentElement.classList.toggle("dark", n);
    try {
      localStorage.setItem("sh-theme", n ? "dark" : "light");
    } catch { /* sin storage */ }
  };

  const alternarMenu = () => {
    const n = !plegado;
    setPlegado(n);
    try {
      localStorage.setItem("sh-sidebar", n ? "off" : "on");
    } catch { /* sin storage */ }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FA] dark:bg-slate-950">
      {/* Header blanco */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 sticky top-0 z-30">
        <div className="flex items-center gap-3 px-4 lg:px-6 h-16 group/barra">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2">
              <LogoCalidda priority className="h-9 w-auto" />
            <span className="leading-tight">
              <span className="block text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                Ambientes Cálidos
              </span>
              <span className="block text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Gestión comercial y financiamiento
              </span>
            </span>
            </span>
            <span className="hidden md:block h-8 w-px bg-slate-200 mx-2" />
            <span className="hidden md:block text-sm font-semibold text-slate-600 dark:text-slate-300">
              Cálidda · Gas Natural del Perú
            </span>
          </Link>
          <button
            onClick={alternarMenu}
            title={plegado ? "Desplegar menú" : "Plegar menú"}
            aria-label={plegado ? "Desplegar menú" : "Plegar menú"}
            className="hidden md:inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 opacity-0 group-hover/barra:opacity-100 focus:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition"
          >
            <span aria-hidden className="text-sm font-bold">{plegado ? "→" : "←"}</span>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={alternarTema}
              title={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 dark:border-slate-600 text-base hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <span aria-hidden>{oscuro ? "☀" : "🌙"}</span>
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-none">MS ADMIN</p>
              <p className="text-[11px] text-slate-400 max-w-[220px] truncate">
                {email ?? "usuario@calidda.com.pe"}
              </p>
            </div>
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#0B5FA5] to-[#00A9CE] text-white flex items-center justify-center text-xs font-bold shadow-sm">
              {initials(email)}
            </div>
              <button
                onClick={async () => {
                  await getSupabaseBrowser().auth.signOut();
                  router.push("/");
                  router.refresh();
                }}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Cerrar sesión"
              >
                Salir
              </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`hidden md:flex shrink-0 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 sticky top-16 min-h-[calc(100vh-4rem)] transition-all duration-200 ${plegado ? "w-[68px]" : "w-60"}`}>
          <nav className="p-3 space-y-1">
            {visibles.map((it) => {
              const active = pathname === it.href || pathname?.startsWith(it.href + "/");
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  title={it.label}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                    plegado ? "justify-center px-0" : ""
                  } ${
                    active
                      ? "bg-gradient-to-r from-[#0B5FA5] to-[#0099D8] text-white shadow-md shadow-sky-900/20"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center shrink-0">{ICONOS[it.icon] ?? it.icon}</span>
                  {!plegado && it.label}
                </Link>
              );
            })}
          </nav>
          {!plegado && (
            <div className="mt-auto p-4 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
              Versión 1.0.0
            </div>
          )}
        </aside>

        {/* Mobile nav con scroll horizontal */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:thin]">
          {visibles.map((it) => {
            const active = pathname === it.href || pathname?.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                title={it.label}
                className={`flex flex-col items-center shrink-0 text-[10px] font-semibold px-3 py-1 rounded-lg ${
                  active ? "text-[#0099D8] dark:text-sky-300" : "text-slate-400"
                }`}
              >
                <span className="flex h-6 w-6 items-center justify-center">{ICONOS[it.icon] ?? it.icon}</span>
                {it.label}
              </Link>
            );
          })}
        </div>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-8 pb-20 md:pb-8 min-w-0">{children}</main>
      </div>

      <footer className="hidden md:block text-center text-[11px] text-slate-400 pb-6">
        Versión 1.0.0 · Ambientes Cálidos
      </footer>
    </div>
  );
}
