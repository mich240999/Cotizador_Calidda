"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import LogoCalidda from "@/components/LogoCalidda";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/clientes", label: "Clientes", icon: "◉" },
  { href: "/cotizaciones", label: "Cotizaciones", icon: "▤" },
  { href: "/ventas", label: "Ventas", icon: "◈" },
  { href: "/materiales", label: "Materiales", icon: "▣" },
  { href: "/admin", label: "Administración", icon: "⚙" },
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

  useEffect(() => {
    const sb = getSupabaseBrowser();
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

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
        <div className="flex items-center gap-3 px-4 lg:px-6 h-16">
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
            <button
              onClick={alternarMenu}
              title={plegado ? "Desplegar menú" : "Plegar menú"}
              aria-label={plegado ? "Desplegar menú" : "Plegar menú"}
              className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <span aria-hidden className="text-base font-bold">{plegado ? "→" : "←"}</span>
            </button>
          </Link>
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
            {ITEMS.map((it) => {
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
                  <span className="text-base w-5 text-center shrink-0">{it.icon}</span>
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

        {/* Mobile nav */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 flex justify-around py-2">
          {ITEMS.map((it) => {
            const active = pathname === it.href || pathname?.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex flex-col items-center text-[10px] font-semibold px-2 py-1 rounded-lg ${
                  active ? "text-[#0099D8] dark:text-sky-300" : "text-slate-400"
                }`}
              >
                <span className="text-lg">{it.icon}</span>
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
