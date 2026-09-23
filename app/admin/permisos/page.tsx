"use client";
import { useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
const MODULOS = ["Dashboard", "Clientes", "Cotizaciones", "Materiales", "Tarifario", "Administración"];
const ROLES = ["ADMIN", "PROVEEDOR", "SUPERVISOR", "ASESOR"];
export default function PermisosPage() {
  const [open, setOpen] = useState<string | null>("Clientes");
  const [checks, setChecks] = useState<Record<string, boolean>>({ "Clientes-ADMIN": true, "Clientes-ASESOR": true });
  const tgl = (m: string, r: string) => setChecks((c) => ({ ...c, [`${m}-${r}`]: !c[`${m}-${r}`] }));
  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <h1 className="text-2xl font-extrabold mt-1">Permisos detallados</h1>
    <p className="text-xs text-slate-500 mt-1">Matriz por recurso · 4 roles · 6 módulos · 106 recursos · 139 concedidos.</p>
    <div className="space-y-3 mt-4">{MODULOS.map((m) => (
      <div key={m} className="card overflow-hidden">
        <button onClick={() => setOpen(open === m ? null : m)} className="w-full flex items-center justify-between px-5 py-3 font-bold text-sm">
          {m}<span className="text-slate-400">{open === m ? "−" : "+"}</span>
        </button>
        {open === m && (<div className="table-wrap !rounded-none !border-x-0 !border-b-0"><table className="tabla">
          <thead><tr><th>RECURSO</th>{ROLES.map((r) => <th key={r}>{r}</th>)}</tr></thead>
          <tbody>{[`${m}.ver`, `${m}.crear`, `${m}.editar`].map((rec) => (<tr key={rec}><td className="font-mono text-xs">{rec}</td>
            {ROLES.map((r) => (<td key={r}><input type="checkbox" checked={!!checks[`${m}-${r}`]} onChange={() => tgl(m, r)} className="h-4 w-4 accent-[#0099D8]" /></td>))}
          </tr>))}</tbody></table></div>)}
      </div>))}
    </div>
  </Shell></AuthGate>);
}
