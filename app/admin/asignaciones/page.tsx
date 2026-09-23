"use client";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
const TABS = ["Vigentes (0)", "Programadas (0)", "Finalizadas (0)", "Canceladas (0)"];
export default function AsignacionesPage() {
  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <h1 className="text-2xl font-extrabold mt-1">Asignaciones asesores</h1>
    <div className="flex gap-2 mt-3">{TABS.map((t, i) => (<button key={t} className={`px-4 py-2 rounded-xl text-sm font-semibold ${i === 0 ? "bg-[#0099D8] text-white" : "bg-white border text-slate-600"}`}>{t}</button>))}</div>
    <div className="card p-8 mt-4 text-center text-sm text-slate-400">0 asignaciones en esta bandeja.</div>
  </Shell></AuthGate>);
}
