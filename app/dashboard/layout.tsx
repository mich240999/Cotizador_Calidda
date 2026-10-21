import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/** Dashboard comercial: solo admin. El resto vuelve a su módulo operativo. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSession();
  if (!sesion) redirect("/");
  if (sesion.rol !== "admin") {
    redirect(sesion.alcance === "EMPRESA" ? "/instalaciones" : "/cotizaciones");
  }
  return <>{children}</>;
}
