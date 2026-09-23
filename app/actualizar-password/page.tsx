"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * /actualizar-password — destino del enlace de recuperación.
 * Requiere sesión de recovery (el callback ya intercambió el code).
 */
export default function ActualizarPasswordPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [clave1, setClave1] = useState("");
  const [clave2, setClave2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const guardar = async () => {
    setError(null);
    if (clave1.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (clave1 !== clave2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: clave1 });
      if (error) throw error;
      setOk(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7FA] p-6">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-xl font-extrabold">Crea tu nueva contraseña</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ingrésala dos veces para confirmar el cambio.
        </p>
        <div className="mt-5 space-y-3">
          <div>
            <label className="label" htmlFor="np1">Nueva contraseña</label>
            <input
              id="np1"
              type="password"
              autoComplete="new-password"
              className="input"
              value={clave1}
              onChange={(e) => setClave1(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="np2">Repite la contraseña</label>
            <input
              id="np2"
              type="password"
              autoComplete="new-password"
              className="input"
              value={clave2}
              onChange={(e) => setClave2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
            />
          </div>
          <button className="btn-green w-full" onClick={guardar} disabled={busy}>
            {busy ? "Guardando…" : "Guardar nueva contraseña"}
          </button>
        </div>
        {error && (
          <p className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</p>
        )}
        {ok && (
          <p className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
            Contraseña actualizada. Redirigiendo al dashboard…
          </p>
        )}
      </div>
    </div>
  );
}
