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
};

function CorteCard({ c, onGuardado }: { c: Corte; onGuardado: () => void }) {
  const t = TITULOS[c.clave] ?? { titulo: c.clave, desc: "" };
  const [horas, setHoras] = useState(String(c.horas ?? ""));
  const [para, setPara] = useState(String(c.para ?? ""));
  const [copia, setCopia] = useState(String(c.copia ?? ""));
  const [asunto, setAsunto] = useState(String(c.asunto ?? ""));
  const [mensaje, setMensaje] = useState(String(c.mensaje ?? ""));
  const [activo, setActivo] = useState(!!c.activo);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const guardarConfig = async () => {
    await apiOperacion("cfgCorteGuardar", {
      clave: c.clave, horas, para, copia, asunto, mensaje, activo,
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
    if (!/@[a-z]/i.test(para.trim())) {
      setMsg("Escribe un correo destino válido antes de enviar la prueba.");
      return;
    }
    setTrabajando(true);
    try {
      await guardarConfig();
      const r = await apiOperacion<{ enviado?: boolean; motivo?: string; cantidad?: number }>("cfgCorteEnviar", { clave: c.clave });
      setOk(r?.enviado ? `Correo enviado (${r.cantidad ?? 0} pendientes).` : `No enviado: ${r?.motivo ?? ""}`);
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
        <div>
          <label className="label">Horas de corte (Lima, separadas por coma)</label>
          <input className="input" placeholder="12:00,17:00" value={horas} onChange={(e) => setHoras(e.target.value)} />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Corte activo
          </label>
        </div>
        <div>
          <label className="label">Correo destino *</label>
          <input className="input" placeholder="responsable@empresa.com" value={para} onChange={(e) => setPara(e.target.value)} />
        </div>
        <div>
          <label className="label">Correos en copia</label>
          <input className="input" placeholder="copia1@..., copia2@..." value={copia} onChange={(e) => setCopia(e.target.value)} />
        </div>
      </div>
      <div className="mt-3">
        <label className="label">Asunto (usa {"{cantidad}"}, {"{hora}"}, {"{fecha}"})</label>
        <input className="input" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
      </div>
      <div className="mt-3">
        <label className="label">Mensaje (usa {"{cantidad}"}, {"{hora}"}, {"{fecha}"}, {"{detalle}"})</label>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      const r = await apiOperacion<{ cortes?: Corte[]; necesitaMigracion?: boolean }>("cfgCortesListar", {});
      setCortes(Array.isArray(r?.cortes) ? r.cortes : []);
      setNecesitaMigracion(!!r?.necesitaMigracion);
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
        {!loading && !necesitaMigracion && cortes.map((c) => (
          <CorteCard key={c.clave} c={c} onGuardado={() => cargar(true)} />
        ))}
        {!loading && <CorreoCotizacionCard />}
      </div>
    </Shell></AuthGate>
  );
}
