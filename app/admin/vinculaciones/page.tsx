"use client";
import { useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
export default function VinculacionesPage() {
  const [open, setOpen] = useState(false);
  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="flex items-center justify-between mt-1"><h1 className="text-2xl font-extrabold">Proveedores y oficinas</h1><button className="btn-green" onClick={() => setOpen(true)}>+ Nueva vinculación</button></div>
    <div className="table-wrap mt-4"><table className="tabla"><thead><tr><th>ID</th><th>PROVEEDOR</th><th>OFICINA</th><th>VIGENCIA</th><th>ESTADO</th></tr></thead>
    <tbody><tr><td colSpan={5} className="text-center text-slate-400 py-10">Sin vinculaciones.</td></tr></tbody></table></div>
    {open && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-extrabold">Nueva vinculación</h2>
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3">⚠ Este vínculo es <b>inmutable</b>: una vez creado no puede editarse, solo finalizarse y crear uno nuevo.</div>
        <div className="grid gap-3 mt-4">
          <div><label className="label">Proveedor</label><select className="input"><option>IBR Peru S.A.</option></select></div>
          <div><label className="label">Oficina</label><select className="input"><option>OF-001 Lima Norte</option></select></div>
        </div>
        <div className="flex gap-2 mt-5"><button className="btn-white flex-1" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-green flex-1">Guardar vínculo</button></div>
      </div></div>)}
  </Shell></AuthGate>);
}
