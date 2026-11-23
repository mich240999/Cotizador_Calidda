"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import LogoCalidda from "@/components/LogoCalidda";
import PasswordInput from "@/components/PasswordInput";

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
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ["ADMIN"] },
  { href: "/clientes", label: "Clientes", icon: "clientes", roles: ["ADMIN", "ASESOR", "SUPERVISOR"] },
  { href: "/cotizaciones", label: "Cotizaciones", icon: "cotizaciones", roles: ["ADMIN", "ASESOR", "SUPERVISOR"] },
  { href: "/ventas", label: "Ventas", icon: "ventas", roles: ["ADMIN", "ASESOR", "SUPERVISOR"] },
  { href: "/instalaciones", label: "Instalaciones", icon: "instalaciones", roles: ["ADMIN", "PROVEEDOR"] },
  { href: "/materiales", label: "Materiales", icon: "materiales", roles: ["ADMIN", "ASESOR"] },
  { href: "/admin", label: "Administración", icon: "admin", roles: ["ADMIN"] },
];

// Se conserva entre navegaciones del App Router para que el sidebar no se
// despliegue un instante al montar de nuevo la página.
let estadoPlegado: boolean | null = null;
let estadoTema: boolean | null = null;
// Se conserva el rol entre navegaciones para que los módulos restringidos no
// aparezcan y desaparezcan mientras /api/mi-perfil responde.
let rolCache: string | null = null;
let nombreCache: string | null = null;
let emailPerfilCache: string | null = null;

function initials(nombre: string | null, email: string | null) {
  const partesNombre = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partesNombre.length >= 2) {
    return (partesNombre[0][0] + partesNombre[partesNombre.length - 1][0]).toUpperCase();
  }
  if (partesNombre.length === 1) return partesNombre[0].slice(0, 2).toUpperCase();
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
  const [nombre, setNombre] = useState(() => nombreCache ?? "");
  const [telefono, setTelefono] = useState("");
  const [oscuro, setOscuro] = useState(() => estadoTema ?? false);
  const [plegado, setPlegado] = useState(() => estadoPlegado ?? false);
  const [miRol, setMiRol] = useState(() => rolCache ?? "");
  const [menuCuenta, setMenuCuenta] = useState(false);
  const [popupCuenta, setPopupCuenta] = useState<"datos" | "contrasena" | null>(null);
  const [emailForm, setEmailForm] = useState("");
  const [telefonoForm, setTelefonoForm] = useState("");
  const [contrasenaActual, setContrasenaActual] = useState("");
  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [repetirContrasena, setRepetirContrasena] = useState("");
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);
  const [errorCuenta, setErrorCuenta] = useState("");
  const [resultadoCuenta, setResultadoCuenta] = useState("");

  useEffect(() => {
    const sb = getSupabaseBrowser();
    const cargarPerfil = () => {
      fetch("/api/mi-perfil", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!j?.ok) return;
          const rol = String(j.rol ?? "").toUpperCase();
          const nombreUsuario = String(j.nombre ?? "").trim();
          setTelefono(String(j.telefono ?? ""));
          if (rol) {
            rolCache = rol;
            setMiRol(rol);
          }
          if (nombreUsuario) {
            nombreCache = nombreUsuario;
            setNombre(nombreUsuario);
          }
        })
        .catch(() => {});
    };
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      const emailSesion = s?.user?.email?.toLowerCase() ?? null;
      setEmail(emailSesion);
      if (!s) {
        emailPerfilCache = null;
        rolCache = null;
        nombreCache = null;
        setMiRol("");
        setNombre("");
        return;
      }
      if (emailPerfilCache !== emailSesion) {
        emailPerfilCache = emailSesion;
        rolCache = null;
        nombreCache = null;
        setMiRol("");
        setNombre("");
      }
      if (!rolCache || !nombreCache) cargarPerfil();
    });
    cargarPerfil();
    return () => sub.subscription.unsubscribe();
  }, []);

  const visibles = ITEMS.filter((it) => {
    const r = (it as { roles?: string[] }).roles;
    if (!r) return true;
    // Sin rol cargado no se muestra nada restringido (evita el parpadeo).
    if (!miRol) return false;
    return r.includes(miRol);
  });
  const rutaActual = ITEMS.find((it) => pathname === it.href || pathname?.startsWith(`${it.href}/`));
  const puedeVerRuta = !rutaActual?.roles || (!!miRol && rutaActual.roles.includes(miRol));

  useEffect(() => {
    if (!miRol || !pathname) return;
    const ruta = ITEMS.find((it) => pathname === it.href || pathname.startsWith(`${it.href}/`));
    const roles = ruta?.roles;
    if (roles && !roles.includes(miRol)) {
      router.replace(miRol === "PROVEEDOR" ? "/instalaciones" : "/cotizaciones");
    }
  }, [miRol, pathname, router]);

  useEffect(() => {
    if (estadoTema === null) {
      try {
        estadoTema = localStorage.getItem("sh-theme") === "dark";
      } catch { estadoTema = false; }
    }
    setOscuro(estadoTema);
    document.documentElement.classList.toggle("dark", estadoTema);
    if (estadoPlegado === null) {
      try {
        estadoPlegado = localStorage.getItem("sh-sidebar") === "off";
      } catch { estadoPlegado = false; }
    }
    setPlegado(estadoPlegado);
  }, []);

  const alternarTema = () => {
    const n = !oscuro;
    estadoTema = n;
    setOscuro(n);
    document.documentElement.classList.toggle("dark", n);
    try {
      localStorage.setItem("sh-theme", n ? "dark" : "light");
    } catch { /* sin storage */ }
  };

  const alternarMenu = () => {
    const n = !plegado;
    estadoPlegado = n;
    setPlegado(n);
    try {
      localStorage.setItem("sh-sidebar", n ? "off" : "on");
    } catch { /* sin storage */ }
  };

  const abrirPopupCuenta = (tipo: "datos" | "contrasena") => {
    setMenuCuenta(false);
    setPopupCuenta(tipo);
    setErrorCuenta("");
    setResultadoCuenta("");
    setContrasenaActual("");
    setNuevaContrasena("");
    setRepetirContrasena("");
    if (tipo === "datos") {
      setEmailForm(email ?? "");
      setTelefonoForm(telefono);
    }
  };

  const guardarCuenta = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorCuenta("");
    setResultadoCuenta("");
    if (!contrasenaActual) {
      setErrorCuenta("Ingresa tu contraseña actual para confirmar el cambio.");
      return;
    }
    if (popupCuenta === "contrasena") {
      if (nuevaContrasena.length < 10) {
        setErrorCuenta("La contraseña debe tener al menos 10 caracteres.");
        return;
      }
      if (!/\p{Lu}/u.test(nuevaContrasena)) {
        setErrorCuenta("Incluye al menos una letra mayúscula.");
        return;
      }
      if (!/[\p{P}\p{S}]/u.test(nuevaContrasena)) {
        setErrorCuenta("Incluye al menos un símbolo.");
        return;
      }
      if (nuevaContrasena !== repetirContrasena) {
        setErrorCuenta("Las contraseñas nuevas no coinciden.");
        return;
      }
    }

    setGuardandoCuenta(true);
    try {
      const payload = popupCuenta === "datos"
        ? { tipo: "datos", contrasenaActual, email: emailForm.trim(), telefono: telefonoForm.trim() }
        : { tipo: "contrasena", contrasenaActual, nuevaContrasena, repetirContrasena };
      const response = await fetch("/api/mi-perfil/actualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) throw new Error(json?.error || "No se pudo guardar el cambio.");
      if (popupCuenta === "datos") {
        if (!json.emailConfirmationRequired && json.email) setEmail(String(json.email));
        setTelefono(String(json.telefono ?? telefonoForm.trim()));
        setResultadoCuenta(json.emailConfirmationRequired
          ? "Teléfono actualizado. Confirma el cambio de correo desde el mensaje que enviamos a esa dirección."
          : "Tus datos se actualizaron correctamente.");
      } else {
        setResultadoCuenta("Contraseña actualizada correctamente.");
      }
      setContrasenaActual("");
      setNuevaContrasena("");
      setRepetirContrasena("");
    } catch (err) {
      setErrorCuenta(err instanceof Error ? err.message : "No se pudo guardar el cambio.");
    } finally {
      setGuardandoCuenta(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FA] dark:bg-slate-950">
      {/* Cabecera delineada con la paleta Cálidda */}
      <header className="bg-white dark:bg-slate-900 border-x border-t border-b-2 border-x-[#0099D8]/45 border-t-[#0099D8]/45 border-b-[#0099D8] dark:border-x-[#00A9CE]/45 dark:border-t-[#00A9CE]/45 dark:border-b-[#00A9CE] shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3 px-4 lg:px-6 h-16 group/barra">
          <Link href="/dashboard" title="Ambientes Cáliddos" className="flex items-center gap-2 shrink-0">
            <LogoCalidda priority className={`${plegado ? "h-8 w-auto max-w-[44px]" : "h-7 w-auto max-w-[110px]"} object-contain`} />
            {!plegado && (
              <>
                <span className="leading-tight">
                  <span className="block text-sm font-extrabold text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
                    Ambientes Cáliddos
                  </span>
                  <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap">
                    Gestión comercial y financiamiento
                  </span>
                </span>
                <span className="hidden md:block h-8 w-px bg-slate-200 mx-2" />
                <span className="hidden md:block text-sm font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  Cálidda · Gas Natural del Perú
                </span>
              </>
            )}
          </Link>
          <button
            onClick={alternarMenu}
            title={plegado ? "Desplegar menú" : "Plegar menú"}
            aria-label={plegado ? "Desplegar menú" : "Plegar menú"}
            className="hidden md:inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 opacity-0 group-hover/barra:opacity-100 focus:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition"
          >
            <span aria-hidden className="text-sm font-bold">{plegado ? "→" : "←"}</span>
          </button>
          <div className="ml-auto flex items-center gap-3 relative">
            <button
              onClick={alternarTema}
              title={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#0099D8]/45 dark:border-[#00A9CE]/55 text-[#0077B6] dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0099D8]"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {oscuro ? (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
                  </>
                ) : (
                  <path d="M20.2 15.4A8.4 8.4 0 0 1 8.6 3.8 8.5 8.5 0 1 0 20.2 15.4Z" />
                )}
              </svg>
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-none max-w-[220px] truncate">{nombre || email?.split("@")[0] || "Usuario"}</p>
              <p className="text-[11px] text-slate-400 max-w-[220px] truncate">
                {email ?? "usuario@calidda.com.pe"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMenuCuenta((v) => !v)}
              aria-label="Opciones de perfil"
              aria-haspopup="menu"
              aria-expanded={menuCuenta}
              className="h-9 w-9 rounded-full bg-gradient-to-br from-[#0B5FA5] to-[#00A9CE] text-white flex items-center justify-center text-xs font-bold shadow-sm ring-2 ring-white/80 dark:ring-slate-700 hover:scale-105 transition"
            >
              {initials(nombre, email)}
            </button>
            {menuCuenta && (
              <div role="menu" className="absolute right-10 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-[#0099D8]/30 bg-white p-2 shadow-xl shadow-slate-900/15 dark:border-[#00A9CE]/40 dark:bg-slate-900">
                <p className="truncate px-3 py-2 text-[11px] font-semibold text-slate-400">{nombre || email || "Mi perfil"}</p>
                <button type="button" role="menuitem" onClick={() => abrirPopupCuenta("datos")} className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-sky-50 dark:text-slate-200 dark:hover:bg-slate-800">
                  Actualizar datos
                </button>
                <button type="button" role="menuitem" onClick={() => abrirPopupCuenta("contrasena")} className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-sky-50 dark:text-slate-200 dark:hover:bg-slate-800">
                  Actualizar contraseña
                </button>
              </div>
            )}
              <button
                onClick={async () => {
                  try {
                    await fetch("/api/auth/logout", { method: "POST" });
                  } catch { /* sin red */ }
                  await getSupabaseBrowser().auth.signOut({ scope: "local" }).catch(() => undefined);
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
        <aside className={`hidden md:flex shrink-0 flex-col items-center bg-white dark:bg-slate-900 border-r border-slate-200 sticky top-16 min-h-[calc(100vh-4rem)] transition-all duration-200 ${plegado ? "w-[68px]" : "w-60"}`}>
          <nav className={`my-3 rounded-2xl border border-[#0099D8]/35 bg-white/70 p-2 space-y-1 shadow-sm dark:border-[#00A9CE]/45 dark:bg-slate-900/70 ${plegado ? "w-[calc(100%_-_1rem)]" : "w-[calc(100%_-_1.5rem)]"}`}>
            {visibles.map((it) => {
              const active = pathname === it.href || pathname?.startsWith(it.href + "/");
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  title={it.label}
                  className={`flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    plegado ? "justify-center px-0" : "px-4"
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
            <div className="mt-auto w-full p-4 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
              Versión 1.0.0
            </div>
          )}
        </aside>

        {/* Mobile nav: centrado y repartido; si hay muchos módulos, scroll horizontal */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 rounded-t-2xl bg-white dark:bg-slate-900 border-x border-t-2 border-[#0099D8]/55 dark:border-[#00A9CE]/60 shadow-[0_-4px_18px_rgba(0,119,182,0.12)] overflow-x-auto [scrollbar-width:thin] pb-[env(safe-area-inset-bottom)]">
          <nav className="flex w-max min-w-full items-center justify-center gap-1 px-2 py-2">
            {visibles.map((it) => {
              const active = pathname === it.href || pathname?.startsWith(it.href + "/");
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  title={it.label}
                  className={`flex min-w-[64px] flex-1 flex-col items-center justify-center whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-semibold ${
                    active ? "text-[#0099D8] dark:text-sky-300" : "text-slate-400"
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center">{ICONOS[it.icon] ?? it.icon}</span>
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-8 pb-20 md:pb-8 min-w-0">
          {puedeVerRuta ? children : <div className="card p-8 text-center text-sm text-slate-500">Verificando permisos…</div>}
        </main>
      </div>

      {popupCuenta && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !guardandoCuenta) setPopupCuenta(null); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="cuenta-titulo" className="w-full max-w-md rounded-3xl border border-[#0099D8]/30 bg-white p-5 shadow-2xl shadow-slate-950/25 dark:border-[#00A9CE]/45 dark:bg-slate-900 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-extrabold tracking-[0.18em] text-[#0077B6] dark:text-sky-300">PERFIL DE USUARIO</p>
                <h2 id="cuenta-titulo" className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">
                  {popupCuenta === "datos" ? "Actualizar datos" : "Actualizar contraseña"}
                </h2>
              </div>
              <button type="button" aria-label="Cerrar" disabled={guardandoCuenta} onClick={() => setPopupCuenta(null)} className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-white">×</button>
            </div>
            <form onSubmit={guardarCuenta} className="space-y-4">
              {popupCuenta === "datos" ? (
                <>
                  <div>
                    <label className="label" htmlFor="perfil-email">Correo electrónico</label>
                    <input id="perfil-email" className="input" type="email" autoComplete="email" required maxLength={160} value={emailForm} onChange={(e) => setEmailForm(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor="perfil-telefono">Teléfono</label>
                    <input id="perfil-telefono" className="input" type="tel" autoComplete="tel" placeholder="+51 999 999 999" maxLength={30} value={telefonoForm} onChange={(e) => setTelefonoForm(e.target.value)} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Solo puedes cambiar tu correo y teléfono. El cambio de correo requiere confirmación.</p>
                </>
              ) : (
                <>
                  <div>
                    <label className="label" htmlFor="clave-actual">Contraseña actual</label>
                    <PasswordInput id="clave-actual" className="input" autoComplete="current-password" required value={contrasenaActual} onChange={(e) => setContrasenaActual(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor="clave-nueva">Nueva contraseña</label>
                    <PasswordInput id="clave-nueva" className="input" autoComplete="new-password" required minLength={10} value={nuevaContrasena} onChange={(e) => setNuevaContrasena(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor="clave-repetir">Repite la nueva contraseña</label>
                    <PasswordInput id="clave-repetir" className="input" autoComplete="new-password" required value={repetirContrasena} onChange={(e) => setRepetirContrasena(e.target.value)} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mínimo 10 caracteres, una mayúscula y un símbolo.</p>
                </>
              )}
              {popupCuenta === "datos" && (
                <div>
                  <label className="label" htmlFor="datos-clave-actual">Confirma con tu contraseña actual</label>
                  <PasswordInput id="datos-clave-actual" className="input" autoComplete="current-password" required value={contrasenaActual} onChange={(e) => setContrasenaActual(e.target.value)} />
                </div>
              )}
              {errorCuenta && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{errorCuenta}</p>}
              {resultadoCuenta && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{resultadoCuenta}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-white" onClick={() => setPopupCuenta(null)} disabled={guardandoCuenta}>Cerrar</button>
                {!resultadoCuenta && <button type="submit" className="btn-green" disabled={guardandoCuenta}>{guardandoCuenta ? "Guardando…" : "Guardar cambios"}</button>}
              </div>
            </form>
          </section>
        </div>
      )}

      <footer className="hidden md:block text-center text-[11px] text-slate-400 pb-6">
        Versión 1.0.0 · Ambientes Cáliddos
      </footer>
    </div>
  );
}
