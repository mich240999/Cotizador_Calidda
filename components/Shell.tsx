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

  useEffect(() => {
    const sb = getSupabaseBrowser();
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F7FA]">
      {/* Header blanco */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="flex items-center gap-3 px-4 lg:px-6 h-16">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2">
              <LogoCalidda priority className="h-9 w-auto" />
              <span className="leading-tight">
                <span className="block text-[11px] font-semibold text-slate-500">
                  Soluciones Hogar
                </span>
              </span>
            </span>
            <span className="hidden md:block h-8 w-px bg-slate-200 mx-2" />
            <span className="hidden md:block text-sm font-semibold text-slate-600">
              Gestión comercial y financiamiento
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-700 leading-none">MS ADMIN</p>
              <p className="text-[11px] text-slate-400 max-w-[220px] truncate">
                {email ?? "usuario@calidda.com.pe"}
              </p>
            </div>
            <div className="h-9 w-9 rounded-full bg-[#0099D8] text-white flex items-center justify-center text-xs font-bold">
              {initials(email)}
            </div>
            <button
              onClick={async () => {
                await getSupabaseBrowser().auth.signOut();
                router.push("/");
                router.refresh();
              }}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600"
              title="Cerrar sesión"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col bg-white border-r border-slate-200 min-h-[calc(100vh-4rem)] sticky top-16">
          <nav className="p-3 space-y-1">
            {ITEMS.map((it) => {
              const active = pathname === it.href || pathname?.startsWith(it.href + "/");
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                    active
                      ? "bg-[#0099D8] text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="text-base w-5 text-center">{it.icon}</span>
                  {it.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto p-4 text-[11px] text-slate-400 border-t border-slate-100">
            Versión 1.0.0
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex justify-around py-2">
          {ITEMS.map((it) => {
            const active = pathname === it.href || pathname?.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex flex-col items-center text-[10px] font-semibold px-2 py-1 rounded-lg ${
                  active ? "text-[#0099D8]" : "text-slate-400"
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
        Versión 1.0.0 · Cálidda Soluciones Hogar
      </footer>
    </div>
  );
}
