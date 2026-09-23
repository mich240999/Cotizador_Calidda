"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  width?: number;
  height?: number;
  priority?: boolean;
  /** Clases extra para la imagen (ej. "h-9 w-auto" para ajustarla al header). */
  className?: string;
  /** Clases para el texto de respaldo cuando aún no existe /logo-calidda.png. */
  fallbackClassName?: string;
};

/**
 * LogoCalidda — logo oficial desde /logo-calidda.png (colocar el PNG en public/).
 * Si la imagen no carga (falta el archivo), muestra el texto "Cálidda" como respaldo.
 */
export default function LogoCalidda({
  width = 160,
  height = 60,
  priority = false,
  className = "",
  fallbackClassName = "text-[#0099D8] text-2xl",
}: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`font-extrabold tracking-tight ${fallbackClassName}`}>
        Cálidda
      </span>
    );
  }

  return (
    <Image
      src="/logo-calidda.png"
      alt="Cálidda"
      width={width}
      height={height}
      priority={priority}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
