-- ============================================================================
-- SGT360 · Soluciones Hogar Cálidda · supabase/schema_sgt360.sql (NUEVO)
-- No reemplaza a schema.sql. Modelo según capturas Soluciones Hogar Cálidda.
-- Prefijos estilo SGT360: mae_ (maestros), pre_ (precios/tarifas),
--   rel_ (relaciones), seg_ (seguridad), ven_ (ventas/cotizaciones).
--   Prefijo vta_ queda reservado para facturación futura (no se crea tabla).
-- Orden: ejecutar en SQL Editor > New query > Run. Idempotente.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. Helpers: updated_at (is_admin va en sección 5, tras crear tablas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sgt360_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- NOTA: fn_sgt360_is_admin() se define en la sección 4 (después de crear las
-- tablas), porque las funciones LANGUAGE sql validan las tablas al crearse.
-- Cuota francesa con TEA (por defecto 40%):
--   i = (1+TEA)^(1/12)-1 ; cuota = P*i / (1-(1+i)^-n) ; redondeo 2 dec.
CREATE OR REPLACE FUNCTION public.fn_cuota_francesa(
  p_capital numeric, p_tea numeric DEFAULT 40, p_cuotas int DEFAULT 12
)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_i numeric;
  v_c numeric;
BEGIN
  IF p_capital IS NULL OR p_capital <= 0 THEN RETURN 0; END IF;
  IF p_cuotas IS NULL OR p_cuotas <= 0 THEN
    RAISE EXCEPTION 'p_cuotas debe ser > 0';
  END IF;
  IF p_tea IS NULL OR p_tea <= 0 THEN
    RETURN round(p_capital / p_cuotas, 2); -- sin interés
  END IF;
  v_i := power(1 + (p_tea / 100), 1.0/12) - 1;
  v_c := p_capital * v_i / (1 - power(1 + v_i, -p_cuotas));
  RETURN round(v_c, 2);
END $$;
COMMENT ON FUNCTION public.fn_cuota_francesa(numeric, numeric, int) IS 'SGT360: cuota francesa mensual dada TEA%. i=(1+TEA)^(1/12)-1.';

-- ----------------------------------------------------------------------------
-- 1. Maestros: proveedores y oficinas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mae_proveedores (
  id               TEXT PRIMARY KEY CHECK (id ~ '^PRV[0-9]{4}$'),
  interlocutor     TEXT NOT NULL UNIQUE,
  ruc              CHAR(11) NOT NULL UNIQUE CHECK (char_length(ruc) = 11),
  razon_social     TEXT NOT NULL,
  nombre_comercial TEXT,
  correo           TEXT,
  telefono         TEXT,
  estado           TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.mae_proveedores IS 'SGT360 mae: proveedores. id PRV000x.';

CREATE TABLE IF NOT EXISTS public.mae_oficinas_ventas (
  id          TEXT PRIMARY KEY,
  codigo_sap  TEXT NOT NULL UNIQUE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  estado      TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.mae_oficinas_ventas IS 'SGT360 mae: oficinas de ventas (codigo_sap ej. AMCA-OFV0001).';

CREATE TABLE IF NOT EXISTS public.rel_proveedor_oficinas (
  id           TEXT PRIMARY KEY CHECK (id ~ '^POF[0-9]{4}$'),
  id_proveedor TEXT NOT NULL REFERENCES public.mae_proveedores(id) ON DELETE RESTRICT,
  id_oficina   TEXT NOT NULL REFERENCES public.mae_oficinas_ventas(id) ON DELETE RESTRICT,
  estado       TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_proveedor, id_oficina)
);
COMMENT ON TABLE public.rel_proveedor_oficinas IS 'SGT360 rel: qué proveedor opera en qué oficina. id POFxxxx.';

CREATE TABLE IF NOT EXISTS public.mae_grupos_vendedores (
  id           TEXT PRIMARY KEY CHECK (id ~ '^GVE[0-9]{4}$'),
  codigo_sap   TEXT NOT NULL UNIQUE,
  nombre       TEXT NOT NULL,
  id_proveedor TEXT NOT NULL REFERENCES public.mae_proveedores(id) ON DELETE RESTRICT,
  id_oficina   TEXT NOT NULL REFERENCES public.mae_oficinas_ventas(id) ON DELETE RESTRICT,
  estado       TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.mae_grupos_vendedores IS 'SGT360 mae: grupos de vendedores por proveedor+oficina. id GVE000x.';

-- ----------------------------------------------------------------------------
-- 2. Seguridad: roles, usuarios, matriz de permisos, recursos visuales
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seg_roles (
  codigo      TEXT PRIMARY KEY CHECK (codigo IN ('ADMIN','PROVEEDOR','SUPERVISOR','ASESOR')),
  descripcion TEXT,
  nivel       INT NOT NULL CHECK (nivel IN (20,30,40,50)),
  alcance     TEXT NOT NULL CHECK (alcance IN ('GLOBAL','EMPRESA','EQUIPO','PROPIO')),
  estado      TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.seg_roles IS 'SGT360 seg: ADMIN 20/GLOBAL, PROVEEDOR 30/EMPRESA, SUPERVISOR 40/EQUIPO, ASESOR 50/PROPIO (convención).';

CREATE TABLE IF NOT EXISTS public.seg_usuarios (
  id           TEXT PRIMARY KEY CHECK (id ~ '^U[0-9]{5}$'),
  nombre       TEXT NOT NULL,
  tipo_doc     TEXT NOT NULL DEFAULT 'DNI',
  nro_doc      TEXT NOT NULL,
  correo       TEXT NOT NULL UNIQUE,
  telefono     TEXT,
  rol_codigo   TEXT NOT NULL REFERENCES public.seg_roles(codigo) ON DELETE RESTRICT,
  id_proveedor TEXT REFERENCES public.mae_proveedores(id) ON DELETE SET NULL,
  estado       TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.seg_usuarios IS 'SGT360 seg: usuarios app. id U00xxx. rol FK a seg_roles. id_proveedor nullable.';

CREATE TABLE IF NOT EXISTS public.seg_permisos_matriz (
  rol_codigo TEXT NOT NULL REFERENCES public.seg_roles(codigo) ON DELETE CASCADE,
  modulo     TEXT NOT NULL,
  grupo      TEXT NOT NULL,
  recurso    TEXT NOT NULL,
  permitido  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rol_codigo, recurso)
);
COMMENT ON TABLE public.seg_permisos_matriz IS 'SGT360 seg: matriz rol x recurso. 6 módulos, 106 recursos (ADM44/CLI21/COT22/DSH2/GCO8/MAT9).';

CREATE TABLE IF NOT EXISTS public.seg_recursos_visuales (
  clave      TEXT PRIMARY KEY CHECK (clave IN ('logo_header','login_image','pdf_image','favicon')),
  url        TEXT NOT NULL,
  version    INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.seg_recursos_visuales IS 'SGT360 seg: logos/imágenes (header, login, PDF, favicon).';

-- ----------------------------------------------------------------------------
-- 3. Clientes y materiales + tarifario
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mae_clientes (
  id                 TEXT PRIMARY KEY,
  tipo_persona       TEXT NOT NULL CHECK (tipo_persona IN ('NATURAL','JURIDICA')),
  tipo_doc           TEXT NOT NULL,
  nro_doc            TEXT NOT NULL,
  nombre_razon_social TEXT NOT NULL,
  contacto           TEXT,
  correo             TEXT,
  telefono           TEXT,
  codigo_sap         TEXT UNIQUE,
  revision           INT NOT NULL DEFAULT 1,
  estado             TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo_doc, nro_doc)
);
COMMENT ON TABLE public.mae_clientes IS 'SGT360 mae: clientes hogar NATURAL/JURIDICA. codigo_sap nullable.';

CREATE TABLE IF NOT EXISTS public.mae_materiales (
  id          TEXT PRIMARY KEY CHECK (id ~ '^MAT-[0-9]{5}$'),
  codigo_tmp  TEXT UNIQUE CHECK (codigo_tmp IS NULL OR codigo_tmp ~ '^TMP-[0-9]+$'),
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  unidad      TEXT NOT NULL DEFAULT 'UND',
  tipo_medida TEXT NOT NULL DEFAULT 'LONGITUD',
  decimales   INT NOT NULL DEFAULT 2 CHECK (decimales BETWEEN 0 AND 4),
  estado      TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.mae_materiales IS 'SGT360 mae: materiales. id MAT-0000x, codigo_tmp TMP-xxx nullable, unidad ML/UND/etc.';

CREATE TABLE IF NOT EXISTS public.pre_tarifario (
  id           SERIAL PRIMARY KEY,
  id_material  TEXT NOT NULL REFERENCES public.mae_materiales(id) ON DELETE RESTRICT,
  precio       NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
  moneda       TEXT NOT NULL DEFAULT 'PEN' CHECK (moneda = 'PEN'),
  incluye_igv  BOOLEAN NOT NULL DEFAULT true,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE,
  estado       TEXT NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','FUTURA','VENCIDA')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);
COMMENT ON TABLE public.pre_tarifario IS 'SGT360 pre: tarifa por material y vigencia.';

-- ----------------------------------------------------------------------------
-- 4. Ventas: cotizaciones, items, simulación de financiamiento
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ven_cotizaciones (
  numero             TEXT PRIMARY KEY CHECK (numero ~ '^COT-[A-Z]+-[0-9]+$'),
  id_cliente         TEXT NOT NULL REFERENCES public.mae_clientes(id) ON DELETE RESTRICT,
  id_proveedor       TEXT NOT NULL REFERENCES public.mae_proveedores(id) ON DELETE RESTRICT,
  asesor_telefono    TEXT,
  subtotal           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  descuento          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  total              NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  capital_financiado NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (capital_financiado >= 0),
  cuota_inicial      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cuota_inicial >= 0),
  tea                NUMERIC(6,2) NOT NULL DEFAULT 40 CHECK (tea >= 0),
  cuotas_elegidas    INT CHECK (cuotas_elegidas IS NULL OR cuotas_elegidas IN (3,6,9,12,18,24,36,48,60)),
  observaciones      TEXT,
  estado             TEXT NOT NULL DEFAULT 'Pendiente',
  created_by         TEXT REFERENCES public.seg_usuarios(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.ven_cotizaciones IS 'SGT360 ven: cabecera cotización COT-AMCA-xxxx. TEA default 40. estado default Pendiente.';

CREATE TABLE IF NOT EXISTS public.ven_cotizacion_items (
  id         SERIAL PRIMARY KEY,
  numero_cot TEXT NOT NULL REFERENCES public.ven_cotizaciones(numero) ON DELETE CASCADE,
  id_material TEXT NOT NULL REFERENCES public.mae_materiales(id) ON DELETE RESTRICT,
  cantidad   NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  precio     NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
  dscto_tipo TEXT NOT NULL DEFAULT 'Ninguno' CHECK (dscto_tipo IN ('Ninguno','%')),
  valor      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  neto       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (neto >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.ven_cotizacion_items IS 'SGT360 ven: detalle cotización. dscto_tipo Ninguno/%.';

CREATE TABLE IF NOT EXISTS public.ven_financiamiento_sim (
  id         SERIAL PRIMARY KEY,
  numero_cot TEXT NOT NULL REFERENCES public.ven_cotizaciones(numero) ON DELETE CASCADE,
  cuotas     INT NOT NULL CHECK (cuotas IN (3,6,9,12,18,24,36,48,60)),
  valor_cuota NUMERIC(12,2) NOT NULL CHECK (valor_cuota >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (numero_cot, cuotas)
);
COMMENT ON TABLE public.ven_financiamiento_sim IS 'SGT360 ven: simulación de cuotas por cotización (cuota francesa, ver fn_cuota_francesa).';

-- ----------------------------------------------------------------------------
-- 5. Función is_admin (aquí porque LANGUAGE sql valida las tablas al crearse)
-- ----------------------------------------------------------------------------
-- ADMIN = fila en seg_usuarios con rol ADMIN + estado ACTIVO cuyo correo
-- coincide con el email del JWT (auth.jwt() ->> 'email').
CREATE OR REPLACE FUNCTION public.fn_sgt360_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.seg_usuarios u
      JOIN public.seg_roles r ON r.codigo = u.rol_codigo
     WHERE u.estado = 'ACTIVO'
       AND r.codigo = 'ADMIN'
       AND lower(u.correo) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
COMMENT ON FUNCTION public.fn_sgt360_is_admin() IS 'SGT360: true si el JWT pertenece a un seg_usuarios con rol ADMIN activo.';

-- ----------------------------------------------------------------------------
-- 6. Índices
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_rel_pof_proveedor ON public.rel_proveedor_oficinas(id_proveedor);
CREATE INDEX IF NOT EXISTS ix_rel_pof_oficina   ON public.rel_proveedor_oficinas(id_oficina);
CREATE INDEX IF NOT EXISTS ix_gve_proveedor     ON public.mae_grupos_vendedores(id_proveedor);
CREATE INDEX IF NOT EXISTS ix_gve_oficina       ON public.mae_grupos_vendedores(id_oficina);
CREATE INDEX IF NOT EXISTS ix_seg_usr_rol       ON public.seg_usuarios(rol_codigo);
CREATE INDEX IF NOT EXISTS ix_seg_usr_prov      ON public.seg_usuarios(id_proveedor);
CREATE INDEX IF NOT EXISTS ix_seg_usr_correo    ON public.seg_usuarios(correo);
CREATE INDEX IF NOT EXISTS ix_perm_modulo       ON public.seg_permisos_matriz(modulo);
CREATE INDEX IF NOT EXISTS ix_cli_nrodoc        ON public.mae_clientes(tipo_doc, nro_doc);
CREATE INDEX IF NOT EXISTS ix_cli_sap           ON public.mae_clientes(codigo_sap);
CREATE INDEX IF NOT EXISTS ix_tar_material      ON public.pre_tarifario(id_material);
CREATE INDEX IF NOT EXISTS ix_tar_estado        ON public.pre_tarifario(estado);
CREATE INDEX IF NOT EXISTS ix_cot_cliente       ON public.ven_cotizaciones(id_cliente);
CREATE INDEX IF NOT EXISTS ix_cot_proveedor     ON public.ven_cotizaciones(id_proveedor);
CREATE INDEX IF NOT EXISTS ix_cot_estado        ON public.ven_cotizaciones(estado);
CREATE INDEX IF NOT EXISTS ix_item_cot          ON public.ven_cotizacion_items(numero_cot);
CREATE INDEX IF NOT EXISTS ix_item_material     ON public.ven_cotizacion_items(id_material);
CREATE INDEX IF NOT EXISTS ix_sim_cot           ON public.ven_financiamiento_sim(numero_cot);

-- ----------------------------------------------------------------------------
-- 7. Triggers updated_at
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_mae_proveedores_upd ON public.mae_proveedores;
CREATE TRIGGER trg_mae_proveedores_upd BEFORE UPDATE ON public.mae_proveedores
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_mae_oficinas_upd ON public.mae_oficinas_ventas;
CREATE TRIGGER trg_mae_oficinas_upd BEFORE UPDATE ON public.mae_oficinas_ventas
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_rel_pof_upd ON public.rel_proveedor_oficinas;
CREATE TRIGGER trg_rel_pof_upd BEFORE UPDATE ON public.rel_proveedor_oficinas
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_gve_upd ON public.mae_grupos_vendedores;
CREATE TRIGGER trg_gve_upd BEFORE UPDATE ON public.mae_grupos_vendedores
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_seg_roles_upd ON public.seg_roles;
CREATE TRIGGER trg_seg_roles_upd BEFORE UPDATE ON public.seg_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_seg_usuarios_upd ON public.seg_usuarios;
CREATE TRIGGER trg_seg_usuarios_upd BEFORE UPDATE ON public.seg_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_perm_upd ON public.seg_permisos_matriz;
CREATE TRIGGER trg_perm_upd BEFORE UPDATE ON public.seg_permisos_matriz
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_vis_upd ON public.seg_recursos_visuales;
CREATE TRIGGER trg_vis_upd BEFORE UPDATE ON public.seg_recursos_visuales
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_cli_upd ON public.mae_clientes;
CREATE TRIGGER trg_cli_upd BEFORE UPDATE ON public.mae_clientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_mat_upd ON public.mae_materiales;
CREATE TRIGGER trg_mat_upd BEFORE UPDATE ON public.mae_materiales
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_tar_upd ON public.pre_tarifario;
CREATE TRIGGER trg_tar_upd BEFORE UPDATE ON public.pre_tarifario
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_cot_upd ON public.ven_cotizaciones;
CREATE TRIGGER trg_cot_upd BEFORE UPDATE ON public.ven_cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_item_upd ON public.ven_cotizacion_items;
CREATE TRIGGER trg_item_upd BEFORE UPDATE ON public.ven_cotizacion_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_sim_upd ON public.ven_financiamiento_sim;
CREATE TRIGGER trg_sim_upd BEFORE UPDATE ON public.ven_financiamiento_sim
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. RLS básico: authenticated lectura, admin todo
-- ----------------------------------------------------------------------------
ALTER TABLE public.mae_proveedores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mae_oficinas_ventas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rel_proveedor_oficinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mae_grupos_vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seg_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seg_usuarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seg_permisos_matriz  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seg_recursos_visuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mae_clientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mae_materiales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_tarifario        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ven_cotizaciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ven_cotizacion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ven_financiamiento_sim ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mae_proveedores','mae_oficinas_ventas','rel_proveedor_oficinas',
    'mae_grupos_vendedores','seg_roles','seg_usuarios','seg_permisos_matriz',
    'seg_recursos_visuales','mae_clientes','mae_materiales','pre_tarifario',
    'ven_cotizaciones','ven_cotizacion_items','ven_financiamiento_sim']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'sgt360_read_'||t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'sgt360_admin_'||t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      'sgt360_read_'||t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.fn_sgt360_is_admin()) WITH CHECK (public.fn_sgt360_is_admin())',
      'sgt360_admin_'||t, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 9. Seed mínimo
-- ----------------------------------------------------------------------------
-- 8.1 Roles (4)
INSERT INTO public.seg_roles (codigo, descripcion, nivel, alcance, estado) VALUES
  ('ADMIN',      'Administrador global del sistema', '20', 'GLOBAL',  'ACTIVO'),
  ('PROVEEDOR',  'Proveedor / empresa contratista',  '30', 'EMPRESA', 'ACTIVO'),
  ('SUPERVISOR', 'Supervisor de equipo comercial',   '40', 'EQUIPO',  'ACTIVO'),
  ('ASESOR',     'Asesor comercial',                 '50', 'PROPIO',  'ACTIVO')
ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion,
  nivel = EXCLUDED.nivel, alcance = EXCLUDED.alcance, estado = EXCLUDED.estado;

-- 8.2 Proveedor IBR Peru S.A.
INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, correo, telefono, estado) VALUES
  ('PRV0001', '1000001', '20601234567', 'IBR Peru S.A.', 'IBR Peru', 'contacto@ibrperu.pe', '+51 1 555 0400', 'ACTIVO')
ON CONFLICT (id) DO UPDATE SET interlocutor = EXCLUDED.interlocutor, ruc = EXCLUDED.ruc,
  razon_social = EXCLUDED.razon_social, nombre_comercial = EXCLUDED.nombre_comercial,
  correo = EXCLUDED.correo, telefono = EXCLUDED.telefono, estado = EXCLUDED.estado;

-- 8.3 Oficina Ambientes Cálidos AMCA-OFV0001
INSERT INTO public.mae_oficinas_ventas (id, codigo_sap, nombre, descripcion, estado) VALUES
  ('OFV0001', 'AMCA-OFV0001', 'Ambientes Cálidos', 'Oficina de ventas Ambientes Cálidos', 'ACTIVO')
ON CONFLICT (id) DO UPDATE SET codigo_sap = EXCLUDED.codigo_sap, nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion, estado = EXCLUDED.estado;

-- 8.4 Relación proveedor-oficina + grupo vendedor base
INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado) VALUES
  ('POF0001', 'PRV0001', 'OFV0001', 'ACTIVO')
ON CONFLICT (id) DO UPDATE SET id_proveedor = EXCLUDED.id_proveedor,
  id_oficina = EXCLUDED.id_oficina, estado = EXCLUDED.estado;

INSERT INTO public.mae_grupos_vendedores (id, codigo_sap, nombre, id_proveedor, id_oficina, estado) VALUES
  ('GVE0001', 'AMCA-GVE0001', 'Grupo Ventas Ambientes Cálidos', 'PRV0001', 'OFV0001', 'ACTIVO')
ON CONFLICT (id) DO UPDATE SET codigo_sap = EXCLUDED.codigo_sap, nombre = EXCLUDED.nombre,
  id_proveedor = EXCLUDED.id_proveedor, id_oficina = EXCLUDED.id_oficina, estado = EXCLUDED.estado;

-- 8.5 Materiales cocina ejemplo (2) + tarifa S/550 y S/650
INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado) VALUES
  ('MAT-00001', 'TMP-001', 'Cocina ejemplo 4 quemadores', 'Cocina a gas 4 quemadores con horno, ejemplo tarifario', 'UND', 'LONGITUD', 2, 'ACTIVO'),
  ('MAT-00002', 'TMP-002', 'Cocina ejemplo empotrable', 'Encimera empotrable a gas, ejemplo tarifario', 'UND', 'LONGITUD', 2, 'ACTIVO')
ON CONFLICT (id) DO UPDATE SET codigo_tmp = EXCLUDED.codigo_tmp, nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion, unidad = EXCLUDED.unidad,
  tipo_medida = EXCLUDED.tipo_medida, estado = EXCLUDED.estado;

INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado) VALUES
  ('MAT-00001', 550.00, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'),
  ('MAT-00002', 650.00, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE')
ON CONFLICT DO NOTHING;

-- 8.6 Recursos visuales (placeholders, actualizar URL en producción)
INSERT INTO public.seg_recursos_visuales (clave, url, version) VALUES
  ('logo_header', '/assets/logo_header.png', 1),
  ('login_image', '/assets/login_image.png', 1),
  ('pdf_image',   '/assets/pdf_image.png',   1),
  ('favicon',     '/assets/favicon.ico',     1)
ON CONFLICT (clave) DO UPDATE SET url = EXCLUDED.url, version = EXCLUDED.version;

-- 8.7 Matriz de permisos: 6 módulos / 106 recursos por rol (424 filas).
-- Módulos: ADMINISTRACION 44, CLIENTES 21, COTIZACIONES 22,
--          DASHBOARD 2, GESTION_COMERCIAL 8, MATERIALES 9.
-- Concedidos: ADMIN 106 (todo) + SUPERVISOR 18 + ASESOR 12 + PROVEEDOR 3 = 139.
DO $$
DECLARE
  r text;
  m text;
  n int;
  i int;
  code text;
BEGIN
  -- Base: genera los 106 recursos x 4 roles (todo denegado, luego se enciende).
  FOR r IN SELECT unnest(ARRAY['ADMIN','PROVEEDOR','SUPERVISOR','ASESOR']) LOOP
    FOR m IN SELECT unnest(ARRAY['ADMINISTRACION','CLIENTES','COTIZACIONES','DASHBOARD','GESTION_COMERCIAL','MATERIALES']) LOOP
      n := CASE m WHEN 'ADMINISTRACION' THEN 44 WHEN 'CLIENTES' THEN 21
                 WHEN 'COTIZACIONES' THEN 22 WHEN 'DASHBOARD' THEN 2
                 WHEN 'GESTION_COMERCIAL' THEN 8 WHEN 'MATERIALES' THEN 9 END;
      FOR i IN 1..n LOOP
        code := m || '-' || lpad(i::text, 2, '0');
        INSERT INTO public.seg_permisos_matriz (rol_codigo, modulo, grupo, recurso, permitido)
        VALUES (r, m, m, code, false)
        ON CONFLICT (rol_codigo, recurso) DO UPDATE SET modulo = EXCLUDED.modulo, grupo = EXCLUDED.grupo;
      END LOOP;
    END LOOP;
  END LOOP;

  -- ADMIN: todo concedido (106).
  UPDATE public.seg_permisos_matriz SET permitido = true WHERE rol_codigo = 'ADMIN';

  -- SUPERVISOR 18: DASHBOARD 2 + COTIZACIONES 8 + CLIENTES 5 + GESTION_COMERCIAL 3.
  UPDATE public.seg_permisos_matriz SET permitido = true WHERE rol_codigo = 'SUPERVISOR'
    AND ((modulo = 'DASHBOARD')
      OR (modulo = 'COTIZACIONES' AND recurso IN ('COTIZACIONES-01','COTIZACIONES-02','COTIZACIONES-03','COTIZACIONES-04','COTIZACIONES-05','COTIZACIONES-06','COTIZACIONES-07','COTIZACIONES-08'))
      OR (modulo = 'CLIENTES' AND recurso IN ('CLIENTES-01','CLIENTES-02','CLIENTES-03','CLIENTES-04','CLIENTES-05'))
      OR (modulo = 'GESTION_COMERCIAL' AND recurso IN ('GESTION_COMERCIAL-01','GESTION_COMERCIAL-02','GESTION_COMERCIAL-03')));

  -- ASESOR 12: DASHBOARD 1 + COTIZACIONES 6 + CLIENTES 4 + MATERIALES 1.
  UPDATE public.seg_permisos_matriz SET permitido = true WHERE rol_codigo = 'ASESOR'
    AND ((modulo = 'DASHBOARD' AND recurso = 'DASHBOARD-01')
      OR (modulo = 'COTIZACIONES' AND recurso IN ('COTIZACIONES-01','COTIZACIONES-02','COTIZACIONES-03','COTIZACIONES-04','COTIZACIONES-05','COTIZACIONES-06'))
      OR (modulo = 'CLIENTES' AND recurso IN ('CLIENTES-01','CLIENTES-02','CLIENTES-03','CLIENTES-04'))
      OR (modulo = 'MATERIALES' AND recurso = 'MATERIALES-01'));

  -- PROVEEDOR 3: DASHBOARD 1 + GESTION_COMERCIAL 1 + MATERIALES 1.
  UPDATE public.seg_permisos_matriz SET permitido = true WHERE rol_codigo = 'PROVEEDOR'
    AND ((modulo = 'DASHBOARD' AND recurso = 'DASHBOARD-01')
      OR (modulo = 'GESTION_COMERCIAL' AND recurso = 'GESTION_COMERCIAL-01')
      OR (modulo = 'MATERIALES' AND recurso = 'MATERIALES-01'));
END $$;

-- Ejemplo uso cuota francesa TEA 40% (no se ejecuta, referencia):
-- SELECT public.fn_cuota_francesa(1000, 40, 12);
