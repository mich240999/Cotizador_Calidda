"use client";

import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import CotizacionModal from "@/components/CotizacionModal";

type Row = {
  numero: string; cliente: string; proveedor: string; vendedor: string;
  estado: string; total: number; financiamiento: string; actualizacion: string;
};

const MOCK: Row[] = [
  { numero: "COT-2026-0001", cliente: "—", proveedor: "IBR Peru S.A.", vendedor: "MS ADMIN", estado: "Pendiente", total: 0, financiamiento: "9 cuotas S/ 0.00", actualizacion: "23/09/2026" },
];

export default function CotizacionesPage() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rows = useMemo(() => MOCK.filter((r) => r.numero.toLowerCase().includes(q.toLowerCase())), [q]);

  return (
    <AuthGate>
      <Shell>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-slate-400">GESTIÓN COMERCIAL</p>
            <h1 className="text-2xl font-extrabold mt-1">Cotizaciones</h1>
          </div>
          <button className="btn-green" onClick={() => setOpen(true)}>+ Nueva cotización</button>
        </div>

        <div className="card p-4 mt-4 flex flex-wrap gap-3">
          <input className="input !w-64" placeholder="Buscar por número o cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input !w-44"><option>Estado: Todos</option><option>Pendiente</option><option>Aprobada</option></select>
          <select className="input !w-44"><option>Proveedor: Todos</option><option>IBR Peru S.A.</option></select>
          <button className="btn-white !py-2">Limpiar filtros</button>
        </div>

        <div className="table-wrap mt-4">
          <table className="tabla">
            <thead><tr><th>NÚMERO</th><th>CLIENTE</th><th>PROVEEDOR</th><th>USUARIO DE VENTA</th><th>ESTADO</th><th>TOTAL</th><th>FINANCIAMIENTO</th><th>ACTUALIZACIÓN</th><th>ACCIONES</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.numero}>
                  <td className="font-bold text-[#0099D8]">{r.numero}</td>
                  <td>{r.cliente}</td><td>{r.proveedor}</td><td>{r.vendedor}</td>
                  <td><span className="text-[11px] font-bold bg-amber-100 text-amber-700 rounded-lg px-2 py-1">{r.estado}</span></td>
                  <td>S/ {r.total.toFixed(2)}</td><td>{r.financiamiento}</td><td>{r.actualizacion}</td>
                  <td><button className="btn-white !py-1 !px-3 !text-xs" onClick={() => setOpen(true)}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {open && <CotizacionModal onClose={() => setOpen(false)} />}
      </Shell>
    </AuthGate>
  );
}
