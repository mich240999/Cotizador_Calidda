"use client";

import { useEffect, useMemo, useState } from "react";
import { apiOperacion } from "./Tablas";

const CUOTAS = [3, 6, 9, 12, 18, 24, 36, 48, 60];
const TEA = 0.4;

function cuotaMensual(capital: number, n: number) {
  if (capital <= 0) return 0;
  const i = Math.pow(1 + TEA, 1 / 12) - 1;
  return (capital * i) / (1 - Math.pow(1 + i, -n));
}

type Cliente = { id: string; nombres?: string; nombre?: string };
type Proveedor = { id: string | number; nombre: string };
type Material = { id: string; codigo?: string; nombre: string; precio_unit?: number; precio_vigente?: number };

type Fila = { material_id: string; nombre: string; cant: number; precio: number; dscto: number };

const FILA_VACIA: Fila = { material_id: "", nombre: "", cant: 1, precio: 0, dscto: 0 };

export default function CotizacionModal({ onClose }: { onClose: () => void }) {
  const [cuotas, setCuotas] = useState(9);
  const [inicial, setInicial] = useState(0);
  const [clienteId, setClienteId] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [tel, setTel] = useState("");
  const [obs, setObs] = useState("");
  const [mat, setMat] = useState<Fila[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [c, p, m] = await Promise.all([
          apiOperacion<unknown>("listarClientes", { limit: 200 }),
          apiOperacion<unknown>("listarProveedoresSGT", { limit: 200 }),
          apiOperacion<unknown>("listarMaterialesSGT", { limit: 200 }),
        ]);
        if (!vivo) return;
        setClientes(Array.isArray(c) ? (c as Cliente[]) : []);
        const provs = Array.isArray(p) ? (p as Proveedor[]) : [];
        setProveedores(provs);
        setMateriales(Array.isArray(m) ? (m as Material[]) : []);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo cargar catálogos");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const clientesFiltrados = useMemo(() => {
    const s = buscaCliente.toLowerCase();
    if (!s) return clientes;
    return clientes.filter((c) =>
      String(c.nombres ?? c.nombre ?? "").toLowerCase().includes(s)
    );
  }, [clientes, buscaCliente]);

  const elegirMaterial = (i: number, materialId: string) => {
    const m = materiales.find((x) => x.id === materialId);
    setMat((prev) =>
      prev.map((f, j) =>
        j === i
          ? {
              ...f,
              material_id: materialId,
              nombre: m ? `${m.codigo ?? ""} ${m.nombre}`.trim() : f.nombre,
              precio: m ? Number(m.precio_vigente ?? m.precio_unit ?? 0) : f.precio,
            }
          : f
      )
    );
  };

  const subtotal = mat.reduce((a, m) => a + m.cant * m.precio, 0);
  const descuento = mat.reduce((a, m) => a + m.dscto, 0);
  const total = subtotal - descuento;
  const capital = Math.max(total - inicial, 0);
  const sim = useMemo(() => CUOTAS.map((n) => ({ n, v: cuotaMensual(capital || 0, n) })), [capital]);

  const guardar = async () => {
    setError(null);
    setOk(null);
    if (!clienteId) {
      setError("Selecciona un cliente del backend");
      return;
    }
    if (mat.length === 0) {
      setError("Agrega al menos un material");
      return;
    }
    for (const f of mat) {
      if (!f.material_id) {
        setError("Cada fila debe tener un material del catálogo");
        return;
      }
      if (!(f.cant > 0)) {
        setError("Cada fila debe tener cantidad mayor a 0");
        return;
      }
    }
    setGuardando(true);
    try {
      const items = mat.map((f) => ({
        material_id: f.material_id,
        cantidad: f.cant,
        precio_unit: f.precio,
        descuento_pct: 0,
      }));
      let creada: unknown = null;
      try {
        creada = await apiOperacion("crearCotizacionSGT", {
          cliente_id: clienteId,
          items,
          cuota_inicial: inicial,
          tea: 40,
          plazo: cuotas,
          proveedor,
          asesor: tel,
          observaciones: obs,
        });
      } catch {
        creada = await apiOperacion("crearCotizacion", {
          cliente_id: clienteId,
          items: items.map((it) => ({ ...it, material_id: it.material_id })),
          observaciones: obs,
        });
      }
      const cod = (creada as { codigo?: string; numero?: string })?.codigo ?? (creada as { numero?: string })?.numero ?? "";
      setOk(cod ? `Cotización guardada: ${cod}` : "Cotización guardada");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-xl my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-extrabold">Nueva cotización</h2>
            <span className="text-[11px] font-bold bg-amber-100 text-amber-700 rounded-lg px-2 py-1">Pendiente de guardar</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-white !py-2" onClick={onClose}>Cerrar</button>
            <button className="btn-green !py-2" onClick={guardar} disabled={guardando || cargando}>{guardando ? "Guardando…" : "Guardar cotización"}</button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error && <p className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
          {ok && <p className="card p-3 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{ok}</p>}
          {cargando && <p className="text-sm text-slate-500">Cargando catálogos del backend…</p>}

          <section>
            <h3 className="font-bold text-sm mb-3">Datos comerciales</h3>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="label">Buscar cliente</label>
                <input className="input" placeholder="Nombre o documento…" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
                <select className="input mt-2" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">Seleccionar cliente…</option>
                  {clientesFiltrados.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombres ?? c.nombre ?? c.id}</option>
                  ))}
                </select>
              </div>
              <div><label className="label">Proveedor</label>
                <select className="input" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                  <option value="">Seleccionar…</option>
                  {proveedores.map((p) => (
                    <option key={String(p.id)} value={p.nombre}>{p.nombre}</option>
                  ))}
                </select></div>
              <div><label className="label">Teléfono asesor</label><input className="input" placeholder="999 999 999" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">Materiales</h3>
              <button className="btn-white !py-1.5 !text-xs" onClick={() => setMat([...mat, { ...FILA_VACIA }])}>+ Agregar material</button>
            </div>
            <div className="table-wrap">
              <table className="tabla">
                <thead><tr><th>MATERIAL</th><th>CANT</th><th>PRECIO</th><th>DSCTO</th><th>VALOR</th><th>NETO</th></tr></thead>
                <tbody>
                  {mat.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-slate-400 py-8">Sin materiales — usa «Agregar material» y elige del catálogo.</td></tr>
                  )}
                  {mat.map((m, i) => (
                    <tr key={i}>
                      <td>
                        <select className="input !py-1" value={m.material_id} onChange={(e) => elegirMaterial(i, e.target.value)}>
                          <option value="">Seleccionar…</option>
                          {materiales.map((x) => (
                            <option key={x.id} value={x.id}>{`${x.codigo ?? ""} ${x.nombre} — S/ ${Number(x.precio_vigente ?? x.precio_unit ?? 0).toFixed(2)}`.trim()}</option>
                          ))}
                        </select>
                      </td>
                      <td><input type="number" min={1} className="input !w-20 !py-1" value={m.cant} onChange={(e) => setMat((prev) => prev.map((f, j) => (j === i ? { ...f, cant: Number(e.target.value) } : f)))} /></td>
                      <td>S/ {m.precio.toFixed(2)}</td>
                      <td>S/ {m.dscto.toFixed(2)}</td>
                      <td>S/ {(m.cant * m.precio).toFixed(2)}</td>
                      <td className="font-bold">S/ {(m.cant * m.precio - m.dscto).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid md:grid-cols-2 gap-4">
            <section className="card !shadow-none p-4">
              <h3 className="font-bold text-sm mb-3">Resumen importes</h3>
              <div className="text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>S/ {subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Descuento</span><span>S/ {descuento.toFixed(2)}</span></div>
                <div className="flex justify-between font-extrabold text-base border-t pt-2"><span>Total</span><span>S/ {total.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Capital financiado</span><span>S/ {capital.toFixed(2)}</span></div>
              </div>
            </section>
            <section className="card !shadow-none p-4">
              <h3 className="font-bold text-sm mb-3">Financiamiento</h3>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Cuota inicial (S/)</label><input type="number" className="input" value={inicial} onChange={(e) => setInicial(Number(e.target.value))} /></div>
                <div><label className="label">TEA</label><input className="input" value="40%" readOnly /></div>
                <div><label className="label">Cuotas</label>
                  <select className="input" value={cuotas} onChange={(e) => setCuotas(Number(e.target.value))}>
                    {CUOTAS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select></div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Rango permitido: 3 a 60 cuotas.</p>
            </section>
          </div>

          <section>
            <h3 className="font-bold text-sm mb-3">Simulación cuotas</h3>
            <div className="table-wrap">
              <table className="tabla">
                <thead><tr><th>CUOTAS</th><th>VALOR CUOTA</th><th>ESTADO</th></tr></thead>
                <tbody>
                  {sim.map((s) => (
                    <tr key={s.n} className={s.n === cuotas ? "bg-emerald-50" : ""}>
                      <td className="font-bold">{s.n}</td>
                      <td>S/ {s.v.toFixed(2)}</td>
                      <td>{s.n === cuotas
                        ? <span className="text-[11px] font-bold bg-emerald-100 text-emerald-700 rounded-lg px-2 py-1">Elegida</span>
                        : <button className="text-xs text-[#0099D8] font-semibold" onClick={() => setCuotas(s.n)}>Elegir</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <label className="label">Observaciones generales</label>
            <textarea className="input min-h-[90px]" placeholder="Condiciones, instalación, garantías…" value={obs} onChange={(e) => setObs(e.target.value)} />
          </section>
        </div>
      </div>
    </div>
  );
}
