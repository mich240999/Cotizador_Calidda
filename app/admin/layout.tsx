import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Guard de servidor para toda la consola /admin.
 * El middleware ya valida la sesión; aquí se exige además rol ADMIN antes
 * de renderizar cualquier página o componente cliente.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSession();
  if (!sesion) redirect("/?next=/admin");
  if (sesion.rol !== "admin") redirect("/dashboard");
  return <>{children}</>;
}
