"use client";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
export default function OficinasPage() {
  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="flex items-center justify-between mt-1"><h1 className="text-2xl font-extrabold">Oficinas de ventas</h1><button className="btn-green">+ Nueva oficina</button></div>
    <div className="table-wrap mt-4"><table className="tabla"><thead><tr><th>ID</th><th>CÓDIGO</th><th>NOMBRE</th><th>PROVEEDOR</th><th>ESTADO</th></tr></thead>
    <tbody><tr><td colSpan={5} className="text-center text-slate-400 py-10">Sin oficinas registradas.</td></tr></tbody></table></div>
  </Shell></AuthGate>);
}
