"use client";

import { useMemo, useState } from "react";

const CUOTAS = [3, 6, 9, 12, 18, 24, 36, 48, 60];
const TEA = 0.4;

function cuotaMensual(capital: number, n: number) {
  if (capital <= 0) return 0;
  const i = Math.pow(1 + TEA, 1 / 12) - 1;
  return (capital * i) / (1 - Math.pow(1 + i, -n));
}

export default function CotizacionModal({ onClose }: { onClose: () => void }) {
  const [cuotas, setCuotas] = useState(9);
  const [inicial, setInicial] = useState(0);
  const [cliente, setCliente] = useState("");
  const [proveedor, setProveedor] = useState("IBR Peru S.A.");
  const [tel, setTel] = useState("");
  const [obs, setObs] = useState("");
  const [mat, setMat] = useState([{ nombre: "Cocina 4 hornillas — IBR", cant: 1, precio: 1299, dscto: 0 }]);

  const subtotal = mat.reduce((a, m) => a + m.cant * m.precio, 0);
  const descuento = mat.reduce((a, m) => a + m.dscto, 0);
  const total = subtotal - descuento;
  const capital = Math.max(total - inicial, 0);
  const sim = useMemo(() => CUOTAS.map((n) => ({ n, v: cuotaMensual(capital || 1800, n) })), [capital]);

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
            <button className="btn-green !py-2">Guardar cotización</button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <section>
            <h3 className="font-bold text-sm mb-3">Datos comerciales</h3>
            <div className="grid md:grid-cols-3 gap-3">
              <div><label className="label">Buscar cliente</label><input className="input" placeholder="Nombre o documento…" value={cliente} onChange={(e) => setCliente(e.target.value)} /></div>
              <div><label className="label">Proveedor</label>
                <select className="input" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                  <option>IBR Peru S.A.</option><option>Proveedor Demo S.A.C.</option>
                </select></div>
              <div><label className="label">Teléfono asesor</label><input className="input" placeholder="999 999 999" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">Materiales</h3>
              <button className="btn-white !py-1.5 !text-xs" onClick={() => setMat([...mat, { nombre: "Material adicional", cant: 1, precio: 500, dscto: 0 }])}>+ Agregar material</button>
            </div>
            <div className="table-wrap">
              <table className="tabla">
                <thead><tr><th>MATERIAL</th><th>CANT</th><th>PRECIO</th><th>DSCTO</th><th>VALOR</th><th>NETO</th></tr></thead>
                <tbody>
                  {mat.map((m, i) => (
                    <tr key={i}>
                      <td>{m.nombre}</td><td>{m.cant}</td><td>S/ {m.precio.toFixed(2)}</td>
                      <td>S/ {m.dscto.toFixed(2)}</td><td>S/ {(m.cant * m.precio).toFixed(2)}</td>
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
