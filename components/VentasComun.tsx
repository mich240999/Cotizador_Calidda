"use client";

import { useEffect, useState } from "react";
import { apiOperacion } from "./Tablas";
import { cuotaFrancesaConIgv } from "@/lib/financiamiento";

/**
 * VentasComun — tipos, helpers y piezas compartidas del módulo Registro de Ventas.
 * Todo acceso a datos va por apiOperacion (envelope {ok, datos}).
 * Si la operación backend aún no existe, el error se muestra sin romper el UI.
 */

export const TEA_FIJA = 0.4;

/** Cuota según Simulador_CuotasAMCA.xlsx (PMT + IGV del interés mensual). */
export function cuotaMensual(capital: number, n: number, tea = TEA_FIJA, igv = 0.18) {
  if (!(capital > 0) || !(n > 0)) return 0;
  return cuotaFrancesaConIgv(capital, tea, n, igv);
}

/** Sube un archivo a Supabase Storage vía /api/uploads y devuelve la URL pública corta.
 *  carpetas: adjuntos | comprobantes | sustentos. Lanza Error con el mensaje del servidor.
 */
export async function subirArchivoStorage(
  f: File,
  carpeta: "adjuntos" | "comprobantes" | "sustentos" = "adjuntos"
): Promise<string> {
  const fd = new FormData();
  fd.append("file", f, f.name);
  fd.append("carpeta", carpeta);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false || !json?.url) {
    throw new Error(json?.error || "No se pudo subir el archivo");
  }
  return String(json.url);
}

/** Convierte un archivo a dataURL/base64 (respaldo cuando no hay Storage). */
export function fileToDataURL(f: File, maxMB = 6): Promise<string> {
  return new Promise((resolve, reject) => {
    if (f.size > maxMB * 1024 * 1024) {
      reject(new Error(`Archivo muy pesado (máx ${maxMB} MB). Usa un PDF/foto más liviano o pega una URL.`));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(f);
  });
}

/** Detecta el rol real del usuario para mostrar las acciones disponibles. */
export function useRolVista() {
  const [detectado, setDetectado] = useState(false);
  const [rol, setRol] = useState("");
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const respuesta = await fetch("/api/mi-perfil", { cache: "no-store" });
        const perfil = await respuesta.json();
        if (!respuesta.ok || !perfil?.ok) return;
        if (vivo) {
          setRol(String(perfil.rol).toUpperCase());
          setDetectado(true);
        }
      } catch {
        /* sin permiso admin → vista vendedor */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);
  return { rol, esAdmin: rol === "ADMIN", esProveedor: rol === "PROVEEDOR", detectado };
}

export type Venta = Record<string, unknown>;

const str = (v: unknown, fb = "—") => {
  const s = String(v ?? "").trim();
  return s ? s : fb;
};
const num = (v: unknown) => Number(v ?? 0) || 0;

export const ventaId = (v: Venta) => str(v.id ?? v.venta_id, "");
export const ventaNumero = (v: Venta) => str(v.numero ?? v.codigo ?? v.id);
export const ventaCliente = (v: Venta) =>
  str(v.cliente_nombre ?? v.cliente ?? v.nombres ?? v.nombre_razon_social);
export const ventaDoc = (v: Venta) => str(v.documento ?? v.dni ?? v.nro_doc ?? v.ruc, "");
export const ventaProveedor = (v: Venta) => str(v.proveedor ?? v.microaliado ?? v.contratista);
export const ventaCanal = (v: Venta) => str(v.canal, "—").toLowerCase();
export const ventaEstado = (v: Venta) => str(v.estado, "BORRADOR").toUpperCase();
export const ventaTotal = (v: Venta) => num(v.total ?? v.monto_total ?? v.importe_total);
export const ventaFecha = (v: Venta) => str(v.updated_at ?? v.actualizado ?? v.created_at, "");
export const ventaItems = (v: Venta): Venta[] =>
  Array.isArray(v.items) ? (v.items as Venta[]) : Array.isArray(v.detalle) ? (v.detalle as Venta[]) : [];
export const ventaAbonos = (v: Venta): Venta[] =>
  Array.isArray(v.abonos) ? (v.abonos as Venta[]) : [];
export const ventaObservaciones = (v: Venta): Venta[] =>
  Array.isArray(v.observaciones) ? (v.observaciones as Venta[]) : [];

export const ESTADOS_VENTA = [
  "borrador",
  "pendiente_aprobacion",
  "observado",
  "aprobada",
  "generada",
  "en_instalacion",
  "instalada",
  "validada_proveedor",
  "cerrada",
  "liquidada",
] as const;
export const CANALES_VENTA = ["proveedor", "microaliado", "contratista"] as const;

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "BORRADOR",
  pendiente_aprobacion: "PENDIENTE APROBACIÓN",
  observado: "OBSERVADO",
  subsanado_pendiente: "SUBSANADO · POR REVISAR",
  aprobada: "APROBADA",
  en_instalacion: "EN INSTALACIÓN",
  instalada: "INSTALADA · POR REVISAR",
  validada_proveedor: "VALIDADA PROVEEDOR",
  cerrada: "CERRADA",
  pendiente_liquidar: "PENDIENTE LIQUIDAR",
  liquidada: "LIQUIDADA",
};

export const etiquetaEstado = (e: string) => {
  const k = String(e ?? "").toLowerCase();
  return ETIQUETA_ESTADO[k] ?? String(e ?? "").toUpperCase().replace(/_/g, " ");
};

export function BadgeEstadoVenta({ estado }: { estado: string }) {
  const norm = String(estado ?? "").toLowerCase();
  const map: Record<string, string> = {
    borrador: "bg-slate-100 text-slate-700 border-slate-200",
    pendiente_aprobacion: "bg-amber-50 text-amber-700 border-amber-200",
    observado: "bg-orange-50 text-orange-700 border-orange-200",
    subsanado_pendiente: "bg-amber-50 text-amber-800 border-amber-300",
    aprobada: "bg-green-50 text-green-700 border-green-200",
    generada: "bg-teal-50 text-teal-700 border-teal-200",
    pendiente_liquidar: "bg-purple-50 text-purple-700 border-purple-200",
    pendiente_instalar: "bg-slate-100 text-slate-500 border-slate-200",
    en_instalacion: "bg-blue-50 text-blue-700 border-blue-200",
    instalada: "bg-blue-50 text-blue-700 border-blue-200",
    validada_proveedor: "bg-teal-50 text-teal-700 border-teal-200",
    cerrada: "bg-emerald-50 text-emerald-800 border-emerald-300",
    liquidada: "bg-emerald-100 text-emerald-900 border-emerald-400",
  };
  const cls = map[norm] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {etiquetaEstado(estado)}
    </span>
  );
}

const ETAPAS = ["BORRADOR", "GENERADA", "APROBADA", "EN INSTALACIÓN", "LIQUIDADA"] as const;

function etapaIndex(estado: string): number {
  const n = String(estado ?? "").toLowerCase();
  if (n === "cerrada" || n === "liquidada") return 4;
  if (["en_instalacion", "instalada", "validada_proveedor"].includes(n)) return 3;
  if (n === "aprobada") return 2;
  if (["generada", "pendiente_aprobacion", "observado"].includes(n)) return 1;
  return 0;
}

export function TimelineVenta({ estado }: { estado: string }) {
  const idx = etapaIndex(String(estado ?? ""));
  if (idx < 0)
    return (
      <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
        Solicitud {String(estado).toUpperCase()} — flujo detenido.
      </p>
    );
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {ETAPAS.map((e, i) => {
        const done = i < idx;
        const cur = i === idx;
        return (
          <li key={e} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                cur
                  ? "bg-[#0099D8] text-white border-[#0099D8]"
                  : done
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-50 text-slate-400 border-slate-200"
              }`}
            >
              {done ? "✓ " : ""}
              {e}
            </span>
            {i < ETAPAS.length - 1 && <span className="text-slate-300 font-bold">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

export const MEDIOS_ABONO = ["efectivo", "tarjeta"] as const;
export const ESTADOS_ABONO = ["pendiente", "efectuado", "validado"] as const;

export function BadgeAbono({ estado }: { estado: string }) {
  const n = String(estado ?? "").toLowerCase();
  const cls =
    n === "validado"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : n === "efectuado"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {n.toUpperCase()}
    </span>
  );
}

export const SUSTENTOS_INSTALACION = [
  { key: "foto_antes_url", tipo: "foto_antes", label: "Foto antes" },
  { key: "foto_durante_url", tipo: "foto_durante", label: "Foto durante" },
  { key: "foto_despues_url", tipo: "foto_despues", label: "Foto después" },
  { key: "foto_dni_url", tipo: "foto_dni", label: "Foto del DNI" },
  { key: "foto_cliente_dni_url", tipo: "foto_cliente_dni", label: "Cliente con su DNI" },
  { key: "boleta_url", tipo: "boleta", label: "Boleta de venta" },
  { key: "acta_url", tipo: "acta", label: "Acta de conformidad firmada" },
] as const;

export const ETIQUETA_EVIDENCIA: Record<string, string> = Object.fromEntries(
  SUSTENTOS_INSTALACION.map((s) => [s.tipo, s.label])
);

export function BadgeEvidencia({ estado }: { estado: string }) {
  const n = String(estado ?? "pendiente").toLowerCase();
  const cls =
    n === "aprobado"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : n === "rechazado"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {n.toUpperCase()}
    </span>
  );
}
