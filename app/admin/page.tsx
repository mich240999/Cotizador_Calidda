"use client";

import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";

const KPIS = [
  { label: "Usuarios", v: 17 },
  { label: "Roles", v: 5 },
  { label: "Menús", v: 6 },
  { label: "Recursos", v: 3 },
];

const CARDS = [
  ["usuarios", "Usuarios", "Cuentas, roles y estados de acceso."],
  ["proveedores", "Proveedores", "Interlocutor, RUC y razón social."],
  ["oficinas", "Oficinas de ventas", "Sedes y códigos de oficina."],
  ["vinculaciones", "Proveedores y oficinas", "Vínculo proveedor ↔ oficina (inmutable)."],
  ["grupos", "Grupos vendedores", "Grupos como GVE0001 AMX FFVV."],
  ["asignaciones", "Asignaciones asesores", "Vigentes, programadas, finalizadas."],
  ["roles", "Roles", "ADMIN 20 · PROVEEDOR 30 · SUPERVISOR 40 · ASESOR 50."],
  ["permisos", "Permisos detallados", "Matriz por recurso: 106 recursos, 139 concedidos."],
  ["recursos", "Recursos visuales", "Logos y piezas de la plataforma."],
];

export default function AdminPage() {
  return (
    <AuthGate>
      <Shell>
        <p className="text-[11px] font-bold tracking-[0.18em] text-slate-400">CONSOLA ADMINISTRATIVA</p>
        <h1 className="text-2xl font-extrabold mt-1">Administración</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {KPIS.map((k) => (
            <div key={k.label} className="card p-5 text-center">
              <p className="text-3xl font-extrabold text-[#0099D8]">{k.v}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">{k.label}</p>
            </div>
          ))}
        </div>
        <h2 className="font-bold mt-6 mb-3">Gestionar</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map(([href, t, d]) => (
            <Link key={href} href={`/admin/${href}`} className="card p-5 hover:shadow-md transition block">
              <p className="font-bold">{t}</p>
              <p className="text-xs text-slate-500 mt-1">{d}</p>
              <span className="inline-block mt-3 text-xs font-bold text-[#0099D8]">Abrir →</span>
            </Link>
          ))}
        </div>
      </Shell>
    </AuthGate>
  );
}
