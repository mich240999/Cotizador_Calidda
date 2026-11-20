"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import ModHead from "@/components/ModHead";
import { apiOperacion } from "@/components/Tablas";

type Corte = {
  clave: string;
  horas?: string | null;
  para?: string | null;
  copia?: string | null;
  asunto?: string | null;
  mensaje?: string | null;
  activo?: boolean | null;
  modo_envio?: "automatico" | "programado" | null;
  ultimo_envio?: string | null;
};

const TITULOS: Record<string, { titulo: string; desc: string }> = {
  ventas_pv: {
    titulo: "Solicitudes pendientes de generar PV",
    desc: "Cuenta borradores y observados sin pedido. Solo envía el aviso si hay pendientes a la hora del corte.",
  },
  instalaciones_liq: {
    titulo: "Pedidos pendientes de liquidar",
    desc: "Cuenta instalaciones listas para liquidar. Solo envía el aviso si hay pendientes a la hora del corte.",
  },
  subsanaciones: {
    titulo: "Avisos de solicitudes por subsanar",
    desc: "Avisa al proveedor asociado a cada venta. El mensaje se omite si el proveedor no tiene correo configurado o sus avisos están desactivados.",
  },
};

function CorteCard({ c, onGuardado }: { c: Corte; onGuardado: () => void }) {
  const t = TITULOS[c.clave] ?? { titulo: c.clave, desc: "" };
  const [horas, setHoras] = useState(String(c.horas ?? ""));
  const [para, setPara] = useState(String(c.para ?? ""));
  const [copia, setCopia] = useState(String(c.copia ?? ""));
  const [asunto, setAsunto] = useState(String(c.asunto ?? ""));
  const [mensaje, setMensaje] = useState(String(c.mensaje ?? ""));
  const [activo, setActivo] = useState(!!c.activo);
  const esSubsanaciones = c.clave === "subsanaciones";
  const [modoEnvio, setModoEnvio] = useState<"automatico" | "programado">(c.modo_envio ?? (esSubsanaciones ? "automatico" : "programado"));
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const guardarConfig = async () => {
    await apiOperacion("cfgCorteGuardar", {
      clave: c.clave, horas, para: esSubsanaciones ? "" : para, copia: esSubsanaciones ? "" : copia, asunto, mensaje, activo, modo_envio: modoEnvio,
    });
  };

  const guardar = async () => {
    setMsg(null); setOk(null); setTrabajando(true);
    try {
      await guardarConfig();
      setOk("Configuración guardada.");
      onGuardado();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setTrabajando(false);
    }
  };

  const enviarAhora = async () => {
    setMsg(null); setOk(null);
    if (!esSubsanaciones && !/@[a-z]/i.test(para.trim())) {
      setMsg("Escribe un correo destino válido antes de enviar la prueba.");
      return;
    }
    setTrabajando(true);
    try {
      await guardarConfig();
      const r = await apiOperacion<{ enviado?: boolean; motivo?: string; cantidad?: number; proveedores?: number }>("cfgCorteEnviar", { clave: c.clave });
      setOk(r?.enviado ? (esSubsanaciones
        ? `Aviso enviado a ${r.proveedores ?? 0} proveedores (${r.cantidad ?? 0} pendientes).`
        : `Correo enviado (${r.cantidad ?? 0} pendientes).`) : `No enviado: ${r?.motivo ?? ""}`);
      onGuardado();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-bold">{t.titulo}</h2>
        <span className={`text-[11px] font-bold rounded-lg px-2 py-1 ${activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {activo ? "ACTIVO" : "INACTIVO"}
        </span>
        <span className="ml-auto text-xs text-slate-400">Último envío: {c.ultimo_envio ?? "—"}</span>
      </div>
      <p className="text-xs text-slate-400 mt-1">{t.desc}</p>
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {esSubsanaciones && <div>
          <label className="label">Cuándo enviar</label>
          <select className="input" value={modoEnvio} onChange={(e) => setModoEnvio(e.target.value as "automatico" | "programado")}>
            <option value="automatico">Automático al observar o rechazar</option>
            <option value="programado">A una hora, agrupando todos los pendientes</option>
          </select>
        </div>}
        {(!esSubsanaciones || modoEnvio === "programado") && <div>
          <label className="label">Horas de corte (Lima, separadas por coma)</label>
          <input className="input" placeholder="12:00,17:00" value={horas} onChange={(e) => setHoras(e.target.value)} />
          {esSubsanaciones && <p className="text-[11px] text-slate-400 mt-1">Usa formato HH:MM, hora de Lima. El proceso revisa cada minuto.</p>}
        </div>}
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Corte activo
          </label>
        </div>
        {!esSubsanaciones && <>
          <div>
            <label className="label">Correo destino *</label>
            <input className="input" placeholder="responsable@empresa.com" value={para} onChange={(e) => setPara(e.target.value)} />
          </div>
          <div>
            <label className="label">Correos en copia</label>
            <input className="input" placeholder="copia1@..., copia2@..." value={copia} onChange={(e) => setCopia(e.target.value)} />
          </div>
        </>}
      </div>
      <div className="mt-3">
        <label className="label">Asunto (usa {"{cantidad}"}, {"{proveedor}"}, {"{hora}"}, {"{fecha}"})</label>
        <input className="input" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
      </div>
      <div className="mt-3">
        <label className="label">Mensaje (usa {"{cantidad}"}, {"{proveedor}"}, {"{hora}"}, {"{fecha}"}, {"{detalle}"})</label>
        <textarea className="input min-h-[90px]" value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
      </div>
      {msg && <p className="mt-3 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
      {ok && <p className="mt-3 text-sm rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2">{ok}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-white !text-[#0099D8]" onClick={enviarAhora} disabled={trabajando}>Enviar ahora (prueba)</button>
        <button className="btn-green" onClick={guardar} disabled={trabajando}>{trabajando ? "Guardando…" : "Guardar"}</button>
      </div>
    </div>
  );
}

type ProveedorAviso = { id: string; nombre: string; correo: string; activo: boolean; estado: string };

function ProveedoresSubsanacionesCard() {
  const [proveedores, setProveedores] = useState<ProveedorAviso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [correos, setCorreos] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true); setMsg(null);
    try {
      const r = await apiOperacion<ProveedorAviso[]>("cfgSubsanacionesProveedoresListar", {});
      const lista = Array.isArray(r) ? r : [];
      setProveedores(lista);
      setCorreos(Object.fromEntries(lista.map((p) => [p.id, p.correo ?? ""])));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudieron cargar los proveedores");
    } finally { setCargando(false); }
  };

  useEffect(() => { cargar(); }, []);

  const guardar = async (p: ProveedorAviso, activo = p.activo) => {
    setGuardando(p.id); setMsg(null); setOk(null);
    try {
      const actualizado = await apiOperacion<ProveedorAviso>("cfgSubsanacionProveedorGuardar", {
        id_proveedor: p.id, correo: correos[p.id] ?? "", activo,
      });
      setProveedores((prev) => prev.map((item) => item.id === p.id ? { ...item, ...actualizado } : item));
      setCorreos((prev) => ({ ...prev, [p.id]: actualizado.correo ?? "" }));
      setOk(`Configuración guardada para ${p.nombre}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo guardar el proveedor");
    } finally { setGuardando(null); }
  };

  return <section className="card p-5">
    <div className="flex items-center gap-3 flex-wrap">
      <h2 className="font-bold">Correos de proveedores para subsanaciones</h2>
      <button className="btn-white !text-[#0099D8] ml-auto" onClick={cargar} disabled={cargando}>Actualizar lista</button>
    </div>
    <p className="text-xs text-slate-500 mt-1">Cada aviso se envía únicamente al correo configurado aquí para el proveedor de esa venta. Sin correo o desactivado, no se envía.</p>
    {msg && <p className="mt-3 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
    {ok && <p className="mt-3 text-sm rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2">{ok}</p>}
    {cargando ? <p className="mt-4 text-sm text-slate-500">Cargando proveedores…</p> : proveedores.length === 0 ? <p className="mt-4 text-sm text-slate-500">No hay proveedores registrados.</p> :
      <div className="mt-4 space-y-3">{proveedores.map((p) => <div key={p.id} className="grid md:grid-cols-[minmax(180px,1fr)_minmax(240px,1.5fr)_auto_auto] gap-3 items-end border border-slate-200 rounded-xl p-3">
        <div><div className="text-sm font-semibold">{p.nombre}</div><div className="text-xs text-slate-400">{p.id}{p.estado ? ` · ${p.estado}` : ""}</div></div>
        <div><label className="label">Correo para avisos</label><input className="input" type="email" placeholder="proveedor@empresa.com" value={correos[p.id] ?? ""} onChange={(e) => setCorreos((prev) => ({ ...prev, [p.id]: e.target.value }))} /><p className="text-[11px] text-slate-400 mt-1">Vacío: no se enviarán avisos.</p></div>
        <button className="btn-white" disabled={guardando !== null} onClick={() => guardar(p)}>{guardando === p.id ? "Guardando…" : "Guardar correo"}</button>
        <button className={p.activo ? "btn-white !text-red-600" : "btn-green"} disabled={guardando !== null} onClick={() => guardar(p, !p.activo)}>{p.activo ? "Desactivar avisos" : "Activar avisos"}</button>
      </div>)}</div>}
  </section>;
}

function CorreoCotizacionCard() {
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [necesitaMigracion, setNecesitaMigracion] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    setMsg(null);
    try {
      const r = await apiOperacion<{ config?: { asunto?: string; mensaje?: string }; necesitaMigracion?: boolean }>(
        "cfgCorreoCotizacion",
        {}
      );
      setAsunto(String(r?.config?.asunto ?? ""));
      setMensaje(String(r?.config?.mensaje ?? ""));
      setNecesitaMigracion(!!r?.necesitaMigracion);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo cargar la plantilla");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const guardar = async () => {
    setMsg(null); setOk(null); setTrabajando(true);
    try {
      await apiOperacion("cfgCorreoCotizacionGuardar", { asunto, mensaje });
      setOk("Plantilla guardada. Se usará en el próximo envío.");
      setNecesitaMigracion(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-bold">Correo de cotización PDF al cliente</h2>
        <span className="text-[11px] font-bold rounded-lg px-2 py-1 bg-sky-50 text-sky-700">
          PLANTILLA
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-1">
        Asunto y contenido que se usan al enviar el PDF desde Cotizaciones → detalle → Enviar por correo.
        Los avisos por hora de arriba usan el proveedor configurado (SendGrid o Resend).
      </p>
      {necesitaMigracion && (
        <p className="mt-3 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
          Falta la tabla cfg_correos: ejecuta supabase/migracion_correos_01.sql en el SQL Editor de Supabase.
        </p>
      )}
      <div className="mt-4">
        <label className="label">Asunto (usa {"{codigo}"}, {"{cliente}"})</label>
        <input
          className="input"
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
          disabled={cargando}
          placeholder="Cotización {codigo} Ambientes Cáliddos"
        />
      </div>
      <div className="mt-3">
        <label className="label">Mensaje</label>
        <textarea
          className="input min-h-[220px]"
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          disabled={cargando}
        />
        <p className="text-xs text-slate-400 mt-1">
          Variables: {"{cliente}"}, {"{codigo}"}, {"{total}"}, {"{adelanto}"}, {"{capital}"}, {"{tea}"},
          {" "}{"{plazo}"}, {"{cuota}"}, {"{detalles}"}, {"{observaciones}"}.
        </p>
      </div>
      {msg && <p className="mt-3 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">{msg}</p>}
      {ok && <p className="mt-3 text-sm rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2">{ok}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-green" onClick={guardar} disabled={trabajando || cargando}>
          {trabajando ? "Guardando…" : "Guardar plantilla"}
        </button>
      </div>
    </div>
  );
}

export default function CortesPage() {
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [necesitaMigracion, setNecesitaMigracion] = useState(false);
  const [necesitaMigracionSubsanaciones, setNecesitaMigracionSubsanaciones] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      const r = await apiOperacion<{ cortes?: Corte[]; necesitaMigracion?: boolean; necesitaMigracionSubsanaciones?: boolean }>("cfgCortesListar", {});
      setCortes(Array.isArray(r?.cortes) ? r.cortes : []);
      setNecesitaMigracion(!!r?.necesitaMigracion);
      setNecesitaMigracionSubsanaciones(!!r?.necesitaMigracionSubsanaciones);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <AuthGate><Shell>
      <ModHead
        eyebrow="CONSOLA ADMINISTRATIVA"
        title="Cortes y correos programados"
        desc="Horas (Lima), destinatarios, asunto y mensaje de cada aviso. También puedes editar la plantilla del PDF de cotización. Los envíos usan SendGrid o Resend."
      />
      <div className="space-y-4 mt-4">
        {loading && <div className="card p-8 text-slate-500">Cargando…</div>}
        {error && <p className="card p-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
        {necesitaMigracion && (
          <p className="card p-4 text-sm text-amber-800 bg-amber-50 border-amber-200">
            Falta la tabla cfg_cortes: ejecuta la migración 03 (etapa 5) en el SQL Editor de Supabase.
          </p>
        )}
        {!necesitaMigracion && necesitaMigracionSubsanaciones && (
          <p className="card p-4 text-sm text-amber-800 bg-amber-50 border-amber-200">
            Para habilitar los avisos configurables de subsanación, ejecuta <b>supabase/migracion_subsanaciones_correo_01.sql</b> en el SQL Editor de Supabase.
          </p>
        )}
        {!loading && !necesitaMigracion && cortes.map((c) => (
          <CorteCard key={c.clave} c={c} onGuardado={() => cargar(true)} />
        ))}
        {!loading && !necesitaMigracion && cortes.some((c) => c.clave === "subsanaciones") && <ProveedoresSubsanacionesCard />}
        {!loading && <CorreoCotizacionCard />}
      </div>
    </Shell></AuthGate>
  );
}
