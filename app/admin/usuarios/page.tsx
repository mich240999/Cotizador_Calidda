"use client";

import { useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";

function NuevoUsuarioModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-extrabold">Nuevo usuario</h2>
        <div className="grid md:grid-cols-2 gap-3 mt-4">
          <div><label className="label">Tipo doc</label><select className="input"><option>DNI</option><option>CE</option><option>PAS</option></select></div>
          <div><label className="label">Nro doc</label><input className="input" placeholder="8 dígitos" /></div>
          <div className="md:col-span-2"><label className="label">Nombre completo</label><input className="input" placeholder="Nombres y apellidos" /></div>
          <div><label className="label">Correo</label><input className="input" placeholder="usuario@empresa.pe" /></div>
          <div><label className="label">Teléfono</label><input className="input" placeholder="999 999 999" /></div>
          <div><label className="label">Rol</label><select className="input"><option>ADMIN</option><option>PROVEEDOR</option><option>SUPERVISOR</option><option>ASESOR</option></select></div>
          <div><label className="label">Empresa (RUC - SAP)</label><input className="input" placeholder="RUC · código SAP" /></div>
          <div><label className="label">Estado</label><select className="input"><option>Activo</option><option>Inactivo</option></select></div>
        </div>
        <div className="flex gap-2 mt-5">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1">Registrar usuario</button>
        </div>
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const [open, setOpen] = useState(false);
  return (
    <AuthGate><Shell>
      <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
      <div className="flex items-center justify-between mt-1">
        <h1 className="text-2xl font-extrabold">Usuarios</h1>
        <button className="btn-green" onClick={() => setOpen(true)}>+ Nuevo usuario</button>
      </div>
      <div className="table-wrap mt-4">
        <table className="tabla">
          <thead><tr><th>ID</th><th>USUARIO</th><th>DOCUMENTO</th><th>CORREO</th><th>TELÉFONO</th><th>ROL</th><th>PROVEEDOR</th><th>ESTADO</th></tr></thead>
          <tbody><tr><td colSpan={8} className="text-center text-slate-400 py-10">17 usuarios registrados en el backend (conectar /api/operacion adminListarUsuarios).</td></tr></tbody>
        </table>
      </div>
      {open && <NuevoUsuarioModal onClose={() => setOpen(false)} />}
    </Shell></AuthGate>
  );
}
