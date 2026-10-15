// Genera supabase/carga_amca_{proveedores,asesores,materiales}.sql desde el Excel AMCA.
// Uso: node scripts/gen_amca.js  (correr desde COTIZADOR)
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const XLS = "C:\\Users\\agente.calidda\\Downloads\\Materiales_ AMCA 2026.xlsx";
const OUT = path.join(__dirname, "..", "supabase");
const q = (v) => String(v ?? "").replace(/'/g, "''").trim();
const qn = (v) => {
  const s = String(v ?? "").trim();
  return s ? `'${s.replace(/'/g, "''")}'` : "NULL";
};

const wb = XLSX.readFile(XLS);
const J = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" }).slice(1);

// ---------- datos ----------
const seenProv = new Map();
for (const r of J("PROVEEDORES")) {
  const bp = String(r[1] ?? "").trim();
  if (!r[0] || !bp || seenProv.has(bp)) continue;
  seenProv.set(bp, { nombre: String(r[0]).trim(), ofi: String(r[2] ?? "").trim() || "AMCA", grupo: String(r[3] ?? "").trim() });
}
const gruposProv = [...new Set([...seenProv.values()].map((p) => p.grupo).filter(Boolean))];
const gruposMat = [...new Set(J("MATERIALES ").map((r) => String(r[9] ?? "").trim()).filter(Boolean))];
const grupos = [...new Set([...gruposProv, ...gruposMat])];

// ---------- 1. PROVEEDORES ----------
let s1 = `-- Carga AMCA · proveedores/oficinas/grupos/vínculos (${seenProv.size} proveedores).
-- Generado desde "Materiales_ AMCA 2026.xlsx" hoja PROVEEDORES. Idempotente (DO + upserts).
-- Grupos: codigo_sap = código de la hoja, nombre = 'Grupo <cod>'.
DO $$
DECLARE v_ofv text; v_n int; v_id text;
BEGIN
  SELECT id INTO v_ofv FROM public.mae_oficinas_ventas WHERE id = 'OFV0001';
  IF v_ofv IS NULL THEN
    INSERT INTO public.mae_oficinas_ventas (id, codigo_sap, nombre, descripcion, estado)
    VALUES ('OFV0001','AMCA','Ambientes Cáliddos','Venta de Muebles de Melamina','ACTIVO');
    v_ofv := 'OFV0001';
  END IF;
  SELECT COALESCE(max(substring(id from 4)::int), 0) INTO v_n FROM public.mae_proveedores WHERE id ~ '^PRV[0-9]{4}$';
`;
for (const [bp, p] of seenProv) {
  s1 += `  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '${q(bp)}') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '${q(bp)}', NULL, '${q(p.nombre)}', '${q(p.nombre)}', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = '${q(p.nombre)}' WHERE interlocutor = '${q(bp)}';
  END IF;
`;
}
s1 += `  SELECT COALESCE(max(substring(id from 4)::int), 0) INTO v_n FROM public.mae_grupos_vendedores WHERE id ~ '^GVE[0-9]{4}$';
`;
for (const g of grupos) {
  s1 += `  IF NOT EXISTS (SELECT 1 FROM public.mae_grupos_vendedores WHERE codigo_sap = '${q(g)}') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_grupos_vendedores (id, codigo_sap, nombre, id_proveedor, id_oficina, estado)
    VALUES ('GVE' || lpad(v_n::text, 4, '0'), '${q(g)}', 'Grupo ${q(g)}', NULL, v_ofv, 'ACTIVO');
  END IF;
`;
}
s1 += `  SELECT COALESCE(max(substring(id from 4)::int), 0) INTO v_n FROM public.rel_proveedor_oficinas WHERE id ~ '^POF[0-9]{4}$';
`;
for (const bp of seenProv.keys()) {
  s1 += `  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '${q(bp)}' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '${q(bp)}';
  END IF;
`;
}
s1 += `END $$;
`;
fs.writeFileSync(path.join(OUT, "carga_amca_proveedores.sql"), s1);
console.log("proveedores:", seenProv.size, "| grupos:", grupos.length);

// ---------- 2. ASESORES ----------
const aseRows = [];
for (const r of J("ASESORES")) {
  if (!String(r[2] ?? "").trim()) continue;
  aseRows.push({ prov: String(r[0] ?? "").trim(), bp: String(r[1] ?? "").trim(), nombre: String(r[2]).trim(), tel: String(r[3] ?? "").trim() });
}
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 40);
let s2 = `-- Carga AMCA · asesores (${aseRows.length} filas de la hoja ASESORES).
-- Crea fichas seg_usuarios rol ASESOR con correo/DNI provisorios (ACTUALIZAR luego en Usuarios):
--   correo = slug + '@carga.amca.local', nro_doc = 'CARGA-<BP>-<n>'.
--   NO crea accesos Auth: con el correo real, créalos en Administración > Usuarios.
-- Idempotente (IF NOT EXISTS por correo).
DO $$
DECLARE v_n int;
BEGIN
  SELECT COALESCE(max(substring(id from 2)::int), 0) INTO v_n FROM public.seg_usuarios WHERE id ~ '^U[0-9]{5}$';
`;
aseRows.forEach((a, i) => {
  const mail = `${slug(a.nombre)}.${i + 1}@carga.amca.local`;
  const doc = `CARGA-${a.bp || "SBP"}-${i + 1}`;
  s2 += `  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = '${mail}') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), '${q(a.nombre)}', 'DNI', '${q(doc)}', '${mail}', ${qn(a.tel) || "NULL"},
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '${q(a.bp)}'), 'ACTIVO');
  END IF;
`;
});
s2 += `END $$;
`;
fs.writeFileSync(path.join(OUT, "carga_amca_asesores.sql"), s2);
console.log("asesores:", aseRows.length);

// ---------- 3. MATERIALES ----------
const rows = J("MATERIALES ").filter((r) => r[3]);
let s3 = `-- Carga AMCA · materiales (${rows.length} productos de la hoja MATERIALES).
-- ESPACIO: COTIZACION -> módulo Cotizaciones, VENTAS -> Solicitudes de venta.
-- MATERIAL (SAP) -> codigo_sap; sin código -> NULL. PRECIO -> tarifa inicial VIGENTE PEN.
-- Idempotente (por codigo_sap, o por nombre si no tiene código).
DO $$
DECLARE v_n int; v_id text;
BEGIN
  SELECT COALESCE(max(substring(id from 5)::int), 10000) INTO v_n FROM public.mae_materiales WHERE id ~ '^MAT-[0-9]{5}$';
`;
for (const r of rows) {
  const espacio = String(r[0] ?? "").toUpperCase().includes("COTIZ") ? "COTIZACION" : "VENTAS";
  const rem = String(r[1] ?? "").trim();
  const sap = String(r[2] ?? "").trim();
  const nom = String(r[3]).trim();
  const precio = String(r[4] ?? "").trim();
  const resp = String(r[5] ?? "").trim();
  const prv = String(r[6] ?? "").trim();
  const ase = String(r[7] ?? "").trim().replace(/\r\n|\r|\n/g, " / ");
  const ofi = String(r[8] ?? "").trim() || "AMCA";
  const gru = String(r[9] ?? "").trim();
  const pnum = precio === "" ? null : Number(String(precio).replace(",", "."));
  const cond = sap ? `codigo_sap = '${q(sap)}'` : `nombre = '${q(nom)}'`;
  s3 += `  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE ${cond}) THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, '${q(nom)}', ${resp ? `'Responsable: ${q(resp)}'` : "NULL"}, 'UND', 'LONGITUD', 2, 'ACTIVO', '${espacio}', ${qn(rem)},
      ${sap ? `'${q(sap)}'` : "NULL"},
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '${q(prv)}' OR nombre_comercial = '${q(prv)}' OR interlocutor = '${q(prv)}' LIMIT 1),
      ${qn(ase) || "NULL"},
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = '${q(ofi)}' OR nombre = '${q(ofi)}' LIMIT 1),
      ${gru ? `(SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = '${q(gru)}' LIMIT 1)` : "NULL"});
`;
  if (pnum != null && Number.isFinite(pnum)) {
    s3 += `    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, ${pnum}, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = ${pnum} AND t.fecha_inicio = CURRENT_DATE);
`;
  }
  s3 += `  END IF;
`;
}
s3 += `END $$;
`;
fs.writeFileSync(path.join(OUT, "carga_amca_materiales.sql"), s3);
console.log("materiales:", rows.length);
