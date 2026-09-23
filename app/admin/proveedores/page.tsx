"use client";

import { useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";

export default function ProveedoresPage() {
  const [open, setOpen] = useState(false);
  const [ruc, setRuc] = useState("");
  return (
    <AuthGate><Shell>
      <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
      <div className="flex items-center justify-between mt-1">
        <h1 className="text-2xl font-extrabold">Proveedores</h1>
        <button className="btn-green" onClick={() => setOpen(true)}>+ Nuevo proveedor</button>
      </div>
      <div className="table-wrap mt-4">
        <table className="tabla">
          <thead><tr><th>ID</th><th>RUC</th><th>RAZÓN SOCIAL</th><th>NOMBRE COMERCIAL</th><th>ESTADO</th></tr></thead>
          <tbody><tr><td colSpan={5} className="text-center text-slate-400 py-10">Sin proveedores en vista local.</td></tr></tbody>
        </table>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl p-6">
            <h2 className="text-lg font-extrabold">Nuevo proveedor</h2>
            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <div><label className="label">Interlocutor</label><input className="input" placeholder="Código interlocutor SAP" /></div>
              <div><label className="label">RUC (11 dígitos)</label><input className="input" maxLength={11} value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, ""))} placeholder="20123456789" />
                {ruc && ruc.length !== 11 && <p className="text-[11px] text-red-500 mt-1">El RUC debe tener 11 dígitos.</p>}</div>
              <div className="md:col-span-2"><label className="label">Razón social</label><input className="input" /></div>
              <div><label className="label">Nombre comercial</label><input className="input" /></div>
              <div><label className="label">Correo</label><input className="input" /></div>
              <div><label className="label">Teléfono</label><input className="input" /></div>
              <div><label className="label">Estado</label><select className="input"><option>Activo</option><option>Inactivo</option></select></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-white flex-1" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-green flex-1">Registrar proveedor</button>
            </div>
          </div>
        </div>
      )}
    </Shell></AuthGate>
  );
}
