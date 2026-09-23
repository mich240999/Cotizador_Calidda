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

type Cliente = { id: string; nombres?: string; nombre?: string; nombre_razon_social?: string; dni?: string; nro_doc?: string; email?: string; correo?: string; telefono?: string };
type Proveedor = { id: string | number; nombre?: string; nombre_comercial?: string; razon_social?: string };
type Material = { id: string; codigo?: string; codigo_tmp?: string; nombre: string; descripcion?: string; precio_unit?: number; precio_vigente?: number };

type Fila = { material_id: string; nombre: string; descripcion: string; cant: number; precio: number; dsctoPct: number };

const FILA_VACIA: Fila = { material_id: "", nombre: "", descripcion: "", cant: 1, precio: 0, dsctoPct: 0 };

const nombreCliente = (c: Cliente) => c.nombres ?? c.nombre ?? c.nombre_razon_social ?? c.id;
const docCliente = (c: Cliente) => c.dni ?? c.nro_doc ?? "";
const mailCliente = (c: Cliente) => c.email ?? c.correo ?? "";
const nombreProv = (p: Proveedor) => p.nombre ?? p.nombre_comercial ?? p.razon_social ?? String(p.id);
const codMat = (m: Material) => m.codigo ?? m.codigo_tmp ?? "";
const precioMat = (m: Material) => Number(m.precio_vigente ?? m.precio_unit ?? 0);

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
  const [avisos, setAvisos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Carga tolerante: si un catálogo falla, los otros igual se muestran.
      // Clientes: SGT primero (mae_clientes), fallback a tabla base.
      const qp: Promise<unknown> = (async () => {
        try {
          const r = await apiOperacion<unknown>("listarClientesSGT", { limit: 500, pageSize: 500 });
          if (r && typeof r === "object" && Array.isArray((r as { rows?: unknown }).rows)) {
            return (r as { rows: unknown }).rows;
          }
          if (Array.isArray(r)) return r;
        } catch { /* fallback base */ }
        return apiOperacion<unknown>("listarClientes", { limit: 500 });
      })();
      const [rc, rp, rm] = await Promise.allSettled([
        qp,
        apiOperacion<unknown>("listarProveedoresSGT", { limit: 200 }),
        apiOperacion<unknown>("listarMaterialesSGT", { limit: 200 }),
      ]);
      if (!vivo) return;
      const warns: string[] = [];
      if (rc.status === "fulfilled" && Array.isArray(rc.value)) setClientes(rc.value as Cliente[]);
      else warns.push("No se pudieron cargar los clientes del backend.");
      if (rp.status === "fulfilled" && Array.isArray(rp.value)) setProveedores(rp.value as Proveedor[]);
      else warns.push("No se pudieron cargar los proveedores (ejecuta schema_sgt360.sql).");
      if (rm.status === "fulfilled" && Array.isArray(rm.value)) setMateriales(rm.value as Material[]);
      else warns.push("No se pudieron cargar los materiales con tarifa (ejecuta schema_sgt360.sql).");
      setAvisos(warns);
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const clientesFiltrados = useMemo(() => {
    const s = buscaCliente.trim().toLowerCase();
    if (!s) return clientes;
    return clientes.filter((c) =>
      [nombreCliente(c), docCliente(c), mailCliente(c)].join(" ").toLowerCase().includes(s)
    );
  }, [clientes, buscaCliente]);

  const clienteSel = useMemo(() => clientes.find((c) => String(c.id) === clienteId) ?? null, [clientes, clienteId]);

  const elegirMaterial = (i: number, materialId: string) => {
    const m = materiales.find((x) => String(x.id) === materialId);
    setMat((prev) =>
      prev.map((f, j) =>
        j === i
          ? {
              ...f,
              material_id: materialId,
              nombre: m ? `${codMat(m)} ${m.nombre}`.trim() : f.nombre,
              descripcion: m?.descripcion ?? "",
              precio: m ? precioMat(m) : f.precio,
            }
          : f
      )
    );
  };

  const setFila = (i: number, patch: Partial<Fila>) =>
    setMat((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const brutoFila = (f: Fila) => f.cant * f.precio;
  const netoFila = (f: Fila) => brutoFila(f) * (1 - Math.min(100, Math.max(0, f.dsctoPct)) / 100);

  const subtotal = mat.reduce((a, f) => a + brutoFila(f), 0);
  const descuento = mat.reduce((a, f) => a + (brutoFila(f) - netoFila(f)), 0);
  const total = subtotal - descuento;
  const capital = Math.max(total - inicial, 0);
  const sim = useMemo(() => CUOTAS.map((n) => ({ n, v: cuotaMensual(capital || 0, n) })), [capital]);

  const guardar = async () => {
    setError(null);
    setOk(null);
    if (!clienteId) {
      setError("Busca y selecciona un cliente activo.");
      return;
    }
    if (!proveedor) {
      setError("Selecciona un proveedor.");
      return;
    }
    if (mat.length === 0) {
      setError("Agrega al menos un material.");
      return;
    }
    for (const f of mat) {
      if (!f.material_id) {
        setError("Cada fila debe tener un material del catálogo.");
        return;
      }
      if (!(f.cant > 0)) {
        setError("Cada fila debe tener cantidad mayor a 0.");
        return;
      }
    }
    setGuardando(true);
    try {
      const items = mat.map((f) => ({
        material_id: f.material_id,
        cantidad: f.cant,
        precio_unit: f.precio,
        descuento_pct: Math.min(100, Math.max(0, f.dsctoPct)),
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
          items,
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
            <span className="text-[11px] font-bold bg-sky-100 text-sky-700 rounded-lg px-2 py-1">Pendiente de guardar</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-white !py-2" onClick={onClose}>Cerrar</button>
            <button className="btn-green !py-2" onClick={guardar} disabled={guardando || cargando}>{guardando ? "Guardando…" : "Guardar cotización"}</button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error && <p className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
          {ok && <p className="card p-3 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{ok}</p>}
          {avisos.map((a) => (
            <p key={a} className="card p-3 text-sm text-amber-800 bg-amber-50 border-amber-200">{a}</p>
          ))}
          {cargando && <p className="text-sm text-slate-500">Cargando catálogos del backend…</p>}

          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Datos comerciales</h3>
            <p className="text-xs text-slate-400 mb-3">Cliente, proveedor y asesor.</p>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="label">Buscar cliente</label>
                <input className="input" placeholder="Documento, nombre, correo o ID" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
              </div>
              <div>
                <label className="label">Proveedor</label>
                <select className="input" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {proveedores.map((p) => (
                    <option key={String(p.id)} value={nombreProv(p)}>{nombreProv(p)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Teléfono del asesor</label>
                <input className="input" placeholder="999 999 999" value={tel} onChange={(e) => setTel(e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className="label">Cliente seleccionado</label>
              <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">— Seleccionar cliente activo —</option>
                {clientesFiltrados.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {nombreCliente(c)}{docCliente(c) ? ` · ${docCliente(c)}` : ""}
                  </option>
                ))}
              </select>
              {!clienteSel ? (
                <div className="mt-2 rounded-xl bg-emerald-50/60 border border-emerald-100 p-3">
                  <p className="font-bold text-sm">Cliente no seleccionado</p>
                  <p className="text-xs text-slate-500">Busca y selecciona un cliente activo.</p>
                </div>
              ) : (
                <div className="mt-2 rounded-xl bg-emerald-50/60 border border-emerald-100 p-3">
                  <p className="font-bold text-sm uppercase">{nombreCliente(clienteSel)}</p>
                  <p className="text-xs text-slate-500">
                    {[docCliente(clienteSel), mailCliente(clienteSel), clienteSel.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="card !shadow-none p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="font-bold">Materiales</h3>
                <p className="text-xs text-slate-400">Agrega una línea y selecciona el material desde su lista desplegable. Los precios y datos se validan nuevamente al guardar.</p>
              </div>
              <button className="btn-white !py-1.5 !text-xs whitespace-nowrap" onClick={() => setMat((p) => [...p, { ...FILA_VACIA }])}>Agregar material</button>
            </div>
            <div className="table-wrap mt-3">
              <table className="tabla">
                <thead><tr><th>MATERIAL</th><th>CANT.</th><th>PRECIO</th><th>DSCTO. %</th><th>VALOR</th><th>NETO</th><th></th></tr></thead>
                <tbody>
                  {mat.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-slate-400 py-8">Agrega al menos un material.</td></tr>
                  )}
                  {mat.map((f, i) => (
                    <tr key={i}>
                      <td className="min-w-[220px]">
                        <select className="input !py-1" value={f.material_id} onChange={(e) => elegirMaterial(i, e.target.value)}>
                          <option value="">— Seleccionar —</option>
                          {materiales.map((x) => (
                            <option key={String(x.id)} value={String(x.id)}>
                              {`${codMat(x)} ${x.nombre} — S/ ${precioMat(x).toFixed(2)}`.trim()}
                            </option>
                          ))}
                        </select>
                        {f.descripcion && <p className="text-[11px] text-slate-400 mt-1 leading-snug">{f.descripcion}</p>}
                      </td>
                      <td><input type="number" min={0.01} step="any" className="input !w-20 !py-1" value={f.cant} onChange={(e) => setFila(i, { cant: Number(e.target.value) })} /></td>
                      <td className="whitespace-nowrap font-semibold text-emerald-700">S/ {f.precio.toFixed(2)}</td>
                      <td><input type="number" min={0} max={100} step="any" className="input !w-20 !py-1" value={f.dsctoPct} onChange={(e) => setFila(i, { dsctoPct: Number(e.target.value) })} /></td>
                      <td className="whitespace-nowrap">S/ {brutoFila(f).toFixed(2)}</td>
                      <td className="whitespace-nowrap font-bold text-emerald-700">S/ {netoFila(f).toFixed(2)}</td>
                      <td><button className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1" onClick={() => setMat((p) => p.filter((_, j) => j !== i))}>Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Resumen de importes</h3>
            <p className="text-xs text-slate-400 mb-3">Revisa los importes calculados antes de definir el financiamiento.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[["Subtotal", subtotal], ["Descuento", descuento], ["Total", total], ["Capital financiado", capital]].map(([label, v]) => (
                <div key={label as string} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-[11px] text-slate-400">{label}</p>
                  <p className="font-extrabold">S/ {(v as number).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Financiamiento</h3>
            <p className="text-xs text-slate-400 mb-3">La TEA predeterminada es 40% y puede ajustarse según la condición vigente.</p>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-bold text-sm">Parámetros de financiamiento</p>
              <p className="text-xs text-slate-400 mb-3">Define la cuota inicial, la TEA y el plazo seleccionado.</p>
              <div className="grid md:grid-cols-3 gap-3">
                <div><label className="label">Cuota inicial</label><input type="number" min={0} className="input" value={inicial} onChange={(e) => setInicial(Number(e.target.value))} /></div>
                <div><label className="label">TEA predeterminada</label><input className="input" value="40%" readOnly /><p className="text-[11px] text-slate-400 mt-1">Ingresa el porcentaje anual, por ejemplo 40%.</p></div>
                <div><label className="label">Cuotas seleccionadas</label>
                  <select className="input" value={cuotas} onChange={(e) => setCuotas(Number(e.target.value))}>
                    {CUOTAS.map((n) => <option key={n} value={n}>{n} cuotas</option>)}
                  </select></div>
              </div>
            </div>
          </section>

          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Simulación de cuotas</h3>
            <p className="text-xs text-slate-400 mb-3">Los importes monetarios se redondean a dos decimales.</p>
            <div className="table-wrap">
              <table className="tabla">
                <thead><tr><th>CUOTAS</th><th>VALOR CUOTA</th><th></th></tr></thead>
                <tbody>
                  {sim.map((s) => (
                    <tr key={s.n} className={s.n === cuotas ? "bg-sky-50" : ""}>
                      <td className="font-bold">{s.n}{s.n === cuotas && <span className="ml-2 text-[11px] font-bold bg-sky-500 text-white rounded-lg px-2 py-0.5">✓ Elegida</span>}</td>
                      <td className="font-semibold">S/ {s.v.toFixed(2)}</td>
                      <td>{s.n === cuotas ? null : <button className="text-xs text-[#0099D8] font-semibold" onClick={() => setCuotas(s.n)}>Elegir</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <label className="label">Observaciones generales</label>
            <textarea className="input min-h-[90px]" placeholder="Condiciones, consideraciones o comentarios para la cotización" value={obs} onChange={(e) => setObs(e.target.value)} />
          </section>
        </div>
      </div>
    </div>
  );
}
