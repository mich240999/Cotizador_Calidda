"use client";

import type { MouseEventHandler, ReactNode } from "react";

/**
 * Accion — botonera CRUD con símbolos + tooltip (title).
 * Uso: <AccVer title="Visualizar cliente" onClick={...} /> etc.
 * El nombre aparece al pasar el cursor (title nativo).
 */

type Tono = "neutro" | "verde" | "rojo" | "azul";

const CLASE_TONO: Record<Tono, string> = {
  neutro: "bg-white text-slate-600 border-slate-300 hover:bg-slate-50",
  verde: "bg-[#0077B6] text-white border-[#0077B6] hover:bg-[#005B96]",
  rojo: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
  azul: "bg-sky-50 text-[#0077B6] border-sky-200 hover:bg-sky-100",
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
  const cls = `inline-flex items-center justify-center h-8 w-8 rounded-lg border text-base font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${CLASE_TONO[tono]} ${className}`;
  if (href) {
    return (
      <a href={href} title={title} aria-label={title} className={`${cls} no-underline`}>
        <span aria-hidden>{simbolo}</span>
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
      <span aria-hidden>{simbolo}</span>
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

export const AccVer = acc("👁", "azul", "Visualizar");
export const AccEditar = acc("✎", "neutro", "Editar");
export const AccActivar = acc("✓", "verde", "Activar");
export const AccDesactivar = acc("✕", "rojo", "Desactivar");
export const AccEliminar = acc("🗑", "rojo", "Eliminar");
export const AccAbrir = acc("↗", "azul", "Abrir");
export const AccQuitar = acc("×", "rojo", "Quitar");
export const AccValidar = acc("✔", "verde", "Validar");
export const AccAprobar = acc("✓", "verde", "Aprobar");
export const AccObservar = acc("⚠", "neutro", "Observar");
export const AccDescargar = acc("⬇", "neutro", "Descargar");
export const AccEnviar = acc("✉", "neutro", "Enviar");
export const AccCerrar = acc("🔒", "neutro", "Cerrar");
export const AccActualizar = acc("⟳", "neutro", "Actualizar");
