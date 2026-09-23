"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiOperacion } from "./Tablas";

type Cliente = {
  id: string;
  nombre?: string | null;
  nombres?: string | null;
  documento?: string | null;
  dni?: string | null;
};

type Material = {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  precio?: number | null;
  precio_unit?: number | null;
  precio_unitario?: number | null;
  stock: number;
};

type ItemForm = {
  material_id: string;
  cantidad: number;
  descuento: number; // % 0-100 (UI). Backend no tiene descuento por ítem → se prorratea en precio.
};

const IGV_RATE = 0.18;

function normArray<T>(r: unknown, key: string): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    if (Array.isArray(o.datos)) return o.datos as T[];
    if (Array.isArray(o.data)) return o.data as T[];
    if (Array.isArray(o[key])) return o[key] as T[];
  }
  return [];
}

const precioDe = (m: Material) =>
  Number(m.precio ?? m.precio_unit ?? m.precio_unitario ?? 0);
const nombreCliente = (c: Cliente) =>
  c.nombre ?? c.nombres ?? "—";
const docCliente = (c: Cliente) => c.documento ?? c.dni ?? "";

/**
 * CotizadorForm — selector cliente + items (material/cantidad/descuento),
 * cálculo subtotal / IGV 18% / total en vivo, POST a /api/operacion.
 *
 * Backend crearCotizacion: { cliente_id, items: [{ material_id?, descripcion,
 * cantidad, precio_unitario }], observaciones, descuento }
 * → el descuento % por ítem de la UI se convierte a precio_unitario efectivo.
 */
export default function CotizadorForm() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<ItemForm[]>([
    { material_id: "", cantidad: 1, descuento: 0 },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, m] = await Promise.all([
          apiOperacion<unknown>("listarClientes", { limit: 500 }),
          apiOperacion<unknown>("listarMateriales", {}),
        ]);
        setClientes(normArray<Cliente>(c, "clientes"));
        setMateriales(normArray<Material>(m, "materiales"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar datos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const matById = useMemo(() => {
    const map = new Map<string, Material>();
    materiales.forEach((m) => map.set(m.id, m));
    return map;
  }, [materiales]);

  const totales = useMemo(() => {
    let subtotal = 0;
    items.forEach((it) => {
      const mat = matById.get(it.material_id);
      if (!mat) return;
      const cant = Math.max(0, Number(it.cantidad) || 0);
      const desc = Math.min(100, Math.max(0, Number(it.descuento) || 0));
      subtotal += precioDe(mat) * cant * (1 - desc / 100);
    });
    const igv = subtotal * IGV_RATE;
    return { subtotal, igv, total: subtotal + igv };
  }, [items, matById]);

  const setItem = (idx: number, patch: Partial<ItemForm>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () =>
    setItems((prev) => [...prev, { material_id: "", cantidad: 1, descuento: 0 }]);

  const removeItem = (idx: number) =>
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const guardar = async () => {
    setError(null);
    if (!clienteId) {
      setError("Selecciona un cliente");
      return;
    }
    const itemsValidos = items.filter((i) => i.material_id && i.cantidad > 0);
    if (itemsValidos.length === 0) {
      setError("Agrega al menos un ítem con material y cantidad");
      return;
    }
    setSaving(true);
    try {
      const payloadItems = itemsValidos.map((i) => {
        const mat = matById.get(i.material_id);
        const desc = Math.min(100, Math.max(0, Number(i.descuento) || 0));
        const base = mat ? precioDe(mat) : 0;
        return {
          material_id: i.material_id,
          cantidad: Number(i.cantidad),
          precio_unit: Number(base.toFixed(2)),
          descuento_pct: desc,
        };
      });
      const resp = await apiOperacion<{ id?: string; codigo?: string }>(
        "crearCotizacion",
        {
          cliente_id: clienteId,
          observaciones,
          validez_dias: 15,
          items: payloadItems,
        }
      );
      const id = (resp as { id?: string })?.id;
      if (id) router.push(`/cotizaciones/${id}`);
      else router.push("/cotizaciones");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="card p-8 text-slate-500">Cargando…</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold">Cliente</h2>
          <div>
            <label className="label">Cliente</label>
            <select
              className="input"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {nombreCliente(c)} {docCliente(c) ? `· ${docCliente(c)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Observaciones</label>
            <textarea
              className="input"
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. Instalación incluye traslado…"
            />
          </div>
        </div>

        <div className="card p-5 space-y-3">
          <div className="flex items-center">
            <h2 className="font-semibold">Ítems</h2>
            <button onClick={addItem} className="btn-secondary ml-auto text-sm !py-1">
              + Agregar
            </button>
          </div>
          {items.map((it, idx) => {
            const mat = matById.get(it.material_id);
            const linea = mat
              ? precioDe(mat) * (Number(it.cantidad) || 0) * (1 - (Number(it.descuento) || 0) / 100)
              : 0;
            return (
              <div key={idx} className="grid gap-2 md:grid-cols-[1fr_90px_90px_110px_32px] items-end border rounded-lg p-3 bg-slate-50">
                <div>
                  <label className="label">Material</label>
                  <select
                    className="input"
                    value={it.material_id}
                    onChange={(e) => setItem(idx, { material_id: e.target.value })}
                  >
                    <option value="">— Seleccionar —</option>
                    {materiales.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo} · {m.nombre} · S/ {precioDe(m).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Cant.</label>
                  <input
                    type="number"
                    min={1}
                    className="input"
                    value={it.cantidad}
                    onChange={(e) => setItem(idx, { cantidad: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">Desc. %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input"
                    value={it.descuento}
                    onChange={(e) => setItem(idx, { descuento: Number(e.target.value) })}
                  />
                </div>
                <div className="text-sm text-right font-medium">
                  <span className="label">Subtotal</span>S/ {linea.toFixed(2)}
                </div>
                <button
                  onClick={() => removeItem(idx)}
                  className="btn-secondary !px-2"
                  title="Quitar"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5 h-fit space-y-3 lg:sticky lg:top-4">
        <h2 className="font-semibold">Resumen (en vivo)</h2>
        <dl className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <dt className="text-slate-500">Subtotal</dt>
            <dd className="font-medium">S/ {totales.subtotal.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">IGV 18%</dt>
            <dd className="font-medium">S/ {totales.igv.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between text-base border-t pt-2">
            <dt className="font-semibold">Total</dt>
            <dd className="font-bold">S/ {totales.total.toFixed(2)}</dd>
          </div>
        </dl>
        {error && (
          <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">
            {error}
          </p>
        )}
        <button onClick={guardar} disabled={saving} className="btn-primary w-full">
          {saving ? "Guardando…" : "Guardar cotización"}
        </button>
        <p className="text-[11px] text-slate-400">
          POST a <code>/api/operacion</code> · operacion{" "}
          <code>crearCotizacion</code>
        </p>
      </div>
    </div>
  );
}
