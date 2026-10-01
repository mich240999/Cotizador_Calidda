"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion } from "@/components/Tablas";

type PermRecurso = { recurso: string; permitido: Record<string, boolean> };
type PermGrupo = { grupo: string; recursos: PermRecurso[] };
type PermModulo = { modulo: string; grupos: PermGrupo[] };

const bonito = (code: string) =>
  String(code ?? "")
    .replace(/^[^_]+_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

const bonitoModulo = (m: string) =>
  String(m ?? "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function PermisosPage() {
  const [roles, setRoles] = useState<string[]>([]);
  const [modulos, setModulos] = useState<PermModulo[]>([]);
  const [concedidos, setConcedidos] = useState(0);
  const [total, setTotal] = useState(0);
  const [fuente, setFuente] = useState("");
  const [base, setBase] = useState<Record<string, Record<string, boolean>>>({});
  const [cambios, setCambios] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const datos = await apiOperacion<{
        fuente?: string; roles?: string[]; modulos?: PermModulo[]; concedidos?: number; total?: number; matriz?: unknown;
      }>("getMatrizPermisos", {});
      if (!datos?.modulos) {
        setRoles([]); setModulos([]); setBase({});
        setFuente(String(datos?.fuente ?? ""));
        setError("Sin matriz SGT: ejecuta supabase/schema_sgt360.sql para administrar permisos por recurso.");
        return;
      }
      setRoles(datos.roles ?? []);
      setModulos(datos.modulos ?? []);
      setConcedidos(Number(datos.concedidos ?? 0));
      setTotal(Number(datos.total ?? 0));
      setFuente(String(datos.fuente ?? ""));
      // Aplana por recurso global (recurso es único por PK rol+recurso).
      const plano: Record<string, Record<string, boolean>> = {};
      for (const m of datos.modulos ?? []) for (const g of m.grupos) for (const r of g.recursos) plano[r.recurso] = r.permitido;
      setBase(plano);
      setCambios({});
      if (!open) {
        const first = (datos.modulos ?? [])[0]?.modulo ?? null;
        setOpen(first);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valor = (recurso: string, rol: string) => {
    const k = `${rol}|${recurso}`;
    if (k in cambios) return cambios[k];
    return !!base[recurso]?.[rol];
  };

  const toggle = (recurso: string, rol: string) => {
    const k = `${rol}|${recurso}`;
    const orig = !!base[recurso]?.[rol];
    setCambios((p) => {
      const n = { ...p };
      const actual = k in n ? n[k] : orig;
      n[k] = !actual;
      if (n[k] === orig) delete n[k];
      return n;
    });
    setInfo(null);
  };

  const nCambios = Object.keys(cambios).length;

  const guardar = async () => {
    setError(null);
    setSaving(true);
    try {
      const lista = Object.entries(cambios).map(([k, permitido]) => {
        const [rol_codigo, ...rest] = k.split("|");
        return { rol_codigo, recurso: rest.join("|"), permitido };
      });
      const r = await apiOperacion<{ guardados?: number }>("guardarMatrizPermisos", { cambios: lista });
      setInfo(`Guardados ${r?.guardados ?? lista.length} cambios.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar (requiere rol admin)");
    } finally {
      setSaving(false);
    }
  };

  const pendientes = useMemo(() => {
    const eff: Record<string, Record<string, boolean>> = JSON.parse(JSON.stringify(base));
    for (const [k, v] of Object.entries(cambios)) {
      const [rol, ...rest] = k.split("|");
      const rec = rest.join("|");
      eff[rec] = { ...(eff[rec] ?? {}), [rol]: v };
    }
    let n = 0;
    for (const r of Object.values(eff)) n += Object.values(r).filter(Boolean).length;
    return n;
  }, [base, cambios]);

  return (<AuthGate><Shell>
    <Link href="/admin" className="text-xs font-bold text-[#0099D8]">← Consola administrativa</Link>
    <div className="mt-1"><ModHead
      eyebrow="SUPERADMINISTRACIÓN"
      title="Matriz de permisos por recurso"
      desc={loading ? "Cargando matriz…" : `Configura qué puede hacer cada rol. ${roles.length} roles · ${modulos.length} módulos · ${pendientes} concedidos${fuente ? ` · ${fuente}` : ""}. Los cambios se guardan al pulsar Guardar.`}
      actions={<>
        {nCambios > 0 && (
          <button className="btn-white" onClick={() => { setCambios({}); setInfo(null); }}>Descartar ({nCambios})</button>
        )}
        <button className="btn-green" onClick={guardar} disabled={saving || nCambios === 0}>
          {saving ? "Guardando…" : `Guardar cambios${nCambios > 0 ? ` (${nCambios})` : ""}`}
        </button>
        <button className="btn-white" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
      </>}
    /></div>

    {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
    {info && <p className="card p-4 mt-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{info}</p>}

    {loading ? (
      <div className="card p-10 mt-4 text-center text-slate-500">Cargando permisos…</div>
    ) : (
      <div className="space-y-3 mt-4">
        <div className="card px-5 py-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[#0077B6] text-white text-[10px] font-bold">✓</span> Marcado = permitido</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded border-2 border-slate-300 bg-white" /> Sin marcar = sin permiso</span>
          {nCambios > 0 && <span className="ml-auto font-bold text-amber-700">{nCambios} cambios sin guardar</span>}
        </div>
        {modulos.map((m) => (
          <div key={m.modulo} className="card overflow-hidden">
            <button onClick={() => setOpen(open === m.modulo ? null : m.modulo)} className="w-full flex items-center justify-between px-5 py-3 font-bold text-sm hover:bg-slate-50">
              <span>{bonitoModulo(m.modulo)} <span className="ml-2 font-normal text-xs text-slate-400">{m.grupos.reduce((a, g) => a + g.recursos.length, 0)} recursos</span></span>
              <span className="text-slate-400">{open === m.modulo ? "−" : "+"}</span>
            </button>
            {open === m.modulo && (
              <div className="border-t border-slate-100">
                {m.grupos.map((g) => (
                  <div key={g.grupo} className="px-5 py-3 border-b border-slate-50 last:border-0">
                    <p className="text-[11px] font-extrabold tracking-wider text-[#005B96] uppercase mb-2">{bonito(g.grupo)}</p>
                    <div className="overflow-x-auto">
                      <table className="tabla min-w-[560px]">
                        <thead><tr><th>Recurso</th>{roles.map((r) => <th key={r} className="text-center">{r}</th>)}</tr></thead>
                        <tbody>
                          {g.recursos.map((r) => (
                            <tr key={r.recurso}>
                              <td>
                                <p className="font-semibold">{bonito(r.recurso)}</p>
                                <p className="font-mono text-[10px] text-slate-400">{r.recurso}</p>
                              </td>
                              {roles.map((rol) => (
                                <td key={rol} className="text-center">
                                  <input
                                    type="checkbox"
                                    checked={valor(r.recurso, rol)}
                                    onChange={() => toggle(r.recurso, rol)}
                                    className="h-5 w-5 accent-[#0077B6] cursor-pointer"
                                    title={`${bonito(r.recurso)} → ${rol}`}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {modulos.length === 0 && !error && <div className="card p-8 text-center text-sm text-slate-400">Sin datos de permisos en el backend.</div>}
        <p className="text-[11px] text-slate-400">Total matriz: {total} filas · concedidos: {concedidos}. Solo admin puede guardar.</p>
      </div>
    )}
  </Shell></AuthGate>);
}
