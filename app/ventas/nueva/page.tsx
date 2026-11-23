"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import VentaModal from "@/components/VentaModal";
import { useRolVista } from "@/components/VentasComun";

export default function NuevaVentaPage() {
  const router = useRouter();
  const { rol, detectado } = useRolVista();
  const permitido = rol === "ADMIN" || rol === "ASESOR";
  useEffect(() => {
    if (detectado && !permitido) router.replace(rol === "PROVEEDOR" ? "/instalaciones" : "/ventas");
  }, [detectado, permitido, rol, router]);
  return (
    <AuthGate>
      {detectado && permitido ? <VentaModal onClose={() => router.push("/ventas")} /> : null}
    </AuthGate>
  );
}
