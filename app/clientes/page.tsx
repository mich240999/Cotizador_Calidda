"use client";

import { useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";

export default function ClientesPage() {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [doc, setDoc] = useState("");
  const [estado, setEstado] = useState("");
  const [rev, setRev] = useState("");
  const [mostrar, setMostrar] = useState("25");
  const limpiar = () => { setQ(""); setTipo(""); setDoc(""); setEstado(""); setRev(""); setMostrar("25"); };

  return (
    <AuthGate>
      <Shell>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-slate-400">GESTIÓN COMERCIAL</p>
            <h1 className="text-2xl font-extrabold mt-1">Clientes</h1>
          </div>
          <button className="btn-green">+ Nuevo cliente</button>
        </div>

        <div className="card p-4 mt-4">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="label">Buscar cliente</label>
              <input className="input" placeholder="Nombre, documento o correo…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div><label className="label">Tipo persona</label>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option><option>Natural</option><option>Jurídica</option></select></div>
            <div><label className="label">Documento</label>
              <select className="input" value={doc} onChange={(e) => setDoc(e.target.value)}><option value="">Todos</option><option>DNI</option><option>CE</option><option>RUC</option></select></div>
            <div><label className="label">Estado</label>
              <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option><option>Activo</option><option>Inactivo</option></select></div>
            <div><label className="label">Revisión</label>
              <select className="input" value={rev} onChange={(e) => setRev(e.target.value)}><option value="">Todos</option><option>Validado</option><option>Pendiente</option></select></div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <label className="text-xs text-slate-500 flex items-center gap-2">Mostrar
              <select className="input !w-20" value={mostrar} onChange={(e) => setMostrar(e.target.value)}>
                <option>10</option><option>25</option><option>50</option>
              </select>
            </label>
            <button onClick={limpiar} className="btn-white !py-1.5">Limpiar filtros</button>
          </div>
        </div>

        <div className="table-wrap mt-4">
          <table className="tabla">
            <thead><tr><th>ID</th><th>DOCUMENTO</th><th>CLIENTE</th><th>CONTACTO</th><th>CÓDIGO SAP</th><th>REVISIÓN</th><th>ESTADO</th></tr></thead>
            <tbody>
              <tr><td colSpan={7} className="text-center text-slate-400 py-10">Sin clientes registrados — usa «Nuevo cliente» para comenzar.</td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
          <span>Mostrando 0 de 0 registros</span>
          <div className="flex gap-1">
            <button className="btn-white !px-3 !py-1.5">‹ Anterior</button>
            <button className="btn-white !px-3 !py-1.5">Siguiente ›</button>
          </div>
        </div>
      </Shell>
    </AuthGate>
  );
}
