"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState } from "@/components/Tablas";
import { AccActivar, AccDesactivar } from "@/components/Accion";

type Vinculacion = {
  id: string;
  estado: string;
  id_proveedor: string;
  id_oficina: string;
  proveedor: string;
  proveedor_ruc?: string | null;
  oficina: string;
  oficina_sap?: string | null;
};

type ProveedorSGT = {
  id: string;
  razon_social?: string | null;
  nombre?: string | null;
  interlocutor?: string | null;
  ruc?: string | null;
};

type OficinaSGT = {
  id: string;
  nombre?: string | null;
  codigo_sap?: string | null;
  codigo?: string | null;
};

function etiquetaProveedor(p: ProveedorSGT): string {
  const base =
    p.razon_social ?? p.nombre ?? p.interlocutor ?? p.id ?? "—";
  return p.ruc ? `${base} · ${p.ruc}` : String(base);
}

function etiquetaOficina(o: OficinaSGT): string {
  const sap = o.codigo_sap ?? o.codigo ?? null;
  const nombre = o.nombre ?? o.id ?? "—";
  return sap ? `${sap} · ${nombre}` : String(nombre);
}

export default function VinculacionesPage() {
  const [vinculos, setVinculos] = useState<Vinculacion[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorSGT[]>([]);
  const [oficinas, setOficinas] = useState<OficinaSGT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [open, setOpen] = useState(false);
  const [provSel, setProvSel] = useState("");
  const [ofiSel, setOfiSel] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const args: Record<string, unknown> = { limit: 500 };
      if (q.trim()) args.q = q.trim();
      const [v, p, o] = await Promise.all([
        apiOperacion<Vinculacion[]>("listarVinculaciones", args),
        apiOperacion<ProveedorSGT[]>("listarProveedoresSGT", { limit: 500 }),
        apiOperacion<OficinaSGT[]>("listarOficinasVentas", { limit: 500 }),
      ]);
      setVinculos(Array.isArray(v) ? v : []);
      setProveedores(Array.isArray(p) ? p : []);
      setOficinas(Array.isArray(o) ? o : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setVinculos([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = vinculos.filter((v) => {
    if (estado && String(v.estado ?? "").toUpperCase() !== estado) return false;
    return true;
  });

  const limpiar = () => {
    setQ("");
    setEstado("");
  };

  const cambiarEstado = async (id: string, nuevo: "ACTIVO" | "INACTIVO") => {
    setError(null);
    setOk(null);
    setCambiandoId(id);
    try {
      await apiOperacion("actualizarVinculacion", { id, estado: nuevo });
      setOk(`Vinculación ${id} → ${nuevo}`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setCambiandoId(null);
    }
  };

  const guardar = async () => {
    setError(null);
    setOk(null);
    if (!provSel || !ofiSel) {
      setError("Selecciona proveedor y oficina");
      return;
    }
    setGuardando(true);
    try {
      await apiOperacion("vincularProveedorOficina", {
        proveedor_id: String(provSel),
        oficina_id: String(ofiSel),
      });
      setOk("Vínculo creado correctamente");
      setOpen(false);
      setProvSel("");
      setOfiSel("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el vínculo");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AuthGate>
      <Shell>
        <Link href="/admin" className="text-xs font-bold text-[#0099D8]">
          ← Consola administrativa
        </Link>
        <div className="mt-1">
          <ModHead
            eyebrow="CONSOLA ADMINISTRATIVA"
            title="Proveedores y oficinas"
            actions={
              <>
                <button className="btn-white" onClick={cargar} disabled={loading}>
                  {loading ? "Cargando…" : "Actualizar"}
                </button>
                <button className="btn-green" onClick={() => setOpen(true)}>
                  + Nueva vinculación
                </button>
              </>
            }
          />
        </div>

        {error && (
          <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>
        )}
        {ok && (
          <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{ok}</p>
        )}

        <div className="card p-4 mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Buscar</label>
            <input
              className="input"
              placeholder="ID POFxxxx…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") cargar();
              }}
            />
          </div>
          <div className="min-w-[160px]">
            <label className="label">Estado</label>
            <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="ACTIVO">ACTIVO</option>
              <option value="INACTIVO">INACTIVO</option>
            </select>
          </div>
          <button className="btn-white" onClick={cargar} disabled={loading}>
            Buscar
          </button>
          <button className="btn-white" onClick={limpiar}>
            Limpiar
          </button>
        </div>

        {loading ? (
          <div className="card p-10 mt-4 text-center text-slate-500">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              titulo="Sin vinculaciones"
              detalle="Usa «Nueva vinculación» para crear el vínculo proveedor ↔ oficina en el backend."
            />
          </div>
        ) : (
          <div className="table-wrap mt-4">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>PROVEEDOR</th>
                  <th>RUC</th>
                  <th>OFICINA</th>
                  <th>CÓDIGO SAP</th>
                  <th>ESTADO</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((v) => {
                  const est = String(v.estado ?? "").toUpperCase();
                  const activo = est === "ACTIVO";
                  return (
                    <tr key={v.id}>
                      <td className="font-mono font-bold">{v.id}</td>
                      <td>{v.proveedor ?? v.id_proveedor}</td>
                      <td className="font-mono">{v.proveedor_ruc ?? "—"}</td>
                      <td>{v.oficina ?? v.id_oficina}</td>
                      <td className="font-mono">{v.oficina_sap ?? "—"}</td>
                      <td>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            activo
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {est || "—"}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {activo ? (
                            <AccDesactivar
                              title="Desactivar vinculación"
                              onClick={() => cambiarEstado(v.id, "INACTIVO")}
                              disabled={cambiandoId === v.id}
                            />
                          ) : (
                            <AccActivar
                              title="Activar vinculación"
                              onClick={() => cambiarEstado(v.id, "ACTIVO")}
                              disabled={cambiandoId === v.id}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg p-6">
              <h2 className="text-lg font-extrabold">Nueva vinculación</h2>
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3">
                ⚠ Este vínculo es <b>inmutable</b>: el par proveedor ↔ oficina no puede
                editarse después. Solo puede activarse/desactivarse y, si cambia el par,
                debe crearse uno nuevo.
              </div>
              <div className="grid gap-3 mt-4">
                <div>
                  <label className="label">Proveedor</label>
                  <select
                    className="input"
                    value={provSel}
                    onChange={(e) => setProvSel(e.target.value)}
                  >
                    <option value="">Seleccionar…</option>
                    {proveedores.map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>
                        {etiquetaProveedor(p)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Oficina</label>
                  <select
                    className="input"
                    value={ofiSel}
                    onChange={(e) => setOfiSel(e.target.value)}
                  >
                    <option value="">Seleccionar…</option>
                    {oficinas.map((o) => (
                      <option key={String(o.id)} value={String(o.id)}>
                        {etiquetaOficina(o)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button className="btn-white flex-1" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button className="btn-green flex-1" onClick={guardar} disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar vinculación"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Shell>
    </AuthGate>
  );
}
