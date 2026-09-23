"use client";

import React from "react";

/**
 * Tablas.tsx — helpers visuales + único acceso a datos.
 * TODA lectura/escritura va a POST /api/operacion { operacion, argumentos }.
 * No se usa Supabase directo desde client salvo auth (AuthGate/Navbar).
 */

export async function apiOperacion<T = unknown>(
  operacion: string,
  argumentos: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch("/api/operacion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operacion, argumentos }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Error en operación ${operacion}`);
  }
  // Backend real: { ok:true, datos } · compat: { ok, data } o data directa
  if (json && typeof json === "object" && "datos" in json) return json.datos as T;
  return (json?.data ?? json) as T;
}

export const ESTADOS_COTIZACION = [
  "BORRADOR",
  "ENVIADA",
  "APROBADA",
  "RECHAZADA",
] as const;

export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];

export function BadgeEstado({ estado }: { estado: string }) {
  const norm = String(estado ?? "").toUpperCase();
  const map: Record<string, string> = {
    BORRADOR: "bg-slate-100 text-slate-700 border-slate-200",
    ENVIADA: "bg-blue-50 text-blue-700 border-blue-200",
    APROBADA: "bg-green-50 text-green-700 border-green-200",
    RECHAZADA: "bg-red-50 text-red-700 border-red-200",
    ANULADA: "bg-slate-200 text-slate-600 border-slate-300",
  };
  const cls = map[norm] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {norm}
    </span>
  );
}

export function EmptyState({
  titulo,
  detalle,
}: {
  titulo: string;
  detalle?: string;
}) {
  return (
    <div className="card p-10 text-center">
      <p className="font-semibold text-slate-700">{titulo}</p>
      {detalle && <p className="mt-1 text-sm text-slate-500">{detalle}</p>}
    </div>
  );
}

export function TablaShell({
  children,
  titulo,
  acciones,
}: {
  children: React.ReactNode;
  titulo: string;
  acciones?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{titulo}</h1>
        <div className="ml-auto flex items-center gap-2">{acciones}</div>
      </div>
      <div className="table-wrap">{children}</div>
    </div>
  );
}

export function formatoMoneda(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return `S/ ${v.toFixed(2)}`;
}

export function formatoFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
