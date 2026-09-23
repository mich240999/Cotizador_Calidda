"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { apiOperacion } from "@/components/Tablas";

const CARDS = [
  ["usuarios", "Usuarios", "Cuentas, roles y estados de acceso."],
  ["proveedores", "Proveedores", "Interlocutor, RUC y razón social."],
  ["oficinas", "Oficinas de ventas", "Sedes y códigos de oficina."],
  ["vinculaciones", "Proveedores y oficinas", "Vínculo proveedor ↔ oficina (inmutable)."],
  ["grupos", "Grupos vendedores", "Grupos de vendedores."],
  ["asignaciones", "Asignaciones asesores", "Vigentes, programadas, finalizadas."],
  ["roles", "Roles", "Roles del sistema."],
  ["permisos", "Permisos detallados", "Matriz de permisos por rol."],
  ["recursos", "Recursos visuales", "Logos y piezas de la plataforma."],
];

export default function AdminPage() {
  const [nUsuarios, setNUsuarios] = useState<number | null>(null);
  const [nRoles, setNRoles] = useState<number | null>(null);
  const [nProveedores, setNProveedores] = useState<number | null>(null);
  const [nMateriales, setNMateriales] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const u = await apiOperacion<unknown>("adminListarUsuarios", {});
        if (vivo) setNUsuarios(Array.isArray(u) ? u.length : 0);
      } catch {
        if (vivo) setNUsuarios(0);
      }
      try {
        const r = await apiOperacion<unknown>("listarRolesSGT", {});
        if (vivo) setNRoles(Array.isArray(r) ? r.length : 0);
      } catch {
        if (vivo) setNRoles(0);
      }
      try {
        const p = await apiOperacion<unknown>("listarProveedoresSGT", { limit: 500 });
        if (vivo) setNProveedores(Array.isArray(p) ? p.length : 0);
      } catch {
        if (vivo) setNProveedores(0);
      }
      try {
        const m = await apiOperacion<unknown>("listarMaterialesSGT", { limit: 500 });
        if (vivo) setNMateriales(Array.isArray(m) ? m.length : 0);
      } catch {
        if (vivo) setNMateriales(0);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const kpis = [
    { label: "Usuarios", v: nUsuarios },
    { label: "Roles", v: nRoles },
    { label: "Proveedores", v: nProveedores },
    { label: "Materiales", v: nMateriales },
  ];

  return (
    <AuthGate>
      <Shell>
        <p className="text-[11px] font-bold tracking-[0.18em] text-slate-400">CONSOLA ADMINISTRATIVA</p>
        <h1 className="text-2xl font-extrabold mt-1">Administración</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {kpis.map((k) => (
            <div key={k.label} className="card p-5 text-center">
              <p className="text-3xl font-extrabold text-[#0099D8]">{k.v === null ? "…" : k.v}</p>
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
