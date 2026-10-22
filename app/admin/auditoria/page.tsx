"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion, EmptyState } from "@/components/Tablas";

type Tipo = "logins" | "cambios";

type Fila = {
  id: number;
  fecha: string;
  usuario: string | null;
  email: string | null;
  rol: string | null;
  operacion: string;
  modulo: string | null;
  detalle: string | null;
  error: string | null;
  ip: string | null;
  user_agent: string | null;
  recordarme: boolean | null;
  estado: string;
};

type Resumen = { loginsHoy: number; fallidosHoy: number; cambiosHoy: number; usuariosHoy: number };

type Respuesta = {
  filas: Fila[];
  total: number;
  resumen: Resumen;
};

const LIMITE = 50;

function ymdPeru(diasAtras = 0): string {
  return new Date(Date.now() - 5 * 3600_000 - diasAtras * 86_400_000).toISOString().slice(0, 10);
}

function fechaLegible(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  });
}

function etiquetaOperacion(op: string): string {
  return op
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function equipoDe(ua: string | null): string {
  if (!ua) return "—";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  if (/okhttp|Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  return ua.slice(0, 36);
}

function Badge({ tono, children }: { tono: "ok" | "err" | "warn" | "info"; children: React.ReactNode }) {
  const clases = {
    ok: "bg-emerald-50 text-emerald-700",
    err: "bg-red-50 text-red-700",
    warn: "bg-amber-50 text-amber-700",
    info: "bg-sky-50 text-sky-700",
  }[tono];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${clases}`}>
      {children}
    </span>
  );
}

export default function AuditoriaPage() {
  const [tipo, setTipo] = useState<Tipo>("logins");
  const [q, setQ] = useState("");
  const [desdeDraft, setDesdeDraft] = useState(() => ymdPeru(7));
  const [hastaDraft, setHastaDraft] = useState(() => ymdPeru(0));
  const [filtros, setFiltros] = useState(() => ({ q: "", desde: ymdPeru(7), hasta: ymdPeru(0) }));
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    apiOperacion<Respuesta>("listarAuditoria", {
      tipo,
      q: filtros.q,
      desde: filtros.desde,
      hasta: filtros.hasta,
      limit: LIMITE,
      offset,
    })
      .then((r) => {
        if (vivo) setData(r);
      })
      .catch((e) => {
        if (vivo) {
          setError(e instanceof Error ? e.message : "No se pudo cargar la auditoría");
          setData(null);
        }
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [tipo, offset, filtros]);

  const resumen = data?.resumen;
  const kpis = useMemo(
    () => [
      { label: "Inicios hoy", v: resumen?.loginsHoy, tono: "text-[#0099D8]" },
      { label: "Fallidos hoy", v: resumen?.fallidosHoy, tono: "text-red-600" },
      { label: "Cambios hoy", v: resumen?.cambiosHoy, tono: "text-emerald-600" },
      { label: "Usuarios activos hoy", v: resumen?.usuariosHoy, tono: "text-slate-800" },
    ],
    [resumen]
  );

  const total = data?.total ?? 0;
  const filas = data?.filas ?? [];
  const rango = total === 0 ? "0" : `${offset + 1}–${Math.min(offset + LIMITE, total)}`;

  const buscar = () => {
    if (desdeDraft && hastaDraft && hastaDraft < desdeDraft) {
      setError("La fecha final no puede ser anterior a la inicial.");
      return;
    }
    setOffset(0);
    setFiltros({ q: q.trim(), desde: desdeDraft, hasta: hastaDraft });
  };

  const rangoRapido = (dias: number | null) => {
    const d = dias === null ? "" : ymdPeru(dias);
    const h = dias === null ? "" : ymdPeru(0);
    setDesdeDraft(d);
    setHastaDraft(h);
    setOffset(0);
    setFiltros({ q: q.trim(), desde: d, hasta: h });
  };

  const cambiarTipo = (t: Tipo) => {
    setTipo(t);
    setOffset(0);
  };

  return (
    <AuthGate>
      <Shell>
        <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
        <div className="mt-1">
          <ModHead
            eyebrow="CONSOLA ADMINISTRATIVA"
            title="Auditoría"
            desc="Inicios de sesión y cambios realizados por los usuarios."
            actions={
              <button
                className="btn-white"
                onClick={() => {
                  setOffset(0);
                  setFiltros((f) => ({ ...f }));
                }}
                disabled={cargando}
              >
                {cargando ? "Cargando…" : "Actualizar"}
              </button>
            }
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {kpis.map((k) => (
            <div key={k.label} className="card p-5 text-center">
              <p className={`text-3xl font-extrabold ${k.tono}`}>{k.v === undefined ? "…" : k.v}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="card p-4 mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${tipo === "logins" ? "bg-white text-[#0077B6] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                onClick={() => cambiarTipo("logins")}
              >
                Inicios de sesión
              </button>
              <button
                className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${tipo === "cambios" ? "bg-white text-[#0077B6] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                onClick={() => cambiarTipo("cambios")}
              >
                Cambios realizados
              </button>
            </div>
            <div className="flex gap-2">
              <button className="btn-white !py-2 !text-xs" onClick={() => rangoRapido(0)}>Hoy</button>
              <button className="btn-white !py-2 !text-xs" onClick={() => rangoRapido(7)}>7 días</button>
              <button className="btn-white !py-2 !text-xs" onClick={() => rangoRapido(30)}>30 días</button>
              <button className="btn-white !py-2 !text-xs" onClick={() => rangoRapido(null)}>Todo</button>
            </div>
          </div>

          <div className="mt-4 grid md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="label">Buscar</label>
              <input
                className="input"
                placeholder="Usuario, correo u operación"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
              />
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input" value={desdeDraft} onChange={(e) => setDesdeDraft(e.target.value)} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input" value={hastaDraft} onChange={(e) => setHastaDraft(e.target.value)} />
            </div>
          </div>

          <div className="mt-3 flex gap-2 justify-end">
            <button
              className="btn-white !py-2"
              onClick={() => {
                setQ("");
                setDesdeDraft("");
                setHastaDraft("");
                setOffset(0);
                setFiltros({ q: "", desde: "", hasta: "" });
              }}
            >
              Limpiar
            </button>
            <button className="btn-green !py-2" onClick={buscar} disabled={cargando}>Buscar</button>
          </div>
        </div>

        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}

        {cargando ? (
          <div className="card p-10 mt-4 text-center text-slate-500">Cargando auditoría…</div>
        ) : filas.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              titulo="Sin registros"
              detalle={tipo === "logins" ? "No hay inicios de sesión con esos filtros." : "No hay cambios de usuarios con esos filtros."}
            />
          </div>
        ) : (
          <div className="card mt-4">
            <div className="px-5 py-3 border-b font-semibold flex flex-wrap items-center justify-between gap-2">
              <span>{tipo === "logins" ? "Inicios de sesión" : "Cambios realizados"} · {total}</span>
              <span className="text-xs text-slate-400 font-normal">{rango} de {total}</span>
            </div>
            <div className="overflow-x-auto">
              {tipo === "logins" ? (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>FECHA</th><th>USUARIO</th><th>ROL</th><th>ESTADO</th><th>IP</th><th>EQUIPO</th><th>RECORDAR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.id}>
                        <td className="whitespace-nowrap text-xs">{fechaLegible(f.fecha)}</td>
                        <td>
                          <p className="font-medium">{f.usuario ?? "—"}</p>
                          {f.email && <p className="text-xs text-slate-500 truncate max-w-[220px]">{f.email}</p>}
                        </td>
                        <td>{f.rol ? <Badge tono="info">{String(f.rol).toUpperCase()}</Badge> : "—"}</td>
                        <td>
                          {f.estado === "OK" ? <Badge tono="ok">OK</Badge>
                            : f.estado === "DENEGADO" ? <Badge tono="warn">DENEGADO</Badge>
                              : <Badge tono="err">FALLIDO</Badge>}
                        </td>
                        <td className="font-mono text-xs">{f.ip ?? "—"}</td>
                        <td className="text-xs" title={f.user_agent ?? undefined}>{equipoDe(f.user_agent)}</td>
                        <td className="text-xs">{f.recordarme === null ? "—" : f.recordarme ? "Sí" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>FECHA</th><th>USUARIO</th><th>MÓDULO</th><th>OPERACIÓN</th><th>DETALLE</th><th>RESULTADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.id}>
                        <td className="whitespace-nowrap text-xs">{fechaLegible(f.fecha)}</td>
                        <td>
                          <p className="font-medium">{f.usuario ?? "—"}</p>
                          {f.email && <p className="text-xs text-slate-500 truncate max-w-[200px]">{f.email}</p>}
                        </td>
                        <td className="text-xs">{f.modulo ?? "—"}</td>
                        <td>
                          <p className="font-medium whitespace-nowrap">{etiquetaOperacion(f.operacion)}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{f.operacion}</p>
                        </td>
                        <td className="text-xs max-w-[360px]">
                          <p className="truncate" title={f.detalle ?? undefined}>{f.detalle || "—"}</p>
                          {f.error && <p className="text-red-600 mt-0.5 truncate" title={f.error}>{f.error}</p>}
                        </td>
                        <td>{f.estado === "ERROR" ? <Badge tono="err">ERROR</Badge> : <Badge tono="ok">OK</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t flex flex-wrap items-center justify-between gap-2">
              <button
                className="btn-white !py-2 !text-xs"
                disabled={offset === 0 || cargando}
                onClick={() => setOffset(Math.max(0, offset - LIMITE))}
              >
                ← Anterior
              </button>
              <span className="text-xs text-slate-500">{rango} de {total}</span>
              <button
                className="btn-white !py-2 !text-xs"
                disabled={offset + LIMITE >= total || cargando}
                onClick={() => setOffset(offset + LIMITE)}
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </Shell>
    </AuthGate>
  );
}
