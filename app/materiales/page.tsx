"use client";

import { useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";

function CargaMasivaModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-extrabold">Carga masiva CSV</h2>
        <p className="text-xs text-slate-500 mt-1">Fechas en formato dd.mm.yyyy · máximo 1000 filas por archivo.</p>
        <div className="mt-4 border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          Arrastra tu archivo aquí o
          <div className="mt-2"><button className="btn-white !py-2">Seleccionar archivo</button></div>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn-white flex-1">Descargar plantilla</button>
          <button className="btn-white flex-1">Validar</button>
          <button className="btn-green flex-1">Procesar</button>
        </div>
        <button onClick={onClose} className="mt-3 w-full text-xs text-slate-400 font-semibold">Cerrar</button>
      </div>
    </div>
  );
}

function NuevoPrecioModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-extrabold">Nuevo precio</h2>
        <div className="grid gap-3 mt-4">
          <div><label className="label">Buscar material</label><input className="input" placeholder="Código o nombre…" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Precio unitario (S/)</label><input className="input" placeholder="0.00" /></div>
            <div><label className="label">Moneda</label><input className="input" value="PEN" readOnly /></div>
          </div>
          <div><label className="label">Incluye IGV</label><select className="input"><option>Sí</option><option>No</option></select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Fecha inicio</label><input className="input" placeholder="dd.mm.yyyy" /></div>
            <div><label className="label">Fecha fin</label><input className="input" placeholder="dd.mm.yyyy" /></div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 border p-3 text-xs">
          <p className="font-bold mb-1">Historial reciente</p>
          <p className="text-slate-500">Sin tarifas previas para este material.</p>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn-white flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-green flex-1">Registrar tarifa</button>
        </div>
      </div>
    </div>
  );
}

export default function MaterialesPage() {
  const [tab, setTab] = useState<"mat" | "tar">("mat");
  const [modal, setModal] = useState<null | "carga" | "precio">(null);

  return (
    <AuthGate>
      <Shell>
        <h1 className="text-2xl font-extrabold">Materiales</h1>
        <div className="flex gap-2 mt-3">
          {(["mat", "tar"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === t ? "bg-[#0099D8] text-white" : "bg-white border text-slate-600"}`}>
              {t === "mat" ? "Materiales" : "Tarifario"}
            </button>
          ))}
        </div>

        <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
          <div><label className="label">Buscar</label><input className="input !w-56" placeholder="Código o nombre…" /></div>
          <div><label className="label">Estado</label><select className="input"><option>Todos</option><option>Activo</option><option>Inactivo</option></select></div>
          <div><label className="label">Código</label><input className="input !w-32" placeholder="MAT-…" /></div>
          <div><label className="label">Unidad</label><select className="input"><option>Todas</option><option>UND</option><option>GLB</option></select></div>
          <div><label className="label">Mostrar</label><select className="input !w-20"><option>25</option><option>50</option></select></div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-white" onClick={() => setModal("carga")}>Descargar plantilla</button>
            <button className="btn-white" onClick={() => setModal("carga")}>Carga masiva</button>
            {tab === "mat"
              ? <button className="btn-green">+ Nuevo material</button>
              : <button className="btn-green" onClick={() => setModal("precio")}>+ Nuevo precio</button>}
          </div>
        </div>

        {tab === "mat" ? (
          <div className="table-wrap mt-4">
            <table className="tabla">
              <thead><tr><th>ID</th><th>CÓDIGO</th><th>MATERIAL</th><th>MEDIDA</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
              <tbody><tr><td colSpan={6} className="text-center text-slate-400 py-10">Sin materiales — usa «Nuevo material» o «Carga masiva».</td></tr></tbody>
            </table>
          </div>
        ) : (
          <div className="card p-5 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold tracking-widest text-slate-400">TARIFARIO VIGENTE</p>
                <p className="text-xl font-extrabold">S/ 0.00</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-white">Editar vigencia</button>
                <button className="btn-green">Administrar</button>
              </div>
            </div>
            <div className="table-wrap mt-4">
              <table className="tabla">
                <thead><tr><th>MATERIAL</th><th>TARIFA VIGENTE</th><th>VIGENCIA</th></tr></thead>
                <tbody><tr><td colSpan={3} className="text-center text-slate-400 py-8">Sin tarifas registradas.</td></tr></tbody>
              </table>
            </div>
          </div>
        )}

        {modal === "carga" && <CargaMasivaModal onClose={() => setModal(null)} />}
        {modal === "precio" && <NuevoPrecioModal onClose={() => setModal(null)} />}
      </Shell>
    </AuthGate>
  );
}
