"use client";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
const GRUPOS = [
  { cod: "GVE0001", nombre: "AMX FFVV", n: 8 },
  { cod: "GVE0002", nombre: "IBR FFVV", n: 5 },
  { cod: "GVE0003", nombre: "CALIDDA DIRECTA", n: 4 },
];
export default function GruposPage() {
  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="flex items-center justify-between mt-1"><h1 className="text-2xl font-extrabold">Grupos vendedores</h1><button className="btn-green">+ Nuevo grupo</button></div>
    <div className="grid md:grid-cols-3 gap-4 mt-4">{GRUPOS.map((g) => (
      <div key={g.cod} className="card p-5"><p className="text-[11px] font-extrabold text-[#0099D8]">{g.cod}</p><p className="font-bold mt-1">{g.nombre}</p><p className="text-xs text-slate-400">{g.n} asesores</p></div>))}
    </div>
  </Shell></AuthGate>);
}
