"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import {
  apiOperacion,
  BadgeEstado,
  ESTADOS_COTIZACION,
  formatoFecha,
  formatoMoneda,
} from "@/components/Tablas";

type Item = {
  id?: string;
  cantidad: number;
  descripcion?: string;
  precio_unitario?: number;
  precio_unit?: number;
  descuento?: number;
  descuento_pct?: number;
  subtotal?: number;
  total_linea?: number;
  import?: number;
  materiales?: { codigo?: string; nombre?: string; unidad?: string } | null;
  material_id?: string | null;
};

type Cotizacion = {
  id: string;
  codigo?: string;
  numero?: string;
  estado: string;
  subtotal?: number;
  descuento?: number;
  igv?: number;
  total?: number;
  observaciones?: string | null;
  created_at?: string;
  cliente_id?: string;
  clientes?: {
    nombre?: string;
    nombres?: string;
    documento?: string;
    dni?: string;
    telefono?: string;
    direccion?: string;
    email?: string;
  } | null;
  items?: Item[];
};

function normCot(r: unknown): Cotizacion | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  // { cotizacion, cliente } de generarPDF, o cotizacion directa, o array
  if (o.cotizacion && typeof o.cotizacion === "object")
    return o.cotizacion as Cotizacion;
  if (Array.isArray(o.datos) && o.datos.length > 0)
    return o.datos[0] as Cotizacion;
  if (Array.isArray(r) && (r as unknown[]).length > 0)
    return (r as Cotizacion[])[0];
  return o as unknown as Cotizacion;
}

export default function CotizacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);
  const [emailDestino, setEmailDestino] = useState("");

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      // Backend no tiene obtenerCotizacion: listar + filtrar por id.
      // Se intenta generarPDF (retorna { cotizacion, cliente }) como fuente rica.
      let encontrada: Cotizacion | null = null;
      try {
        const g = await apiOperacion<{ cotizacion?: Cotizacion; cliente?: Cotizacion["clientes"] }>(
          "generarPDF",
          { cotizacion_id: id }
        );
        if (g?.cotizacion) {
          encontrada = { ...g.cotizacion, clientes: (g.cliente as Cotizacion["clientes"]) ?? g.cotizacion.clientes };
        }
      } catch {
        // sigue a plan B
      }
      if (!encontrada) {
        const lista = await apiOperacion<unknown>("listarCotizaciones", { limit: 500 });
        const arr: Cotizacion[] = Array.isArray(lista)
          ? (lista as Cotizacion[])
          : ((lista as { datos?: Cotizacion[] }).datos ?? []);
        encontrada = arr.find((c) => c.id === id) ?? null;
      }
      if (!encontrada) throw new Error("Cotización no encontrada");
      setCot(encontrada);
      if (encontrada?.clientes?.email) setEmailDestino(encontrada.clientes.email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cambiarEstado = async (estadoUpper: string) => {
    // Backend cambiarEstadoCotizacion exige UPPERCASE: BORRADOR|ENVIADA|APROBADA|RECHAZADA
    const estado = estadoUpper.toUpperCase();
    setAccionando(`estado:${estadoUpper}`);
    setError(null);
    try {
      await apiOperacion("cambiarEstadoCotizacion", { id, estado });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setAccionando(null);
    }
  };

  const enviarCorreo = async () => {
    if (!emailDestino.trim()) {
      setError("Ingresa el correo destino");
      return;
    }
    setAccionando("correo");
    setError(null);
    try {
      // POST directo con PDF real adjunto (buffer del builder, no texto plano).
      const res = await fetch(`/api/cotizaciones/${id}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: emailDestino.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "No se pudo enviar");
      alert(`Correo enviado con PDF adjunto (${json?.datos?.filename ?? "cotizacion.pdf"})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setAccionando(null);
    }
  };

  const regenerarPDF = async () => {
    setAccionando("regenerar");
    setError(null);
    try {
      await apiOperacion("regenerarPDF", { cotizacion_id: id });
      window.open(`/api/cotizaciones/${id}/pdf`, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo regenerar");
    } finally {
      setAccionando(null);
    }
  };

  const descargarPDF = () => {
    // PDF binario directo (jsPDF en servidor) — no pasa por /api/operacion.
    window.open(`/api/cotizaciones/${id}/pdf`, "_blank");
  };

  const items = cot?.items ?? [];
  const nombreCliente =
    cot?.clientes?.nombre ?? cot?.clientes?.nombres ?? "—";
  const docCliente = cot?.clientes?.documento ?? cot?.clientes?.dni ?? "—";

  const lineaImporte = (it: Item) => {
    if (it.total_linea != null) return Number(it.total_linea);
    if (it.subtotal != null) return Number(it.subtotal);
    const pu = Number(it.precio_unitario ?? it.precio_unit ?? 0);
    const desc = Number(it.descuento ?? it.descuento_pct ?? 0);
    return Number(it.cantidad) * pu * (1 - desc / 100);
  };

  const nombreItem = (it: Item) =>
    it.descripcion ??
    (it.materiales ? `${it.materiales.codigo ?? ""} ${it.materiales.nombre ?? ""}`.trim() : "—");

  return (
    <AuthGate>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/cotizaciones" className="btn-secondary text-sm no-print">
            ← Lista
          </Link>
          <h1 className="text-xl font-bold">
            Cotización {cot?.codigo ?? cot?.numero ?? id.slice(0, 8)}
          </h1>
          {cot && (
            <span className="ml-2">
              <BadgeEstado estado={String(cot.estado).toUpperCase()} />
            </span>
          )}
          <div className="ml-auto flex flex-wrap gap-2 no-print">
            <button
              onClick={regenerarPDF}
              disabled={!cot || accionando !== null}
              className="btn-secondary text-sm"
            >
              {accionando === "regenerar" ? "Regenerando…" : "Regenerar PDF"}
            </button>
            <button
              onClick={descargarPDF}
              disabled={!cot}
              className="btn-secondary text-sm"
            >
              Ver PDF
            </button>
          </div>
        </div>

        {loading && <div className="card p-8 text-slate-500">Cargando…</div>}
        {error && (
          <p className="card p-4 text-sm text-red-700 bg-red-50 border-red-200">
            {error}
          </p>
        )}

        {cot && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="card p-5">
                <h2 className="font-semibold mb-2">Cliente</h2>
                <p className="font-medium">{nombreCliente}</p>
                <p className="text-sm text-slate-600">
                  {docCliente !== "—" ? `Doc ${docCliente} · ` : ""}
                  {cot.clientes?.telefono ?? ""}
                </p>
                <p className="text-sm text-slate-600">{cot.clientes?.direccion ?? ""}</p>
                <p className="text-sm text-slate-600">{cot.clientes?.email ?? ""}</p>
                <p className="mt-3 text-xs text-slate-400">
                  Creada: {formatoFecha(cot.created_at)}
                </p>
                {cot.observaciones && (
                  <p className="mt-2 text-sm bg-slate-50 border rounded-lg p-2">
                    {cot.observaciones}
                  </p>
                )}
              </div>
              <div className="card p-5">
                <h2 className="font-semibold mb-2">Totales</h2>
                <dl className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Subtotal</dt>
                    <dd>{formatoMoneda(cot.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">IGV 18%</dt>
                    <dd>{formatoMoneda(cot.igv)}</dd>
                  </div>
                  <div className="flex justify-between text-lg border-t pt-2">
                    <dt className="font-bold">Total</dt>
                    <dd className="font-bold">{formatoMoneda(cot.total)}</dd>
                  </div>
                </dl>
                <div className="mt-4 space-y-2 no-print">
                  <label className="label">Cambiar estado</label>
                  <div className="flex flex-wrap gap-2">
                    {ESTADOS_COTIZACION.map((e) => (
                      <button
                        key={e}
                        disabled={accionando !== null || String(cot.estado).toUpperCase() === e}
                        onClick={() => cambiarEstado(e)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition disabled:opacity-40 ${
                          String(cot.estado).toUpperCase() === e
                            ? "bg-blue-700 text-white border-blue-700"
                            : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        {accionando === `estado:${e}` ? "…" : e}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="px-5 py-3 border-b font-semibold">Ítems</div>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Cant.</th>
                    <th>P. unit</th>
                    <th>Desc. %</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.id ?? i}>
                      <td>{nombreItem(it)}</td>
                      <td>{it.cantidad}</td>
                      <td>{formatoMoneda(it.precio_unitario ?? it.precio_unit)}</td>
                      <td>{it.descuento ?? it.descuento_pct ?? 0}%</td>
                      <td>{formatoMoneda(lineaImporte(it))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card p-5 no-print">
              <h2 className="font-semibold mb-2">Enviar por correo</h2>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="input flex-1"
                  placeholder="correo@cliente.com"
                  value={emailDestino}
                  onChange={(e) => setEmailDestino(e.target.value)}
                />
                <button
                  onClick={enviarCorreo}
                  disabled={accionando === "correo"}
                  className="btn-primary text-sm"
                >
                  {accionando === "correo" ? "Enviando…" : "Enviar correo"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Operaciones: <code>listarCotizaciones</code> ·{" "}
                <code>generarPDF</code> · <code>cambiarEstadoCotizacion</code> ·{" "}
                <code>enviarCorreo</code> · PDF directo{" "}
                <code>/api/cotizaciones/[id]/pdf</code>
              </p>
            </div>
          </>
        )}
      </div>
    </AuthGate>
  );
}
