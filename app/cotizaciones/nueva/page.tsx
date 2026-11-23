"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import CotizadorForm from "@/components/CotizadorForm";
import { useRolVista } from "@/components/VentasComun";

export default function NuevaCotizacionPage() {
  const router = useRouter();
  const { rol, detectado } = useRolVista();
  const permitido = ["ADMIN", "ASESOR", "SUPERVISOR"].includes(rol);
  useEffect(() => {
    if (detectado && !permitido) router.replace(rol === "PROVEEDOR" ? "/instalaciones" : "/cotizaciones");
  }, [detectado, permitido, rol, router]);
  return (
    <AuthGate>
      {detectado && permitido && <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Nueva cotización</h1>
          <Link href="/cotizaciones" className="btn-secondary ml-auto text-sm">
            ← Volver
          </Link>
        </div>
        <CotizadorForm />
      </div>}
    </AuthGate>
  );
}
