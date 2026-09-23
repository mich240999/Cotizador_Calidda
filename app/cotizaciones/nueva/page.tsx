"use client";

import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import CotizadorForm from "@/components/CotizadorForm";

export default function NuevaCotizacionPage() {
  return (
    <AuthGate>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Nueva cotización</h1>
          <Link href="/cotizaciones" className="btn-secondary ml-auto text-sm">
            ← Volver
          </Link>
        </div>
        <CotizadorForm />
      </div>
    </AuthGate>
  );
}
