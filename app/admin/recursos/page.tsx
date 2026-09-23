"use client";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
const CARDS = ["Logo principal", "Logo blanco", "Banner campaña", "Ícono app"];
export default function RecursosPage() {
  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <h1 className="text-2xl font-extrabold mt-1">Recursos visuales</h1>
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">{CARDS.map((c) => (
      <div key={c} className="card p-5 text-center">
        <div className="h-24 rounded-2xl bg-[#F4F7FA] border flex items-center justify-center text-slate-300 text-3xl">🖼</div>
        <p className="font-bold text-sm mt-3">{c}</p>
        <button className="btn-white w-full mt-3 !py-1.5 !text-xs">Subir imagen</button>
      </div>))}
    </div>
  </Shell></AuthGate>);
}
