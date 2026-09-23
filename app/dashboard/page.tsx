"use client";

import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";

const CARDS = [
  { key: "COT", title: "Cotizaciones", desc: "Total registrado", total: 0, color: "bg-sky-100 text-sky-700", dot: "bg-[#0099D8]" },
  { key: "CON", title: "Contratos", desc: "Total registrado", total: 0, color: "bg-emerald-100 text-emerald-700", dot: "bg-[#00A651]" },
  { key: "PV", title: "Pedidos de venta", desc: "Total registrado", total: 0, color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
];

export default function DashboardPage() {
  return (
    <AuthGate>
      <Shell>
        <p className="text-[11px] font-bold tracking-[0.18em] text-slate-400">RESUMEN GENERAL</p>
        <h1 className="text-2xl font-extrabold mt-1">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Vista consolidada de la operación comercial.</p>
        <div className="grid gap-4 md:grid-cols-3 mt-6">
          {CARDS.map((c) => (
            <div key={c.key} className="card p-5">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-extrabold rounded-lg px-2 py-1 ${c.color}`}>{c.key}</span>
                <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
              </div>
              <p className="mt-3 font-bold text-slate-800">{c.title}</p>
              <p className="text-xs text-slate-400">{c.desc}</p>
              <p className="mt-2 text-3xl font-extrabold">{c.total}</p>
            </div>
          ))}
        </div>
        <div className="card p-6 mt-4 text-sm text-slate-500">
          Sin movimientos registrados. Los totales se actualizan al registrar cotizaciones, contratos y pedidos de venta.
        </div>
      </Shell>
    </AuthGate>
  );
}
