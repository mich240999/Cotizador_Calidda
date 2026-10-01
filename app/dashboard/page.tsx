"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion } from "@/components/Tablas";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AZULES = ["#0B5FA5", "#0099D8", "#00A9CE", "#00A651", "#F59E0B", "#64748B", "#7C3AED", "#EC4899"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type FilaVenta = { numero: string; cliente: string; proveedor: string; canal: string; estado: string; total: number; fecha: string };
type Cot = { id: string; estado?: string; total?: number; subtotal?: number; created_at?: string };

const fmtSoles = (n: number) =>
  `S/ ${Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const mesKey = (iso: string) => String(iso ?? "").slice(0, 7);
const etiquetaMes = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${MESES[Number(m || 1) - 1] ?? ""} ${String(y ?? "").slice(2)}`;
};

export default function DashboardPage() {
  const [ventas, setVentas] = useState<FilaVenta[]>([]);
  const [cots, setCots] = useState<Cot[]>([]);
  const [nCli, setNCli] = useState<number | null>(null);
  const [nMat, setNMat] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [fCanal, setFCanal] = useState("");
  const [fEstado, setFEstado] = useState("");

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, c, cl, m] = await Promise.allSettled([
        apiOperacion<unknown>("exportarVentas", {}),
        apiOperacion<unknown>("listarCotizaciones", { limit: 500 }),
        apiOperacion<unknown>("listarClientesSGT", { limit: 1, pageSize: 1 }).catch(() => apiOperacion<unknown>("listarClientes", { limit: 1 })),
        apiOperacion<unknown>("listarMaterialesSGT", { limit: 1 }),
      ]);
      if (v.status === "fulfilled") {
        const o = v.value as { columnas?: string[]; filas?: unknown[][]; rows?: FilaVenta[] };
        if (Array.isArray(o?.filas) && Array.isArray(o?.columnas)) {
          const ix: Record<string, number> = {};
          o.columnas.forEach((col, i) => { ix[String(col).toLowerCase()] = i; });
          const at = (f: unknown[], ...names: string[]) => {
            for (const n of names) if (ix[n] != null) return f[ix[n]];
            return "";
          };
          setVentas((o.filas as unknown[][]).map((f) => ({
            numero: String(at(f, "numero") ?? ""),
            cliente: String(at(f, "cliente") ?? ""),
            proveedor: String(at(f, "proveedor") ?? ""),
            canal: String(at(f, "canal") ?? "").toLowerCase(),
            estado: String(at(f, "estado") ?? "").toLowerCase(),
            total: Number(at(f, "total") ?? 0) || 0,
            fecha: String(at(f, "fecha") ?? ""),
          })));
        } else if (Array.isArray(o?.rows)) {
          setVentas(o.rows as FilaVenta[]);
        }
      }
      if (c.status === "fulfilled" && Array.isArray(c.value)) setCots(c.value as Cot[]);
      const totalDe = (r: unknown): number | null => {
        if (r && typeof r === "object" && "total" in (r as object)) return Number((r as { total: number }).total);
        return Array.isArray(r) ? (r as unknown[]).length : null;
      };
      setNCli(cl.status === "fulfilled" ? totalDe(cl.value) : 0);
      setNMat(m.status === "fulfilled" ? (Array.isArray(m.value) ? (m.value as unknown[]).length : 0) : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const enRango = (fecha: string) => {
    const f = String(fecha ?? "").slice(0, 10);
    if (fDesde && f < fDesde) return false;
    if (fHasta && f > fHasta) return false;
    return true;
  };

  const ventasF = useMemo(
    () =>
      ventas.filter(
        (v) =>
          enRango(v.fecha) &&
          (!fCanal || v.canal === fCanal) &&
          (!fEstado || v.estado === fEstado)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ventas, fDesde, fHasta, fCanal, fEstado]
  );

  const cotsF = useMemo(() => {
    const arr = cots.filter((c) => {
      const f = String(c.created_at ?? "").slice(0, 10);
      if (!f) return true;
      return enRango(f);
    });
    return arr;
  }, [cots, fDesde, fHasta]);

  const montoTotal = ventasF.reduce((a, v) => a + v.total, 0);
  const cerradas = ventasF.filter((v) => v.estado === "cerrada").length;
  const montoCots = cotsF.reduce((a, c) => a + Number(c.total ?? 0), 0);

  const porMes = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of ventasF) {
      const k = mesKey(v.fecha);
      if (!k || k.length < 7) continue;
      map.set(k, (map.get(k) ?? 0) + v.total);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-8).map(([k, monto]) => ({ mes: etiquetaMes(k), monto: Math.round(monto * 100) / 100 }));
  }, [ventasF]);

  const porEstado = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of ventasF) map.set(v.estado || "—", (map.get(v.estado || "—") ?? 0) + 1);
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [ventasF]);

  const porCanal = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of ventasF) map.set(v.canal || "—", (map.get(v.canal || "—") ?? 0) + v.total);
    return [...map.entries()].map(([name, monto]) => ({ name, monto: Math.round(monto * 100) / 100 }));
  }, [ventasF]);

  const cotsEstado = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cotsF) {
      const e = String(c.estado ?? "—").toUpperCase();
      map.set(e, (map.get(e) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [cotsF]);

  const limpiar = () => { setFDesde(""); setFHasta(""); setFCanal(""); setFEstado(""); };

  const kpis = [
    { label: "Ventas (filtro)", valor: String(ventasF.length), sub: `${fmtSoles(montoTotal)} acumulado`, color: "text-[#0B5FA5]" },
    { label: "Ticket promedio", valor: ventasF.length ? fmtSoles(montoTotal / ventasF.length) : "S/ 0.00", sub: "por solicitud", color: "text-[#0099D8]" },
    { label: "Tasa de cierre", valor: ventasF.length ? `${Math.round((cerradas / ventasF.length) * 100)}%` : "—", sub: `${cerradas} cerradas`, color: "text-emerald-600" },
    { label: "Cotizaciones", valor: String(cotsF.length), sub: `${fmtSoles(montoCots)} cotizado`, color: "text-amber-600" },
    { label: "Clientes", valor: nCli === null ? "…" : String(nCli), sub: "registrados", color: "text-violet-600" },
    { label: "Materiales", valor: nMat === null ? "…" : String(nMat), sub: "en catálogo", color: "text-slate-600" },
  ];

  return (
    <AuthGate>
      <Shell>
        <ModHead
          eyebrow="RESUMEN GENERAL"
          title="Dashboard"
          desc="Indicadores y gráficos de la operación comercial. Los filtros cambian todo el tablero."
          actions={<button className="btn-white !bg-white/95" onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>}
        />

        <div className="card p-4 mt-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Desde</label>
            <input type="date" className="input !w-auto" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input type="date" className="input !w-auto" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
          </div>
          <div>
            <label className="label">Canal</label>
            <select className="input !w-auto" value={fCanal} onChange={(e) => setFCanal(e.target.value)}>
              <option value="">Todos</option>
              <option value="proveedor">Proveedor</option>
              <option value="microaliado">Microaliado</option>
              <option value="contratista">Contratista</option>
            </select>
          </div>
          <div>
            <label className="label">Estado venta</label>
            <select className="input !w-auto" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
              <option value="">Todos</option>
              {["borrador", "pendiente_aprobacion", "observado", "aprobada", "en_instalacion", "instalada", "validada_proveedor", "cerrada"].map((e) => (
                <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <button className="btn-white !py-2" onClick={limpiar}>Limpiar filtros</button>
        </div>

        {error && <p className="card p-4 mt-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-6 mt-4">
          {kpis.map((k) => (
            <div key={k.label} className="card p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{k.label}</p>
              <p className={`mt-1 text-xl lg:text-2xl font-extrabold ${k.color}`}>{loading ? "…" : k.valor}</p>
              <p className="text-[11px] text-slate-400 truncate">{k.sub}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="card p-10 mt-4 text-center text-slate-500">Cargando gráficos…</div>
        ) : ventasF.length === 0 && cotsF.length === 0 ? (
          <div className="card p-8 mt-4 text-center text-sm text-slate-500">
            Sin movimientos con esos filtros. Ajusta el rango de fechas o registra ventas y cotizaciones.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            <div className="card p-5">
              <p className="font-bold">Monto de ventas por mes</p>
              <p className="text-xs text-slate-400 mb-2">Suma de totales por mes de actualización</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                    <Tooltip formatter={(v) => [fmtSoles(Number(v)), "Monto"]} />
                    <Bar dataKey="monto" fill="#0099D8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5">
              <p className="font-bold">Ventas por estado</p>
              <p className="text-xs text-slate-400 mb-2">Distribución de solicitudes</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={porEstado} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2} label={{ fontSize: 11 }}>
                      {porEstado.map((_, i) => (
                        <Cell key={i} fill={AZULES[i % AZULES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} ventas`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5">
              <p className="font-bold">Monto por canal</p>
              <p className="text-xs text-slate-400 mb-2">Proveedor · microaliado · contratista</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porCanal} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, textTransform: "capitalize" } as never} />
                    <Tooltip formatter={(v) => [fmtSoles(Number(v)), "Monto"]} />
                    <Bar dataKey="monto" fill="#0B5FA5" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5">
              <p className="font-bold">Cotizaciones por estado</p>
              <p className="text-xs text-slate-400 mb-2">Del rango de fechas elegido</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={cotsEstado} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2} label={{ fontSize: 11 }}>
                      {cotsEstado.map((_, i) => (
                        <Cell key={i} fill={AZULES[(i + 2) % AZULES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} cotizaciones`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </Shell>
    </AuthGate>
  );
}
