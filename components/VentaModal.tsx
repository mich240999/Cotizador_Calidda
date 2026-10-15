"use client";

import { useEffect, useMemo, useState } from "react";
import { apiOperacion } from "./Tablas";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { AccQuitar } from "./Accion";
import { TEA_FIJA, cuotaMensual, subirArchivoStorage, useRolVista } from "./VentasComun";

type Cliente = { id: string; nombres?: string; nombre?: string; nombre_razon_social?: string; dni?: string; nro_doc?: string; documento?: string; email?: string; correo?: string; telefono?: string };
type Proveedor = { id: string | number; nombre?: string; nombre_comercial?: string; razon_social?: string };
type Material = { id: string; codigo?: string; codigo_tmp?: string; nombre: string; descripcion?: string; precio_unit?: number; precio_vigente?: number; proveedor_nombre?: string | null };

/** Cotización origen para prellenar la solicitud (Etapa 3). */
export interface PrefillVenta {
  cotizacion_id: string;
  codigo: string;
  cliente: { id: string; nombres: string; doc: string; email: string; telefono: string; cuenta_contrato: string | null; ambiente: string };
  items: { descripcion: string; material_codigo: string; cantidad: number; precio_unit: number; descuento_pct: number }[];
  financiamiento: { cuota_inicial: number; capital: number; plazo: number; tea: number };
  proveedor: string;
  asesor: string;
  asesor_telefono: string;
}

/** Normaliza para comparar descripciones (sin tildes, minúsculas). */
function normTxt(s: string): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

type Item = {
  material_id: string; nombre: string; cantidad: number; precio: number;
  tarifaOK: boolean;
  dscto_monto: number; modo: "financiado" | "contado";
  medio: "financiado" | "efectivo" | "tarjeta";
  tea: number; cuotas: number;
};

const ITEM_VACIO: Item = { material_id: "", nombre: "", cantidad: 1, precio: 0, tarifaOK: false, dscto_monto: 0, modo: "financiado", medio: "financiado", tea: 40, cuotas: 9 };
const CUOTAS = [3, 6, 9, 12, 18, 24, 36, 48, 60];

const MEDIO_LABEL: Record<Item["medio"], string> = {
  financiado: "Pedido financiado",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
};

const nombreCliente = (c: Cliente) => c.nombres ?? c.nombre ?? c.nombre_razon_social ?? String(c.id);
const docCliente = (c: Cliente) => c.dni ?? c.nro_doc ?? c.documento ?? "";
const mailCliente = (c: Cliente) => c.email ?? c.correo ?? "";
const nombreProv = (p: Proveedor) => p.nombre ?? p.nombre_comercial ?? p.razon_social ?? String(p.id);
const codMat = (m: Material) => m.codigo ?? m.codigo_tmp ?? "";
const precioMat = (m: Material) => Number(m.precio_vigente ?? m.precio_unit ?? 0);

const netoItem = (it: Item) => Math.max(it.cantidad * it.precio - it.dscto_monto, 0);

function Adjunto({
  titulo, url, setUrl, onFile, obligatorio,
}: {
  titulo: string; url: string; setUrl: (u: string) => void; onFile: (f: File) => void; obligatorio?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="font-bold text-sm">{titulo} {obligatorio && <span className="text-red-600">*</span>}</p>
      <label className="label mt-2">URL del documento</label>
      <input className="input" placeholder="https://… (o sube el archivo)" value={url} onChange={(e) => setUrl(e.target.value)} />
      <label className="label mt-2">o subir PDF/foto (se guarda en Storage y se pega su URL)</label>
      <input
        type="file" accept=".pdf,image/*" className="input"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
      {url && <p className="text-[11px] text-emerald-700 mt-1 break-all">✓ Adjunto listo ({url.length > 120 ? url.slice(0, 120) + "…" : url})</p>}
    </div>
  );
}

export default function VentaModal({ onClose, prefill }: { onClose: () => void; prefill?: PrefillVenta }) {
  const { esAdmin } = useRolVista();
  const esPrefill = !!prefill;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [asesores, setAsesores] = useState<{ id: string; nombre?: string; telefono?: string; correo?: string; id_proveedor?: string | null }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [avisos, setAvisos] = useState<string[]>([]);

  const [buscaCliente, setBuscaCliente] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [estadoVisita, setEstadoVisita] = useState("visitado");
  const [canal, setCanal] = useState("proveedor");
  const [proveedorSel, setProveedorSel] = useState("");
  const [contratista, setContratista] = useState("");
  const [asesorId, setAsesorId] = useState("");
  const [asesorTel, setAsesorTel] = useState("");
  const [pago, setPago] = useState("financiado_total");
  const [items, setItems] = useState<Item[]>([]);
  const [cotUrl, setCotUrl] = useState("");
  const [dniUrl, setDniUrl] = useState("");
  const [espacioUrl, setEspacioUrl] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // SGT primero; si viene vacío se mezcla con la tabla base
      // (el backend migra al maestro SGT al guardar, sin error de FK).
      const qp: Promise<unknown> = (async () => {
        let sgt: unknown[] = [];
        try {
          const r = await apiOperacion<unknown>("listarClientesSGT", { limit: 500, pageSize: 500 });
          if (r && typeof r === "object" && Array.isArray((r as { rows?: unknown }).rows)) sgt = (r as { rows: unknown[] }).rows;
          else if (Array.isArray(r)) sgt = r as unknown[];
        } catch { /* cae a base */ }
        if (sgt.length > 0) return sgt;
        const b = await apiOperacion<unknown>("listarClientes", { limit: 500 });
        return Array.isArray(b) ? b : sgt;
      })();
      const [rc, rp, rm, ra] = await Promise.allSettled([
        qp,
        apiOperacion<unknown>("listarProveedoresSGT", { limit: 200 }),
        apiOperacion<unknown>("listarMaterialesSGT", { limit: 200, espacio: "VENTAS" }),
        apiOperacion<unknown>("listarUsuariosSGT", { limit: 500 }),
      ]);
      if (!vivo) return;
      const w: string[] = [];
      if (rc.status === "fulfilled" && Array.isArray(rc.value)) setClientes(rc.value as Cliente[]);
      else w.push("No se pudieron cargar los clientes del backend.");
      if (rp.status === "fulfilled" && Array.isArray(rp.value)) setProveedores(rp.value as Proveedor[]);
      else w.push("No se pudieron cargar los proveedores del backend.");
      if (rm.status === "fulfilled" && Array.isArray(rm.value)) setMateriales(rm.value as Material[]);
      else w.push("No se pudieron cargar los materiales del backend.");
      if (ra.status === "fulfilled" && Array.isArray(ra.value)) {
        const lista = (ra.value as { id: string; nombre?: string; telefono?: string; correo?: string; id_proveedor?: string | null; rol?: string; rol_codigo?: string }[])
          .filter((u) => ["ASESOR", "SUPERVISOR"].includes(String(u.rol ?? u.rol_codigo ?? "").toUpperCase()));
        setAsesores(lista);
        // Asesor por defecto: el usuario logueado (teléfono de su ficha + su empresa).
        try {
          const { data: ses } = await getSupabaseBrowser().auth.getSession();
          const mail = ses.session?.user?.email?.toLowerCase();
          const yo = mail ? lista.find((x) => String(x.correo ?? "").toLowerCase() === mail) : undefined;
          if (yo) {
            setAsesorId(String(yo.id));
            if (yo.telefono) setAsesorTel(String(yo.telefono));
            if (yo.id_proveedor) setProveedorSel(String(yo.id_proveedor));
          }
        } catch { /* sin sesión legible: selección manual */ }
      }
      setAvisos(w);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, []);

  // Prefill desde cotización: cliente bloqueado + datos del asesor/cotización.
  const [prefillListo, setPrefillListo] = useState(false);
  useEffect(() => {
    if (!prefill || cargando || prefillListo) return;
    setClienteId(prefill.cliente.id);
    // Mismo asesor de la cotización (por nombre); teléfono y proveedor de su ficha.
    const nomAse = normTxt(prefill.asesor);
    const ase = asesores.find((x) => normTxt(x.nombre ?? "") === nomAse)
      ?? asesores.find((x) => nomAse && normTxt(x.nombre ?? "").includes(nomAse));
    if (ase) {
      setAsesorId(String(ase.id));
      setAsesorTel(prefill.asesor_telefono || String(ase.telefono ?? ""));
      if (ase.id_proveedor) setProveedorSel(String(ase.id_proveedor));
    } else {
      if (prefill.asesor_telefono) setAsesorTel(prefill.asesor_telefono);
    }
    // Proveedor por nombre de la cotización (si la ficha del asesor no lo dio).
    setProveedorSel((prev) => {
      if (prev) return prev;
      const nomProv = normTxt(prefill.proveedor);
      const pv = proveedores.find((x) => normTxt(nombreProv(x)) === nomProv);
      return pv ? String(pv.id) : prev;
    });
    // Ítems de la cotización: match por descripción + mismo proveedor (editables).
    setItems(prefill.items.map((pi) => {
      const mejor = mejorMaterial(pi.descripcion, pi.material_codigo, normTxt(prefill.proveedor));
      const bruto = pi.cantidad * pi.precio_unit;
      const pct = Math.min(100, Math.max(0, pi.descuento_pct || 0));
      return {
        material_id: mejor?.id ?? "",
        nombre: pi.descripcion || (mejor ? `${codMat(mejor)} ${mejor.nombre}`.trim() : ""),
        cantidad: pi.cantidad,
        precio: pi.precio_unit,
        tarifaOK: mejor ? precioMat(mejor) > 0 : false,
        dscto_monto: Math.round(bruto * (pct / 100) * 100) / 100,
        modo: "financiado" as const,
        medio: "financiado" as const,
        tea: Math.round(prefill.financiamiento.tea * 100),
        cuotas: prefill.financiamiento.plazo,
      };
    }));
    setPrefillListo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, prefill, prefillListo, asesores, proveedores, materiales]);

  /** Mejor material del catálogo por código o por coincidencia de descripción + proveedor. */
  function mejorMaterial(descripcion: string, codigo: string, proveedorNorm: string): Material | null {
    const cod = normTxt(codigo);
    if (cod) {
      const porCod = materiales.find((m) => normTxt(codMat(m)) === cod);
      if (porCod) return porCod;
    }
    const descToks = new Set(normTxt(descripcion).split(" ").filter((t) => t.length > 2));
    if (descToks.size === 0) return null;
    let mejor: Material | null = null;
    let mejorScore = 0;
    for (const m of materiales) {
      if (proveedorNorm && m.proveedor_nombre && normTxt(m.proveedor_nombre) !== proveedorNorm) continue;
      const toks = normTxt(`${codMat(m)} ${m.nombre}`).split(" ").filter((t) => t.length > 2);
      if (toks.length === 0) continue;
      const hit = toks.filter((t) => descToks.has(t)).length / toks.length;
      if (hit > mejorScore) { mejorScore = hit; mejor = m; }
    }
    return mejorScore >= 0.4 ? mejor : null;
  }

  // Pago automático según modos de ítems (prefill): todo financiado / todo contado / mixto.
  useEffect(() => {
    if (!esPrefill || items.length === 0) return;
    const modos = items.map((it) => it.modo);
    setPago(
      modos.every((m) => m === "financiado") ? "financiado_total"
      : modos.every((m) => m === "contado") ? "contado_total" : "mixto"
    );
  }, [items, esPrefill]);

  const clientesFiltrados = useMemo(() => {
    const s = buscaCliente.trim().toLowerCase();
    if (!s) return clientes;
    return clientes.filter((c) => [nombreCliente(c), docCliente(c), mailCliente(c), String(c.id)].join(" ").toLowerCase().includes(s));
  }, [clientes, buscaCliente]);

  const clienteSel = useMemo(() => clientes.find((c) => String(c.id) === clienteId) ?? null, [clientes, clienteId]);

  const elegirMaterial = (i: number, materialId: string) => {
    const m = materiales.find((x) => String(x.id) === materialId);
    setItems((prev) => prev.map((f, j) => j === i ? {
      ...f,
      material_id: materialId,
      nombre: m ? `${codMat(m)} ${m.nombre}`.trim() : f.nombre,
      precio: m ? precioMat(m) : f.precio,
      tarifaOK: m ? precioMat(m) > 0 : false,
    } : f));
  };
  const setItem = (i: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((f, j) => {
      if (j !== i) return f;
      const n = { ...f, ...patch };
      // Coherencia modo/medio: financiado siempre es pedido financiado;
      // contado solo admite efectivo o tarjeta.
      if (patch.modo === "contado" && n.medio === "financiado") n.medio = "efectivo";
      if (patch.modo === "financiado") n.medio = "financiado";
      return n;
    }));

  const subtotal = items.reduce((a, f) => a + f.cantidad * f.precio, 0);
  const descuento = items.reduce((a, f) => a + Math.min(f.dscto_monto, f.cantidad * f.precio), 0);
  const total = Math.max(subtotal - descuento, 0);

  const [subiendo, setSubiendo] = useState<string | null>(null);

  const subirArchivo = async (f: File, set: (u: string) => void, marca: string) => {
    setError(null);
    setSubiendo(marca);
    try {
      set(await subirArchivoStorage(f, "adjuntos"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(null);
    }
  };

  const nombreAsesorActual = asesores.find((x) => String(x.id) === asesorId)?.nombre ?? prefill?.asesor ?? "";
  const anticipoPrefill = prefill ? Math.max(Number(prefill.financiamiento.cuota_inicial ?? 0) || 0, 0) : 0;

  const guardar = async () => {
    setError(null);
    setOk(null);
    if (!clienteId) { setError(esPrefill ? "Sin cliente de la cotización." : "Busca y selecciona un cliente activo."); return; }
    if (!esPrefill && !asesorId) { setError("Selecciona el asesor de la venta."); return; }
    if (canal !== "contratista" && !proveedorSel) { setError(`Selecciona el ${canal}.`); return; }
    if (canal === "contratista" && !contratista.trim()) { setError("Indica el contratista."); return; }
    if (items.length === 0) { setError("Agrega al menos un material."); return; }
    for (const it of items) {
      if (!it.material_id) { setError("Cada ítem debe tener un material del catálogo (selecciónalo en su lista)."); return; }
      if (!(it.cantidad > 0)) { setError("Cada ítem debe tener cantidad mayor a 0."); return; }
      if (!(it.precio >= 0)) { setError("Precio inválido en un ítem."); return; }
    }
    if (!esPrefill) {
      if (!cotUrl.trim()) { setError("La cotización del cliente (PDF/foto) es obligatoria."); return; }
      if (!dniUrl.trim()) { setError("La foto del DNI es obligatoria."); return; }
    }
    setGuardando(true);
    try {
      const obsFinal = canal === "contratista" && contratista.trim()
        ? `Contratista: ${contratista.trim()}${obs.trim() ? ` · ${obs.trim()}` : ""}`
        : obs;
      const creada = await apiOperacion("crearSolicitudVenta", {
        id_cliente: clienteId,
        ...(canal === "contratista" ? {} : { id_proveedor: proveedorSel }),
        canal,
        es_microaliado: canal === "microaliado",
        visita_estado: estadoVisita,
        pago_modo: pago,
        proyecto_financiado: true,
        ...(asesorId ? { id_asesor: asesorId } : {}),
        ...(esPrefill && nombreAsesorActual ? { asesor: nombreAsesorActual } : {}),
        asesor_telefono: asesorTel.trim(),
        tea: esAdmin ? Number(items[0]?.tea ?? 40) : 40,
        observaciones: obsFinal,
        ...(esPrefill
          ? {
              cotizacion_id: prefill!.cotizacion_id,
              anticipo: anticipoPrefill,
              ambiente: prefill!.cliente.ambiente || "",
              nro_cuotas: prefill!.financiamiento.plazo,
            }
          : {
              adjunto_cotizacion_url: cotUrl.trim(),
              adjunto_dni_url: dniUrl.trim(),
              foto_espacio_url: espacioUrl.trim(),
            }),
        items: items.map((it) => ({
          id_material: it.material_id,
          cantidad: it.cantidad,
          precio_unit: it.precio,
          descuento_monto: it.dscto_monto,
          modo: it.modo,
          medio_pago: it.medio,
        })),
      });
      const cod = (creada as { numero?: string; codigo?: string; id?: string })?.numero
        ?? (creada as { codigo?: string })?.codigo ?? (creada as { id?: string })?.id ?? "";
      setOk(cod ? `Borrador guardado: ${cod}` : "Borrador guardado correctamente.");
      setTimeout(onClose, 1200);
    } catch (e) {
      const m = e instanceof Error ? e.message : "No se pudo guardar";
      // El backend anterior exigía adjuntos: si responde eso, no está actualizado.
      if (esPrefill && /adjunto_.*(8 character|min)/i.test(m)) {
        setError("El servidor aún no tiene la actualización (exige adjuntos del flujo anterior). Verifica en /api/version que el commit sea el último y haz Redeploy en Render.");
      } else {
        setError(m);
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-xl my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-extrabold">Nueva solicitud de venta</h2>
            {esPrefill && prefill && (
              <span className="text-[11px] font-bold bg-emerald-100 text-emerald-700 rounded-lg px-2 py-1">Desde {prefill.codigo}</span>
            )}
            <span className="text-[11px] font-bold bg-sky-100 text-sky-700 rounded-lg px-2 py-1">Borrador sin guardar</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-white !py-2" onClick={onClose}>Cerrar</button>
            <button className="btn-green !py-2" onClick={guardar} disabled={guardando || cargando}>{guardando ? "Guardando…" : "Guardar como borrador"}</button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error && <p className="card p-3 text-sm text-red-700 bg-red-50 border-red-200">{error}</p>}
          {ok && <p className="card p-3 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{ok}</p>}
          {avisos.map((a) => <p key={a} className="card p-3 text-sm text-amber-800 bg-amber-50 border-amber-200">{a}</p>)}
          {cargando && <p className="text-sm text-slate-500">Cargando catálogos del backend…</p>}

          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Cliente{esPrefill ? " de la cotización" : " y visita"}</h3>
            <p className="text-xs text-slate-400 mb-3">{esPrefill ? "Viene de la cotización y no se puede cambiar." : "Busca al cliente por documento, nombre, correo o ID."}</p>
            {esPrefill && prefill ? (
              <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 p-3">
                <p className="font-bold text-sm uppercase">{prefill.cliente.nombres}</p>
                <p className="text-xs text-slate-500">
                  {[prefill.cliente.doc && `Doc ${prefill.cliente.doc}`, prefill.cliente.email, prefill.cliente.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                </p>
                {prefill.cliente.cuenta_contrato && (
                  <p className="text-xs font-bold text-emerald-700 mt-1">Cta. Contrato: {prefill.cliente.cuenta_contrato}</p>
                )}
              </div>
            ) : (
            <>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="label">Buscar cliente (multicampo)</label>
                <input className="input" placeholder="Documento, nombre, correo o ID" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
              </div>
              <div>
                <label className="label">Cliente seleccionado *</label>
                <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {clientesFiltrados.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>{nombreCliente(c)}{docCliente(c) ? ` · ${docCliente(c)}` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Estado de visita</label>
                <select className="input" value={estadoVisita} onChange={(e) => setEstadoVisita(e.target.value)}>
                  <option value="visitado">Visitado</option>
                  <option value="agendado">Agendado</option>
                </select>
              </div>
            </div>
            {clienteSel ? (
              <div className="mt-3 rounded-xl bg-emerald-50/60 border border-emerald-100 p-3">
                <p className="font-bold text-sm uppercase">{nombreCliente(clienteSel)}</p>
                <p className="text-xs text-slate-500">{[docCliente(clienteSel), mailCliente(clienteSel), clienteSel.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-emerald-50/60 border border-emerald-100 p-3">
                <p className="font-bold text-sm">Cliente no seleccionado</p>
                <p className="text-xs text-slate-500">Busca y selecciona un cliente activo.</p>
              </div>
            )}
            </>
            )}
            <div className="grid md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="label">Canal</label>
                <select className="input" value={canal} onChange={(e) => { setCanal(e.target.value); setProveedorSel(""); }}>
                  <option value="proveedor">Proveedor</option>
                  <option value="microaliado">Microaliado</option>
                  <option value="contratista">Contratista</option>
                </select>
              </div>
              {canal === "contratista" ? (
                <div>
                  <label className="label">Contratista *</label>
                  <input className="input" placeholder="Nombre del contratista" value={contratista} onChange={(e) => setContratista(e.target.value)} />
                </div>
              ) : (
                <div>
                  <label className="label">{canal === "microaliado" ? "Microaliado *" : "Proveedor *"}</label>
                  <select className="input" value={proveedorSel} onChange={(e) => setProveedorSel(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {proveedores.map((p) => <option key={String(p.id)} value={String(p.id)}>{nombreProv(p)}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="grid md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="label">Asesor *</label>
                <select
                  className="input"
                  value={asesorId}
                  onChange={(e) => {
                    setAsesorId(e.target.value);
                    const a = asesores.find((x) => String(x.id) === e.target.value);
                    if (a?.telefono) setAsesorTel(String(a.telefono));
                  }}
                >
                  <option value="">— Seleccionar —</option>
                  {asesores.map((a) => (
                    <option key={String(a.id)} value={String(a.id)}>{a.nombre ?? a.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Teléfono del asesor</label>
                <input className="input" placeholder="999 999 999" value={asesorTel} onChange={(e) => setAsesorTel(e.target.value)} />
              </div>
            <div>
              <label className="label">Pago{esPrefill ? " (según modos de ítems)" : ""}</label>
              <select className="input" value={pago} onChange={(e) => setPago(e.target.value)} disabled={esPrefill}>
                <option value="financiado_total">Financiado total</option>
                <option value="mixto">Mixto (financiado + contado)</option>
                <option value="contado_total">Contado</option>
              </select>
            </div>
            </div>
          </section>

          <section className="card !shadow-none p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="font-bold">Ítems por material</h3>
                <p className="text-xs text-slate-400">Precio editable. Financiamiento por material con TEA {esAdmin ? "editable (admin)" : "fija 40%"}. Contado: efectivo o tarjeta.</p>
              </div>
              <button className="btn-white !py-1.5 !text-xs whitespace-nowrap" onClick={() => setItems((p) => [...p, { material_id: "", nombre: "", cantidad: 1, precio: 0, tarifaOK: false, dscto_monto: 0, modo: "financiado", medio: "financiado", tea: 40, cuotas: 9 }])}>Agregar material</button>
            </div>
            {items.length === 0 ? (
              <p className="text-center text-slate-400 py-8 text-sm">Agrega al menos un material.</p>
            ) : (
              <div className="space-y-4 mt-3">
                {items.map((it, i) => {
                  const neto = netoItem(it);
                  const cap = it.modo === "financiado" ? neto : 0;
                  const teaDec = (esAdmin ? it.tea : 40) / 100 || TEA_FIJA;
                  return (
                    <div key={i} className="rounded-xl border border-slate-200 p-4">
                      <div className="grid md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                          <label className="label">Material (lista desplegable) *</label>
                          <select className="input" value={it.material_id} onChange={(e) => {
                            const m = materiales.find((x) => String(x.id) === e.target.value);
                            setItem(i, {
                              material_id: e.target.value,
                              nombre: m ? `${codMat(m)} ${m.nombre}`.trim() : it.nombre,
                              precio: m ? precioMat(m) : it.precio,
                              tarifaOK: m ? precioMat(m) > 0 : false,
                            });
                          }}>
                            <option value="">— Seleccionar —</option>
                            {materiales.map((x) => (
                              <option key={String(x.id)} value={String(x.id)}>{`${codMat(x)} ${x.nombre} — S/ ${precioMat(x).toFixed(2)}`.trim()}</option>
                            ))}
                          </select>
                        </div>
                        <div><label className="label">Cantidad *</label><input type="number" min={0.01} step="any" className="input" value={it.cantidad} onChange={(e) => setItem(i, { cantidad: Number(e.target.value) })} /></div>
                        <div><label className="label">Precio (S/) *</label><input type="number" min={0} step="any" className="input font-semibold text-emerald-700" value={it.precio} onChange={(e) => setItem(i, { precio: Number(e.target.value) })} />
                        {!it.tarifaOK && it.material_id !== "" && <p className="text-[11px] text-amber-600 mt-1">Sin tarifa vigente: precio manual.</p>}</div>
                        <div><label className="label">Dscto. monto (S/)</label><input type="number" min={0} step="any" className="input" value={it.dscto_monto} onChange={(e) => setItem(i, { dscto_monto: Number(e.target.value) })} />
                        {(() => { const b = it.cantidad * it.precio; const p = b > 0 ? (Math.min(it.dscto_monto, b) / b) * 100 : 0; return <p className="text-[11px] text-slate-400 mt-1">= {p.toFixed(1)}% de la línea</p>; })()}</div>
                        <div>
                          <label className="label">Modo</label>
                          <select className="input" value={it.modo} onChange={(e) => setItem(i, { modo: e.target.value as Item["modo"] })}>
                            <option value="financiado">Financiado</option>
                            <option value="contado">Contado</option>
                          </select>
                        </div>
                        {it.modo === "financiado" ? (
                          <div>
                            <label className="label">Medio</label>
                            <div className="input bg-emerald-50/60 border-emerald-200 font-semibold text-emerald-700">Pedido financiado</div>
                          </div>
                        ) : (
                          <div>
                            <label className="label">Medio</label>
                            <select className="input" value={it.medio} onChange={(e) => setItem(i, { medio: e.target.value as Item["medio"] })}>
                              <option value="efectivo">Efectivo</option>
                              <option value="tarjeta">Tarjeta de crédito</option>
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="label">TEA % {esAdmin ? "(editable: admin)" : "(fija 40%)"}</label>
                          <input type="number" min={0} step="any" className="input" value={esAdmin ? it.tea : 40} readOnly={!esAdmin} onChange={(e) => setItem(i, { tea: Number(e.target.value) })} />
                        </div>
                        {it.modo === "financiado" ? (
                          <div>
                            <label className="label">Cuotas</label>
                            <select className="input" value={it.cuotas} onChange={(e) => setItem(i, { cuotas: Number(e.target.value) })}>
                              {CUOTAS.map((n) => <option key={n} value={n}>{n} cuotas · S/ {cuotaMensual(cap, n, teaDec).toFixed(2)}</option>)}
                            </select>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500 self-end">Contado: sin financiamiento.</div>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-sm">Neto: <b className="text-emerald-700">S/ {neto.toFixed(2)}</b>
                          {it.modo === "financiado" && <span className="text-slate-500"> · Cuota {it.cuotas}: S/ {cuotaMensual(cap, it.cuotas, teaDec).toFixed(2)}</span>}
                        </p>
                        <AccQuitar title="Quitar material" onClick={() => setItems((p) => p.filter((_, j) => j !== i))} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className={`grid gap-3 mt-4 ${esPrefill ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
              {((esPrefill
                ? [["Subtotal", subtotal], ["Descuento", descuento], ["Total", total], ["Anticipo (cuota inicial)", anticipoPrefill]]
                : [["Subtotal", subtotal], ["Descuento", descuento], ["Total", total]]) as [string, number][]).map(([l, v]) => (
                <div key={l} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-[11px] text-slate-400">{l}</p>
                  <p className="font-extrabold">S/ {v.toFixed(2)}</p>
                </div>
              ))}
            </div>
            {esPrefill && (
              <p className="text-[11px] text-slate-400 mt-2">Valor a financiar: S/ {Math.max(total - anticipoPrefill, 0).toFixed(2)} (el anticipo viene de la cotización).</p>
            )}
          </section>

          {esPrefill && prefill ? (
          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Cotización origen</h3>
            <p className="text-xs text-slate-400 mb-3">El PDF se vuelve a generar desde la base de datos; no se almacena ni se sube ningún otro sustento.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-[#0099D8]">{prefill.codigo}</span>
              <a className="btn-white !py-1.5 !text-xs" href={`/api/cotizaciones/${prefill.cotizacion_id}/pdf`} target="_blank" rel="noreferrer">Ver PDF cotización</a>
            </div>
          </section>
          ) : (
          <section className="card !shadow-none p-5">
            <h3 className="font-bold">Adjuntos obligatorios</h3>
            <p className="text-xs text-slate-400 mb-3">Sin ambos adjuntos no se puede registrar la solicitud.</p>
            <div className="grid md:grid-cols-2 gap-3">
            <Adjunto titulo="Cotización del cliente (PDF/foto)" url={cotUrl} setUrl={setCotUrl} onFile={(f) => subirArchivo(f, setCotUrl, "cot")} obligatorio />
            <Adjunto titulo="Foto DNI" url={dniUrl} setUrl={setDniUrl} onFile={(f) => subirArchivo(f, setDniUrl, "dni")} obligatorio />
            </div>
            <div className="mt-3">
            <Adjunto titulo="Foto del espacio" url={espacioUrl} setUrl={setEspacioUrl} onFile={(f) => subirArchivo(f, setEspacioUrl, "espacio")} />
            </div>
          </section>
          )}

          <section>
            <label className="label">Observaciones</label>
            <textarea className="input min-h-[80px]" placeholder="Condiciones o comentarios de la solicitud" value={obs} onChange={(e) => setObs(e.target.value)} />
          </section>
        </div>
      </div>
    </div>
  );
}
