"use client";

import type { MouseEventHandler, ReactNode } from "react";

/**
 * Accion — botonera CRUD con símbolos + tooltip (title).
 * Uso: <AccVer title="Visualizar cliente" onClick={...} /> etc.
 * El nombre aparece al pasar el cursor (title nativo).
 */

type Tono = "neutro" | "verde" | "rojo" | "azul";

const CLASE_TONO: Record<Tono, string> = {
  neutro: "bg-white text-[#0B5FA5] border-slate-300 hover:bg-sky-50 dark:bg-slate-800 dark:text-sky-300 dark:border-slate-600 dark:hover:bg-slate-700",
  verde: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-900/70",
  rojo: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/70",
  azul: "bg-sky-50 text-[#0077B6] border-sky-200 hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-900/70",
};

const svg = (children: ReactNode) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    {children}
  </svg>
);

const ICONOS = {
  ver: svg(<><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>),
  editar: svg(<><path d="m14 5 5 5" /><path d="M4 20 5.5 15 16.8 3.7a2.1 2.1 0 0 1 3 3L8.5 18 4 20Z" /><path d="M4 20h6" /></>),
  activar: svg(<><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>),
  desactivar: svg(<><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>),
  eliminar: svg(<><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 14h11l1-14M9 7V4h6v3" /></>),
  abrir: svg(<><path d="M13 5h6v6m0-6-9 9" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>),
  quitar: svg(<path d="m7 7 10 10M17 7 7 17" />),
  aprobar: svg(<path d="m5 12 4.5 4.5L19 7" />),
  observar: svg(<><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>),
  descargar: svg(<><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 17v4h14v-4" /></>),
  enviar: svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>),
  cerrar: svg(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
  actualizar: svg(<><path d="M20 7v5h-5" /><path d="M4.5 9A8 8 0 0 1 18 5l2 2M4 17v-5h5" /><path d="M19.5 15A8 8 0 0 1 6 19l-2-2" /></>),
  clave: svg(<><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8 2 2-2 2 2 2-3 3-2-2-2 2" /></>),
  herramienta: svg(<path d="M14.5 6.5a4 4 0 0 0-5.6 5L4 16.4V20h3.6l4.9-4.9a4 4 0 0 0 5-5.6l-3 3-2.5-.5-.5-2.5z" />),
};

export function IconBtn({
  simbolo,
  title,
  onClick,
  disabled,
  tono = "neutro",
  className = "",
  href,
}: {
  simbolo: ReactNode;
  title: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  tono?: Tono;
  className?: string;
  href?: string;
}) {
  const simboloVisual = simbolo === "🔑" ? ICONOS.clave : simbolo;
  const cls = `inline-flex items-center justify-center h-8 w-8 rounded-lg border shadow-sm transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0099D8] disabled:opacity-40 disabled:cursor-not-allowed ${CLASE_TONO[tono]} ${className}`;
  if (href) {
    return (
      <a href={href} title={title} aria-label={title} className={`${cls} no-underline`}>
        <span aria-hidden>{simboloVisual}</span>
      </a>
    );
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cls}
    >
      <span aria-hidden>{simboloVisual}</span>
    </button>
  );
}

const acc = (
  simbolo: ReactNode,
  tono: Tono,
  nombre: string
) =>
  function Acc({
    title,
    onClick,
    disabled,
    className,
    href,
  }: {
    title?: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    className?: string;
    href?: string;
  }) {
    return <IconBtn simbolo={simbolo} title={title ?? nombre} onClick={onClick} disabled={disabled} tono={tono} className={className} href={href} />;
  };

export const AccVer = acc(ICONOS.ver, "azul", "Visualizar");
export const AccEditar = acc(ICONOS.editar, "neutro", "Editar");
export const AccActivar = acc(ICONOS.activar, "verde", "Activar");
export const AccDesactivar = acc(ICONOS.desactivar, "rojo", "Desactivar");
export const AccEliminar = acc(ICONOS.eliminar, "rojo", "Eliminar");
export const AccAbrir = acc(ICONOS.abrir, "azul", "Abrir");
export const AccQuitar = acc(ICONOS.quitar, "rojo", "Quitar");
export const AccValidar = acc(ICONOS.aprobar, "verde", "Validar");
export const AccAprobar = acc(ICONOS.aprobar, "verde", "Aprobar");
export const AccObservar = acc(ICONOS.observar, "neutro", "Observar");
export const AccDescargar = acc(ICONOS.descargar, "neutro", "Descargar");
export const AccEnviar = acc(ICONOS.enviar, "neutro", "Enviar");
export const AccCerrar = acc(ICONOS.cerrar, "neutro", "Cerrar");
export const AccActualizar = acc(ICONOS.actualizar, "neutro", "Actualizar");
export const AccSolicitar = acc(ICONOS.herramienta, "azul", "Solicitar");
