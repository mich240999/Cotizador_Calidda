"use client";

import { useEffect, useMemo, useState } from "react";
import { apiOperacion } from "./Tablas";
import { AccQuitar } from "./Accion";
import { componerObservaciones } from "@/lib/detallesMueble";
import { cuotaFrancesaConIgv } from "@/lib/financiamiento";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

const CUOTAS = [3, 6, 9, 12, 18, 24, 36, 48, 60];

const fmtMiles = (n: number) =>
  `S/ ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function cuotaMensual(capital: number, n: number) {
  if (capital <= 0) return 0;
  return cuotaFrancesaConIgv(capital, 0.4, n);
}

type Cliente = { id: string; nombres?: string; nombre?: string; nombre_razon_social?: string; dni?: string; nro_doc?: string; email?: string; correo?: string; telefono?: string; cuenta_contrato?: string };
type Proveedor = { id: string | number; nombre?: string; nombre_comercial?: string; razon_social?: string; id_integrador?: string | null; integrador_nombre?: string | null };
type UsuarioSGT = { id: string | number; nombre: string; telefono?: string; correo?: string; id_proveedor?: string | number | null; id_integrador?: string | null; rol?: string; rol_codigo?: string };
type Material = { id: string; codigo?: string; codigo_sap?: string; codigo_tmp?: string; nombre: string; descripcion?: string; espacio?: string | null; espacio_remodelar?: string; id_proveedor?: string | number | null; proveedor_nombre?: string | null; precio_unit?: number; precio_vigente?: number };

type Fila = { material_id: string; nombre: string; descripcion: string; ambiente: string; tipo_remodelacion: string; alto: string; ancho: string; fondo: string; precio: number };

const FILA_VACIA: Fila = { material_id: "", nombre: "", descripcion: "", ambiente: "", tipo_remodelacion: "", alto: "", ancho: "", fondo: "", precio: 0 };

const nombreCliente = (c: Cliente) => c.nombres ?? c.nombre ?? c.nombre_razon_social ?? c.id;
const docCliente = (c: Cliente) => c.dni ?? c.nro_doc ?? "";
const mailCliente = (c: Cliente) => c.email ?? c.correo ?? "";
const nombreProv = (p: Proveedor) => p.nombre ?? p.nombre_comercial ?? p.razon_social ?? String(p.id);
const codMat = (m: Material) => m.codigo ?? m.codigo_tmp ?? "";
const precioMat = (m: Material) => Number(m.precio_vigente ?? m.precio_unit ?? 0);

export default function CotizacionModal({ onClose }: { onClose: () => void }) {
  const [cuotas, setCuotas] = useState(9);
  const [inicial, setInicial] = useState(0);
  const [clienteId, setClienteId] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [integradorId, setIntegradorId] = useState("");
  const [asesorId, setAsesorId] = useState("");
  const [asesores, setAsesores] = useState<UsuarioSGT[]>([]);
  const [tel, setTel] = useState("");
  const [obs, setObs] = useState("");
  const [det, setDet] = useState({
    marca_melamina: "",
    color_estructura: "",
    color_puertas: "",
    color_tablero: "",
    tiradores: "",
    vidrios: "",
  });
  const [mat, setMat] = useState<Fila[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [materialesRemodelacion, setMaterialesRemodelacion] = useState<Material[]>([]);
  const [cargando, setCargando] = useState(true);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Catálogos: se cargan una sola vez al abrir el modal.
  useEffect(() => {
    let vivo = true;
    (async () => {
      // Carga tolerante: si un catálogo falla, los otros igual se muestran.
      const [rp, rm, rr, ru] = await Promise.allSettled([
        apiOperacion<unknown>("listarProveedoresSGT", { limit: 200 }),
        apiOperacion<unknown>("listarMaterialesSGT", { limit: 500, espacio: "COTIZACION" }),
        apiOperacion<unknown>("listarMaterialesSGT", { limit: 500, espacio: "VENTAS", espacio_remodelar: "REMODELACION" }),
        apiOperacion<unknown>("listarUsuariosSGT", {}),
      ]);
      if (!vivo) return;
      const warns: string[] = [];
      if (rp.status === "fulfilled" && Array.isArray(rp.value)) setProveedores(rp.value as Proveedor[]);
      else warns.push("No se pudieron cargar los proveedores (ejecuta schema_sgt360.sql).");
      if (rm.status === "fulfilled" && Array.isArray(rm.value)) setMateriales(rm.value as Material[]);
      else warns.push("No se pudieron cargar los materiales con tarifa (ejecuta schema_sgt360.sql).");
      if (rr.status === "fulfilled" && Array.isArray(rr.value)) setMaterialesRemodelacion(rr.value as Material[]);
      if (ru.status === "fulfilled" && Array.isArray(ru.value)) {
        const soloAsesores = (ru.value as UsuarioSGT[]).filter((u) => {
          const rol = String(u.rol_codigo ?? u.rol ?? "").toUpperCase();
          return rol.includes("ASESOR") || rol.includes("SUPERVISOR");
        });
        setAsesores(soloAsesores);
      } else warns.push("No se pudieron cargar los asesores del backend.");
      setAvisos(warns);
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Búsqueda de clientes: SGT (mae_clientes) con fallback a tabla legacy.
  useEffect(() => {
    let vivo = true;
    const q = buscaCliente.trim();
    const t = setTimeout(async () => {
      try {
        const r = await apiOperacion<unknown>("listarClientesSGT", { q, limit: 500, pageSize: 100 });
        if (!vivo) return;
        if (r && typeof r === "object" && Array.isArray((r as { rows?: unknown }).rows)) {
          setClientes((r as { rows: unknown }).rows as Cliente[]);
        } else {
          setClientes(Array.isArray(r) ? (r as Cliente[]) : []);
        }
        setErrorBusqueda(null);
      } catch {
        if (!vivo) return;
        try {
          const r = await apiOperacion<unknown>("listarClientes", { q, limit: 500 });
          if (!vivo) return;
          setClientes(Array.isArray(r) ? (r as Cliente[]) : []);
          setErrorBusqueda(null);
        } catch {
          if (!vivo) return;
          setClientes([]);
          setErrorBusqueda("No se pudieron cargar los clientes. Revisa la conexión.");
        }
      }
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [buscaCliente]);

  // Si quien crea es un asesor logueado, asesor + proveedor ya vienen seteados.
  const [autoAsesor, setAutoAsesor] = useState(false);
  useEffect(() => {
    if (autoAsesor || asesores.length === 0 || cargando) return;
    (async () => {
      try {
        const { data: ses } = await getSupabaseBrowser().auth.getSession();
        const mail = ses.session?.user?.email?.toLowerCase();
        if (!mail) return;
        const yo = asesores.find((x) => String(x.correo ?? "").toLowerCase() === mail);
        if (yo) {
          setAutoAsesor(true);
          elegirAsesor(String(yo.id));
        }
      } catch { /* sin sesión legible: selección manual */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asesores, proveedores, cargando, autoAsesor]);

  const clienteSel = useMemo(() => clientes.find((c) => String(c.id) === clienteId) ?? null, [clientes, clienteId]);

  const asesorSel = useMemo(() => asesores.find((a) => String(a.id) === asesorId) ?? null, [asesores, asesorId]);

  const elegirAsesor = (id: string) => {
    setAsesorId(id);
    const u = asesores.find((a) => String(a.id) === id);
    if (!u) return;
    if (u.telefono) setTel(String(u.telefono));
    setIntegradorId(String(u.id_integrador ?? ""));
    // Si la ficha pertenece a un proveedor, queda fijado a ese proveedor.
    // Si pertenece a un integrador, el usuario elige uno de sus proveedores.
    if (u.id_proveedor != null && String(u.id_proveedor) !== "") {
      const p = proveedores.find((x) => String(x.id) === String(u.id_proveedor));
      if (p) {
        setProveedorId(String(p.id));
        setProveedor(nombreProv(p));
        setIntegradorId(String(p.id_integrador ?? u.id_integrador ?? ""));
      } else {
        setProveedorId("");
        setProveedor("");
      }
    } else {
      setProveedorId("");
      setProveedor("");
    }
  };

  const proveedoresVisibles = useMemo(() => {
    const asesor = asesores.find((a) => String(a.id) === asesorId);
    if (asesor?.id_proveedor) return proveedores.filter((p) => String(p.id) === String(asesor.id_proveedor));
    if (asesor?.id_integrador) return proveedores.filter((p) => String(p.id_integrador ?? "") === String(asesor.id_integrador));
    return proveedores;
  }, [asesores, asesorId, proveedores]);

  const proveedorSelId = useMemo(() => {
    if (proveedorId) return proveedorId;
    const p = proveedores.find((x) => nombreProv(x) === proveedor);
    return p ? String(p.id) : "";
  }, [proveedorId, proveedores, proveedor]);

  const proveedorSelNombre = useMemo(() => {
    const p = proveedores.find((x) => String(x.id) === proveedorSelId);
    return p ? nombreProv(p) : proveedor;
  }, [proveedores, proveedorSelId, proveedor]);
  const integradorSelNombre = useMemo(() => {
    const p = proveedores.find((x) => String(x.id) === proveedorSelId);
    return String(p?.integrador_nombre ?? "");
  }, [proveedores, proveedorSelId]);

  const elegirMaterial = (i: number, materialId: string) => {
    const m = materiales.find((x) => String(x.id) === materialId);
    setMat((prev) =>
      prev.map((f, j) =>
        j === i
          ? {
              ...f,
              material_id: materialId,
              nombre: m ? `${codMat(m)} ${m.nombre}`.trim() : f.nombre,
              descripcion: m?.descripcion ?? "",
              ambiente: String(m?.espacio_remodelar ?? f.ambiente),
              tipo_remodelacion: String(m?.espacio_remodelar ?? "").toUpperCase() === "REMODELACION" ? f.tipo_remodelacion : "",
              precio: m ? 0 : f.precio,
            }
          : f
      )
    );
  };

  const setFila = (i: number, patch: Partial<Fila>) =>
    setMat((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const opcionesRemodelacion = useMemo(() => {
    const etiquetas = new Map<string, string>();
    for (const m of materialesRemodelacion) {
      const nombre = String(m.nombre ?? "").trim();
      if (!nombre) continue;
      let etiqueta = nombre;
      const separador = etiqueta.lastIndexOf(" - ");
      if (separador >= 0) {
        const sufijo = etiqueta.slice(separador + 3);
        const proveedor = String(m.proveedor_nombre ?? "");
        const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        const sufijoNorm = normalizar(sufijo);
        const proveedorNorm = normalizar(proveedor);
        if (sufijoNorm && proveedorNorm && (proveedorNorm.includes(sufijoNorm) || sufijoNorm.includes(proveedorNorm))) {
          etiqueta = etiqueta.slice(0, separador);
        }
      }
      etiqueta = etiqueta.replace(/^remodelaci[oó]n\s+cotizado\s+/i, "").trim();
      if (!etiqueta) continue;
      const clave = etiqueta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
      if (!etiquetas.has(clave)) etiquetas.set(clave, etiqueta);
    }
    return [...etiquetas.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [materialesRemodelacion]);

  const total = mat.reduce((a, f) => a + Math.max(Number(f.precio) || 0, 0), 0);
  const capital = Math.max(total - inicial, 0);
  const sim = useMemo(() => CUOTAS.map((n) => ({ n, v: cuotaMensual(capital || 0, n) })), [capital]);

  const guardar = async () => {
    setError(null);
    setOk(null);
    if (!clienteId) {
      setError("Busca y selecciona un cliente activo.");
      return;
    }
    if (!proveedor) {
      setError("Selecciona un proveedor.");
      return;
    }
    if (!proveedorSelId) {
      setError("La opción de proveedor no tiene una empresa registrada. Contacta al administrador.");
      return;
    }
    if (!asesorId || !asesorSel) {
      setError("Selecciona un asesor.");
      return;
    }
    if (mat.length === 0) {
      setError("Agrega al menos un material.");
      return;
    }
    for (const f of mat) {
      if (!f.material_id) {
        setError("Cada fila debe tener un material del catálogo.");
        return;
      }
      if (String(f.ambiente).toUpperCase() === "REMODELACION" && !f.tipo_remodelacion) {
        setError("Selecciona qué se va a remodelar en cada material de remodelación.");
        return;
      }
      if (!Number.isFinite(Number(f.precio)) || f.precio < 0) {
        setError("Cada material debe tener un precio válido.");
        return;
      }
    }
    const CAMPOS_DET: { clave: keyof typeof det; etiqueta: string }[] = [
      { clave: "marca_melamina", etiqueta: "Marca de Melamina" },
      { clave: "color_estructura", etiqueta: "Color estructura de mueble" },
      { clave: "color_puertas", etiqueta: "Color de Puertas" },
      { clave: "color_tablero", etiqueta: "Color Tablero" },
      { clave: "tiradores", etiqueta: "Tiradores" },
      { clave: "vidrios", etiqueta: "Vidrios" },
    ];
    for (const c of CAMPOS_DET) {
      if (!String(det[c.clave] ?? "").trim()) {
        setError(`El campo "${c.etiqueta}" es obligatorio.`);
        return;
      }
    }
    setGuardando(true);
    try {
      const items = mat.map((f) => {
        const m = materiales.find((x) => String(x.id) === f.material_id);
        return {
          material_id: f.material_id,
          codigo: m ? codMat(m) : "",
          descripcion: `${f.nombre}${f.descripcion ? ` — ${f.descripcion}` : ""}${f.tipo_remodelacion ? ` — Tipo de remodelación: ${f.tipo_remodelacion}` : ""}`.slice(0, 300),
          ambiente: f.ambiente || String(m?.espacio_remodelar ?? ""),
          alto: Number(f.alto) || 0,
          ancho: Number(f.ancho) || 0,
          fondo: Number(f.fondo) || 0,
          cantidad: 1,
          precio_unit: f.precio,
          descuento_pct: 0,
        };
      });
      let creada: unknown = null;
      const detalles = {
        marca_melamina: det.marca_melamina.trim(),
        color_estructura: det.color_estructura.trim(),
        color_puertas: det.color_puertas.trim(),
        color_tablero: det.color_tablero.trim(),
        tiradores: det.tiradores.trim(),
        vidrios: det.vidrios.trim(),
      };
      try {
        creada = await apiOperacion("crearCotizacionSGT", {
          cliente_id: clienteId,
          cuenta_contrato: clienteSel?.cuenta_contrato ?? "",
          items,
          cuota_inicial: inicial,
          tea: 40,
          plazo: cuotas,
          id_proveedor: proveedorSelId,
          id_integrador: integradorId,
          id_asesor: asesorId,
          proveedor,
          ambiente: [...new Set(items.map((i) => i.ambiente).filter(Boolean))].join(", "),
          asesor: asesorSel.nombre,
          asesor_telefono: tel,
          observaciones: obs,
          detalles,
        });
      } catch (eSgt) {
        // El flujo legacy solo acepta UUIDs: con IDs del maestro SGT (CLI…,
        // MAT-…) fallaría con "Invalid uuid" ocultando el error real.
        const esUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(String(v ?? ""));
        const usaSGT = !esUuid(clienteId) || items.some((f) => f.material_id && !esUuid(f.material_id));
        if (usaSGT) throw eSgt;
        creada = await apiOperacion("crearCotizacion", {
          cliente_id: clienteId,
          items,
          observaciones: componerObservaciones(detalles, obs),
        });
      }
      const cod = (creada as { codigo?: string; numero?: string })?.codigo ?? (creada as { numero?: string })?.numero ?? "";
      setOk(cod ? `Cotización guardada: ${cod}` : "Cotización guardada");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const opcionMaterial = (x: Material) => (
    <option key={String(x.id)} value={String(x.id)}>
      {`${codMat(x)} ${x.nombre} — ${fmtMiles(precioMat(x))}`.trim()}
    </option>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-xl my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-extrabold">Nueva cotización</h2>
            <span className="text-[11px] font-bold bg-sky-100 text-sky-700 rounded-lg px-2 py-1">Pendiente de guardar</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-white !py-2" onClick={onClose}>Cerrar</button>
            <button className="btn-green !py-2" onClick={guardar} disabled={guardando || cargando}>{guardando ? "Guardando…" : "Guardar cotización"}</button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error && <p className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
          {ok && <p className="card p-3 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{ok}</p>}
          {avisos.map((a) => (
            <p key={a} className="card p-3 text-sm text-amber-800 bg-amber-50 border-amber-200">{a}</p>
          ))}
          {cargando && <p className="text-sm text-slate-500">Cargando catálogos del backend…</p>}

          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Datos comerciales</h3>
            <p className="text-xs text-slate-400 mb-3">Cliente, proveedor y asesor.</p>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="label">Buscar cliente</label>
                <input className="input" placeholder="Documento, nombre, correo o ID" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
                {errorBusqueda && <p className="text-[11px] text-red-600 mt-1">{errorBusqueda}</p>}
              </div>
              <div>
                <label className="label">Empresa proveedora</label>
                <select
                  className="input"
                  value={proveedorSelId}
                  disabled={!!asesorSel?.id_proveedor}
                  onChange={(e) => {
                    const id = e.target.value;
                    setProveedorId(id);
                    const p = proveedores.find((x) => String(x.id) === id);
                    setProveedor(p ? nombreProv(p) : "");
                    setIntegradorId(String(p?.id_integrador ?? ""));
                  }}
                >
                  <option value="">— Seleccionar —</option>
                  {proveedoresVisibles.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>{nombreProv(p)}</option>
                  ))}
                </select>
                {integradorSelNombre && <p className="text-[11px] text-slate-400 mt-1">Integradora: {integradorSelNombre}</p>}
              </div>
              <div>
                <label className="label">Asesor *</label>
                <select className="input" value={asesorId} onChange={(e) => elegirAsesor(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {asesores.map((a) => (
                    <option key={String(a.id)} value={String(a.id)}>{a.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="label">Teléfono del asesor</label>
                <input className="input" placeholder="999 999 999" value={tel} onChange={(e) => setTel(e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className="label">Cliente seleccionado</label>
              <textarea
                className="input bg-slate-50"
                rows={2}
                readOnly
                value={
                  clienteSel
                    ? `${nombreCliente(clienteSel).toUpperCase()}\n${[docCliente(clienteSel) && `Doc ${docCliente(clienteSel)}`, mailCliente(clienteSel), clienteSel.telefono, clienteSel.cuenta_contrato && `Cta. Contrato ${clienteSel.cuenta_contrato}`].filter(Boolean).join(" · ") || "Sin datos de contacto"}`
                    : "Busca arriba y toca un cliente de la lista."
                }
              />
              <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {clientes.slice(0, 8).map((c) => {
                  const sel = String(c.id) === clienteId;
                  return (
                    <button
                      key={String(c.id)}
                      type="button"
                      onClick={() => setClienteId(String(c.id))}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-sky-50 ${sel ? "bg-emerald-50" : ""}`}
                    >
                      <span className={`font-bold ${sel ? "text-emerald-700" : ""}`}>
                        {sel ? "✓ " : ""}{nombreCliente(c)}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {[docCliente(c), mailCliente(c)].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  );
                })}
                {clientes.length === 0 && (
                  <p className="px-3 py-4 text-sm text-slate-400 text-center">Sin coincidencias para esa búsqueda.</p>
                )}
                {clientes.length > 8 && (
                  <p className="text-[11px] text-slate-400 mt-1">Mostrando 8 de {clientes.length}: afina la búsqueda.</p>
                )}
              </div>
              {clientes.length > 8 && (
                <p className="text-[11px] text-slate-400 mt-1">Mostrando 8 de {clientes.length}: afina la búsqueda.</p>
              )}
            </div>
          </section>

          <section className="card !shadow-none p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="font-bold">Materiales</h3>
                <p className="text-xs text-slate-400">Selecciona el ambiente y registra sus dimensiones. El precio de cada línea es editable y representa el valor total del material.</p>
              </div>
              <button className="btn-white !py-1.5 !text-xs whitespace-nowrap" onClick={() => setMat((p) => [...p, { ...FILA_VACIA }])}>Agregar material</button>
            </div>
            <div className="table-wrap mt-3">
              <table className="tabla">
                <thead><tr><th>MATERIAL / AMBIENTE</th><th>ALTO</th><th>ANCHO</th><th>FONDO</th><th>PRECIO (S/)</th><th></th></tr></thead>
                <tbody>
                  {mat.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-slate-400 py-8">Agrega un ambiente para cotizar.</td></tr>
                  )}
                  {mat.map((f, i) => (
                    <tr key={i}>
                      <td className="min-w-[240px]">
                        <select className="input !py-1" value={f.material_id} onChange={(e) => elegirMaterial(i, e.target.value)}>
                          <option value="">
                            — Seleccionar ambiente —
                          </option>
                          {materiales
                            .filter((m) => String(m.espacio ?? "").toUpperCase() === "COTIZACION")
                            .map(opcionMaterial)}
                        </select>
                        {f.descripcion && <p className="text-[11px] text-slate-400 mt-1 leading-snug">{f.descripcion}</p>}
                        {String(f.ambiente).toUpperCase() === "REMODELACION" && (
                          <div className="mt-2">
                            <label className="label">¿Qué se va a remodelar?</label>
                            <select
                              className="input !py-1"
                              value={f.tipo_remodelacion}
                              onChange={(e) => setFila(i, { tipo_remodelacion: e.target.value })}
                              required
                            >
                              <option value="">— Selecciona el tipo de remodelación —</option>
                              {opcionesRemodelacion.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
                            </select>
                            {opcionesRemodelacion.length === 0 && (
                              <p className="mt-1 text-[11px] text-amber-600">No hay materiales de remodelación cargados para generar esta lista.</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td><input type="number" min={0} step="0.01" className="input !w-24 !py-1" value={f.alto} onChange={(e) => setFila(i, { alto: e.target.value })} title="Alto en metros" /></td>
                      <td><input type="number" min={0} step="0.01" className="input !w-24 !py-1" value={f.ancho} onChange={(e) => setFila(i, { ancho: e.target.value })} title="Ancho en metros" /></td>
                      <td><input type="number" min={0} step="0.01" className="input !w-24 !py-1" value={f.fondo} onChange={(e) => setFila(i, { fondo: e.target.value })} title="Fondo en metros" /></td>
                      <td><input type="number" min={0} step="0.01" className="input !w-28 !py-1 font-semibold text-emerald-700" value={f.precio} onChange={(e) => setFila(i, { precio: Number(e.target.value) })} title="Precio editable del material" /></td>
                      <td><AccQuitar title="Quitar material" onClick={() => setMat((p) => p.filter((_, j) => j !== i))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Resumen de importes</h3>
            <p className="text-xs text-slate-400 mb-3">El interés se usa únicamente para calcular las cuotas; no se suma al precio de la cotización.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[["Valor de productos", total], ["Abono", inicial], ["Monto financiado", capital]].map(([label, v]) => (
                <div key={label as string} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-[11px] text-slate-400">{label}</p>
                  <p className="font-extrabold">{fmtMiles(v as number)}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Sin fila IGV: el IGV va incluido en las cuotas del financiamiento.</p>
          </section>

          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Financiamiento</h3>
            <p className="text-xs text-slate-400 mb-3">La TEA predeterminada es 40% y puede ajustarse según la condición vigente.</p>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-bold text-sm">Parámetros de financiamiento</p>
              <p className="text-xs text-slate-400 mb-3">Define la cuota inicial, la TEA y el plazo seleccionado.</p>
              <div className="grid md:grid-cols-3 gap-3">
                <div><label className="label">Adelanto (cuota inicial)</label><input type="number" min={0} step="0.01" className="input" value={inicial} onChange={(e) => setInicial(Number(e.target.value))} /></div>
                <div><label className="label">TEA predeterminada</label><input className="input" value="40%" readOnly /><p className="text-[11px] text-slate-400 mt-1">Ingresa el porcentaje anual, por ejemplo 40%.</p></div>
                <div><label className="label">Cuotas seleccionadas</label>
                  <select className="input" value={cuotas} onChange={(e) => setCuotas(Number(e.target.value))}>
                    {CUOTAS.map((n) => <option key={n} value={n}>{n} cuotas</option>)}
                  </select></div>
              </div>
            </div>
          </section>

          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Simulación de cuotas</h3>
            <p className="text-xs text-slate-400 mb-3">Fórmula Simulador AMCA (40% TEA): PMT mensual + IGV (18%) del interés mensual. El interés no altera el valor de los productos.</p>
            <div className="table-wrap">
              <table className="tabla">
                <thead><tr><th>CUOTAS</th><th>VALOR CUOTA</th><th></th></tr></thead>
                <tbody>
                  {sim.map((s) => (
                    <tr key={s.n} className={s.n === cuotas ? "bg-sky-50" : ""}>
                      <td className="font-bold">{s.n}{s.n === cuotas && <span className="ml-2 text-[11px] font-bold bg-sky-500 text-white rounded-lg px-2 py-0.5">✓ Elegida</span>}</td>
                      <td className="font-semibold">{fmtMiles(s.v)}</td>
                      <td>{s.n === cuotas ? null : <button className="text-xs text-[#0099D8] font-semibold" onClick={() => setCuotas(s.n)}>Elegir</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Detalles del mueble <span className="text-red-600">*</span></h3>
            <p className="text-xs text-slate-400 mb-3">Todos los campos son obligatorios para crear la cotización.</p>
            <div className="grid md:grid-cols-2 gap-3">
              {([
                ["marca_melamina", "Marca de Melamina"],
                ["color_estructura", "Color estructura de mueble"],
                ["color_puertas", "Color de Puertas"],
                ["color_tablero", "Color Tablero"],
                ["tiradores", "Tiradores"],
                ["vidrios", "Vidrios"],
              ] as const).map(([clave, etiqueta]) => (
                <div key={clave}>
                  <label className="label">{etiqueta} <span className="text-red-600">*</span></label>
                  <input
                    className="input"
                    placeholder={etiqueta}
                    value={det[clave]}
                    onChange={(e) => setDet((p) => ({ ...p, [clave]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <label className="label">Observaciones generales</label>
            <textarea className="input min-h-[90px]" placeholder="Condiciones, consideraciones o comentarios para la cotización" value={obs} onChange={(e) => setObs(e.target.value)} />
          </section>
        </div>
      </div>
    </div>
  );
}
