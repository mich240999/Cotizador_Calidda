"use client";

import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import VentaModal from "@/components/VentaModal";

export default function NuevaVentaPage() {
  const router = useRouter();
  return (
    <AuthGate>
      <VentaModal onClose={() => router.push("/ventas")} />
    </AuthGate>
  );
}
