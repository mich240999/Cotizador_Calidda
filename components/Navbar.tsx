"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clientes", label: "Clientes" },
  { href: "/materiales", label: "Materiales" },
  { href: "/cotizaciones", label: "Cotizaciones" },
  { href: "/admin", label: "Admin" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const logout = async () => {
    const sb = getSupabaseBrowser();
    await sb.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <nav className="bg-blue-800 text-white shadow">
      <div className="mx-auto max-w-7xl px-4 flex items-center gap-4 h-14">
        <Link href="/" className="flex items-center gap-2 font-bold shrink-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 font-black">
            S
          </span>
          <span className="hidden sm:inline">Soluciones Hogar</span>
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active =
              pathname === l.href || pathname?.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
                  active ? "bg-white/20 font-semibold" : "hover:bg-white/10"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {email ? (
            <>
              <span className="hidden md:inline text-blue-100 max-w-[220px] truncate">
                {email}
              </span>
              <button
                onClick={logout}
                className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 font-medium"
              >
                Salir
              </button>
            </>
          ) : (
            <Link
              href="/"
              className="rounded-lg bg-orange-500 hover:bg-orange-600 px-3 py-1.5 font-medium text-white"
            >
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
