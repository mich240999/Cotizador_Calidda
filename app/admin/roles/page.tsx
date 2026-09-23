"use client";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
const ROLES = [
  { n: "ADMIN", j: 20, a: "GLOBAL", d: "Acceso total a todos los módulos." },
  { n: "PROVEEDOR", j: 30, a: "EMPRESA", d: "Gestión de su empresa y oficinas." },
  { n: "SUPERVISOR", j: 40, a: "EQUIPO", d: "Supervisa asesores de su grupo." },
  { n: "ASESOR", j: 50, a: "PROPIO", d: "Opera sus propios clientes y cotizaciones." },
];
export default function RolesPage() {
  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <h1 className="text-2xl font-extrabold mt-1">Roles</h1>
    <div className="grid md:grid-cols-2 gap-4 mt-4">{ROLES.map((r) => (
      <div key={r.n} className="card p-5"><div className="flex items-center gap-2"><p className="font-extrabold">{r.n}</p>
      <span className="text-[11px] font-bold bg-sky-100 text-sky-700 rounded-lg px-2 py-0.5">Jerarquía {r.j}</span>
      <span className="text-[11px] font-bold bg-slate-100 text-slate-600 rounded-lg px-2 py-0.5">{r.a}</span></div>
      <p className="text-xs text-slate-500 mt-2">{r.d}</p></div>))}
    </div>
  </Shell></AuthGate>);
}
