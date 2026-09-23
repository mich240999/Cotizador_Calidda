-- ============================================================================
-- Soluciones Hogar · Cotizador Hogar · Supabase schema
-- Réplica Postgres de la app Apps Script "Soluciones Hogar"
-- Módulos origen (wrapper ingeniería inversa):
--   Paso13 auth/sesiones · Paso2/3 roles · Paso6/10/11/12/14/16 clientes,
--   materiales, proveedores, oficinas, asesores, cotizaciones, PDF, correo,
--   Admin CRUD
-- Orden de ejecución: primero este schema.sql, luego seed.sql
-- Proyecto Supabase > SQL Editor > New query > pegar y Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensiones
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid(), digest() p/ token_hash

-- ----------------------------------------------------------------------------
-- 1. Tablas base
-- ----------------------------------------------------------------------------

-- Roles de aplicación (Paso2/3). No depende de auth.users.
CREATE TABLE IF NOT EXISTS public.roles (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL UNIQUE CHECK (nombre IN ('admin','asesor','oficina')),
  permisos   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.roles IS 'Paso2/3: roles admin, asesor, oficina + permisos jsonb por módulo';

-- Oficinas / sedes (Paso11 aprox.)
CREATE TABLE IF NOT EXISTS public.oficinas (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  direccion  TEXT,
  telefono   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfiles app ligados a Supabase Auth (Paso13 + Paso2/3)
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL UNIQUE,
  nombre     TEXT NOT NULL,
  rol_id     INTEGER REFERENCES public.roles(id) ON DELETE SET NULL,
  oficina_id INTEGER REFERENCES public.oficinas(id) ON DELETE SET NULL,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.profiles IS 'Paso13 auth: 1 fila por usuario de auth.users; rol + oficina para RLS';

-- Proveedores de materiales (Paso10 aprox.)
CREATE TABLE IF NOT EXISTS public.proveedores (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  ruc        TEXT UNIQUE,
  contacto   TEXT,
  email      TEXT,
  telefono   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Asesores comerciales (Paso12 aprox.)
CREATE TABLE IF NOT EXISTS public.asesores (
  id           SERIAL PRIMARY KEY,
  profile_id   UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  codigo       TEXT NOT NULL UNIQUE,
  comision_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (comision_pct >= 0 AND comision_pct <= 100),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clientes hogar (Paso6 aprox.)
CREATE TABLE IF NOT EXISTS public.clientes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombres    TEXT NOT NULL,
  dni        TEXT CHECK (dni IS NULL OR char_length(dni) <= 12),
  telefono   TEXT,
  email      TEXT,
  direccion  TEXT,
  distrito   TEXT,
  asesor_id  INTEGER REFERENCES public.asesores(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Materiales / catálogo hogar (Paso10)
CREATE TABLE IF NOT EXISTS public.materiales (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       TEXT NOT NULL UNIQUE,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  unidad       TEXT NOT NULL DEFAULT 'UND',
  precio_unit  NUMERIC(12,2) NOT NULL CHECK (precio_unit >= 0),
  stock        NUMERIC(12,2) NOT NULL DEFAULT 0,
  proveedor_id INTEGER REFERENCES public.proveedores(id) ON DELETE SET NULL,
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cotizaciones encabezado (Paso14 aprox. + PDF/correo Paso16)
CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        TEXT UNIQUE, -- se autogenera COT-YYYY-XXXX vía trigger si viene NULL
  cliente_id    UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  asesor_id     INTEGER REFERENCES public.asesores(id) ON DELETE SET NULL,
  oficina_id    INTEGER REFERENCES public.oficinas(id) ON DELETE SET NULL,
  estado        TEXT NOT NULL DEFAULT 'BORRADOR'
                CHECK (estado IN ('BORRADOR','ENVIADA','APROBADA','RECHAZADA')),
  subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  igv           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (igv >= 0),
  total         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  validez_dias  INTEGER NOT NULL DEFAULT 15 CHECK (validez_dias >= 0),
  observaciones TEXT,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.cotizaciones IS 'Paso14: subtotal=sum(items), igv=18%, total=subtotal+igv (triggers)';

-- Cotizaciones detalle
CREATE TABLE IF NOT EXISTS public.cotizacion_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  material_id   UUID REFERENCES public.materiales(id) ON DELETE SET NULL,
  cantidad      NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  precio_unit   NUMERIC(12,2) NOT NULL CHECK (precio_unit >= 0),
  descuento_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
  total_linea   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_linea >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.cotizacion_items IS 'total_linea=cantidad*precio_unit*(1-descuento/100) vía trigger';

-- Sesiones app (mirror Paso13D1: heartbeat cada 120s actualiza ultima_actividad)
CREATE TABLE IF NOT EXISTS public.sesiones_app (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE, -- digest(token,'sha256') en hex; nunca el token plano
  modulo          TEXT,                 -- módulo wrapper activo: Paso2, Paso6, Paso14...
  origen          TEXT,                 -- web, movil, apps-script...
  user_agent      TEXT,
  ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT now(),
  activa          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sesiones_app IS 'Paso13D1: el cliente hace heartbeat 120s -> refresca ultima_actividad';

-- Auditoría de operaciones (qué módulo/operación/args ejecutó quién)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  operacion  TEXT NOT NULL,
  argumentos JSONB NOT NULL DEFAULT '{}'::jsonb,
  modulo     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Funciones + triggers
-- ----------------------------------------------------------------------------

-- updated_at automático
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roles_updated ON public.roles;
CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_oficinas_updated ON public.oficinas;
CREATE TRIGGER trg_oficinas_updated BEFORE UPDATE ON public.oficinas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_proveedores_updated ON public.proveedores;
CREATE TRIGGER trg_proveedores_updated BEFORE UPDATE ON public.proveedores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_asesores_updated ON public.asesores;
CREATE TRIGGER trg_asesores_updated BEFORE UPDATE ON public.asesores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_clientes_updated ON public.clientes;
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_materiales_updated ON public.materiales;
CREATE TRIGGER trg_materiales_updated BEFORE UPDATE ON public.materiales
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_cotizaciones_updated ON public.cotizaciones;
CREATE TRIGGER trg_cotizaciones_updated BEFORE UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Código correlativo COT-YYYY-XXXX (contador por año, tolerante a concurrencia media)
CREATE OR REPLACE FUNCTION public.generar_codigo_cotizacion()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_year TEXT := to_char(now(), 'YYYY');
  v_next INT;
BEGIN
  SELECT COALESCE(MAX((regexp_match(codigo, '^COT-\d{4}-(\d{4})$'))[1]::int), 0) + 1
    INTO v_next
    FROM public.cotizaciones
   WHERE codigo LIKE 'COT-' || v_year || '-%';
  RETURN 'COT-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_codigo_cotizacion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' THEN
    NEW.codigo := public.generar_codigo_cotizacion();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cotizacion_codigo ON public.cotizaciones;
CREATE TRIGGER trg_cotizacion_codigo BEFORE INSERT ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.set_codigo_cotizacion();

-- Cálculo de total_linea (autocompleta precio desde catálogo si viene NULL/0)
CREATE OR REPLACE FUNCTION public.trg_calcular_total_linea()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_precio NUMERIC(12,2);
BEGIN
  IF NEW.precio_unit IS NULL OR NEW.precio_unit = 0 THEN
    SELECT m.precio_unit INTO v_precio FROM public.materiales m WHERE m.id = NEW.material_id;
    IF v_precio IS NOT NULL THEN NEW.precio_unit := v_precio; END IF;
  END IF;
  NEW.total_linea := round(
    NEW.cantidad * NEW.precio_unit * (1 - COALESCE(NEW.descuento_pct, 0) / 100), 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_item_total_linea ON public.cotizacion_items;
CREATE TRIGGER trg_item_total_linea BEFORE INSERT OR UPDATE ON public.cotizacion_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_calcular_total_linea();

-- Recálculo de totales del encabezado (IGV Perú 18%)
CREATE OR REPLACE FUNCTION public.recalc_cotizacion_totales(p_cotizacion_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_sub NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(total_linea), 0) INTO v_sub
    FROM public.cotizacion_items WHERE cotizacion_id = p_cotizacion_id;
  UPDATE public.cotizaciones
     SET subtotal = round(v_sub, 2),
         igv      = round(v_sub * 0.18, 2),
         total    = round(v_sub * 1.18, 2)
   WHERE id = p_cotizacion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_cotizacion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_cotizacion_totales(OLD.cotizacion_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_cotizacion_totales(NEW.cotizacion_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_recalc ON public.cotizacion_items;
CREATE TRIGGER trg_items_recalc AFTER INSERT OR UPDATE OR DELETE ON public.cotizacion_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_cotizacion();

-- Helpers RLS (SECURITY DEFINER para no recursar en policies de profiles)
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON r.id = p.rol_id
    WHERE p.id = auth.uid() AND r.nombre = 'admin' AND p.activo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.mi_oficina_id()
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p.oficina_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1
$$;

-- Utilidades app: auditoría + heartbeat sesión (Paso13D1 cada 120s)
CREATE OR REPLACE FUNCTION public.registrar_audit(
  p_operacion TEXT, p_argumentos JSONB DEFAULT '{}'::jsonb, p_modulo TEXT DEFAULT NULL)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT;
BEGIN
  INSERT INTO public.audit_log(user_id, operacion, argumentos, modulo)
  VALUES (auth.uid(), p_operacion, COALESCE(p_argumentos,'{}'::jsonb), p_modulo)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_sesion(p_token_hash TEXT, p_modulo TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sesiones_app
     SET ultima_actividad = now(),
         modulo = COALESCE(p_modulo, modulo),
         activa = true
   WHERE token_hash = p_token_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_sesiones_inactivas()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT;
BEGIN
  -- Sesiones sin heartbeat en 10 min (5 ciclos perdidos de 120s) se marcan inactivas
  UPDATE public.sesiones_app SET activa = false
   WHERE activa = true AND ultima_actividad < now() - interval '10 minutes';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Índices
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_rol      ON public.profiles(rol_id);
CREATE INDEX IF NOT EXISTS idx_profiles_oficina  ON public.profiles(oficina_id);
CREATE INDEX IF NOT EXISTS idx_profiles_activo   ON public.profiles(activo);
CREATE INDEX IF NOT EXISTS idx_asesores_profile  ON public.asesores(profile_id);
CREATE INDEX IF NOT EXISTS idx_clientes_dni      ON public.clientes(dni);
CREATE INDEX IF NOT EXISTS idx_clientes_email    ON public.clientes(email);
CREATE INDEX IF NOT EXISTS idx_clientes_asesor   ON public.clientes(asesor_id);
CREATE INDEX IF NOT EXISTS idx_clientes_created  ON public.clientes(created_by);
CREATE INDEX IF NOT EXISTS idx_materiales_prov   ON public.materiales(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_materiales_activo ON public.materiales(activo);
CREATE INDEX IF NOT EXISTS idx_materiales_nombre ON public.materiales(nombre);
CREATE INDEX IF NOT EXISTS idx_cot_cliente       ON public.cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cot_asesor        ON public.cotizaciones(asesor_id);
CREATE INDEX IF NOT EXISTS idx_cot_oficina       ON public.cotizaciones(oficina_id);
CREATE INDEX IF NOT EXISTS idx_cot_estado        ON public.cotizaciones(estado);
CREATE INDEX IF NOT EXISTS idx_cot_created       ON public.cotizaciones(created_by);
CREATE INDEX IF NOT EXISTS idx_cot_fecha         ON public.cotizaciones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_cot         ON public.cotizacion_items(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_items_mat         ON public.cotizacion_items(material_id);
CREATE INDEX IF NOT EXISTS idx_ses_user          ON public.sesiones_app(user_id);
CREATE INDEX IF NOT EXISTS idx_ses_token         ON public.sesiones_app(token_hash);
CREATE INDEX IF NOT EXISTS idx_ses_actividad     ON public.sesiones_app(ultima_actividad DESC);
CREATE INDEX IF NOT EXISTS idx_ses_activa        ON public.sesiones_app(activa) WHERE activa = true;
CREATE INDEX IF NOT EXISTS idx_audit_user        ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_modulo      ON public.audit_log(modulo);
CREATE INDEX IF NOT EXISTS idx_audit_fecha       ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_operacion   ON public.audit_log(operacion);

-- ----------------------------------------------------------------------------
-- 4. Grants mínimos (Supabase: service_role bypass RLS; authenticated vía RLS)
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. RLS: anon = nada (sin policies para anon), authenticated scoped, admin todo
-- ----------------------------------------------------------------------------
ALTER TABLE public.roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficinas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asesores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_app     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log        ENABLE ROW LEVEL SECURITY;

-- ROLES: lectura autenticada, escritura solo admin
DROP POLICY IF EXISTS roles_select ON public.roles;
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS roles_admin ON public.roles;
CREATE POLICY roles_admin ON public.roles FOR ALL TO authenticated
  USING (public.es_admin()) WITH CHECK (public.es_admin());

-- OFICINAS: lectura autenticada, escritura solo admin
DROP POLICY IF EXISTS oficinas_select ON public.oficinas;
CREATE POLICY oficinas_select ON public.oficinas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS oficinas_admin ON public.oficinas;
CREATE POLICY oficinas_admin ON public.oficinas FOR ALL TO authenticated
  USING (public.es_admin()) WITH CHECK (public.es_admin());

-- PROVEEDORES: lectura autenticada, escritura solo admin
DROP POLICY IF EXISTS prov_select ON public.proveedores;
CREATE POLICY prov_select ON public.proveedores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS prov_admin ON public.proveedores;
CREATE POLICY prov_admin ON public.proveedores FOR ALL TO authenticated
  USING (public.es_admin()) WITH CHECK (public.es_admin());

-- MATERIALES (catálogo global): lectura autenticada, escritura solo admin
DROP POLICY IF EXISTS mat_select ON public.materiales;
CREATE POLICY mat_select ON public.materiales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS mat_admin ON public.materiales;
CREATE POLICY mat_admin ON public.materiales FOR ALL TO authenticated
  USING (public.es_admin()) WITH CHECK (public.es_admin());

-- PROFILES: cada uno ve su fila + compañeros de oficina; admin todo
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR oficina_id = public.mi_oficina_id() OR public.es_admin());
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.es_admin())
  WITH CHECK (id = auth.uid() OR public.es_admin());
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.es_admin());
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated
  USING (public.es_admin());

-- ASESORES: lectura misma oficina o propio; escritura admin
DROP POLICY IF EXISTS asesores_select ON public.asesores;
CREATE POLICY asesores_select ON public.asesores FOR SELECT TO authenticated
  USING (
    public.es_admin()
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = asesores.profile_id
                 AND (p.id = auth.uid() OR p.oficina_id = public.mi_oficina_id()))
  );
DROP POLICY IF EXISTS asesores_admin ON public.asesores;
CREATE POLICY asesores_admin ON public.asesores FOR ALL TO authenticated
  USING (public.es_admin()) WITH CHECK (public.es_admin());

-- CLIENTES: misma oficina / dueño / admin; crear cualquier autenticado
DROP POLICY IF EXISTS clientes_select ON public.clientes;
CREATE POLICY clientes_select ON public.clientes FOR SELECT TO authenticated
  USING (
    public.es_admin()
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = clientes.created_by AND p.oficina_id = public.mi_oficina_id())
    OR EXISTS (SELECT 1 FROM public.asesores a JOIN public.profiles p ON p.id = a.profile_id
               WHERE a.id = clientes.asesor_id
                 AND (p.id = auth.uid() OR p.oficina_id = public.mi_oficina_id()))
  );
DROP POLICY IF EXISTS clientes_insert ON public.clientes;
CREATE POLICY clientes_insert ON public.clientes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS clientes_update ON public.clientes;
CREATE POLICY clientes_update ON public.clientes FOR UPDATE TO authenticated
  USING (
    public.es_admin() OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.asesores a JOIN public.profiles p ON p.id = a.profile_id
               WHERE a.id = clientes.asesor_id AND p.oficina_id = public.mi_oficina_id())
  ) WITH CHECK (
    public.es_admin() OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.asesores a JOIN public.profiles p ON p.id = a.profile_id
               WHERE a.id = clientes.asesor_id AND p.oficina_id = public.mi_oficina_id())
  );
DROP POLICY IF EXISTS clientes_delete ON public.clientes;
CREATE POLICY clientes_delete ON public.clientes FOR DELETE TO authenticated
  USING (public.es_admin() OR created_by = auth.uid());

-- COTIZACIONES: scope por oficina_id / dueño; admin todo
DROP POLICY IF EXISTS cot_select ON public.cotizaciones;
CREATE POLICY cot_select ON public.cotizaciones FOR SELECT TO authenticated
  USING (public.es_admin() OR created_by = auth.uid() OR oficina_id = public.mi_oficina_id());
DROP POLICY IF EXISTS cot_insert ON public.cotizaciones;
CREATE POLICY cot_insert ON public.cotizaciones FOR INSERT TO authenticated
  WITH CHECK (public.es_admin() OR created_by = auth.uid() OR oficina_id = public.mi_oficina_id());
DROP POLICY IF EXISTS cot_update ON public.cotizaciones;
CREATE POLICY cot_update ON public.cotizaciones FOR UPDATE TO authenticated
  USING (public.es_admin() OR created_by = auth.uid() OR oficina_id = public.mi_oficina_id())
  WITH CHECK (public.es_admin() OR created_by = auth.uid() OR oficina_id = public.mi_oficina_id());
DROP POLICY IF EXISTS cot_delete ON public.cotizaciones;
CREATE POLICY cot_delete ON public.cotizaciones FOR DELETE TO authenticated
  USING (public.es_admin() OR created_by = auth.uid());

-- ITEMS: visibilidad heredada del encabezado
DROP POLICY IF EXISTS items_select ON public.cotizacion_items;
CREATE POLICY items_select ON public.cotizacion_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cotizaciones c WHERE c.id = cotizacion_items.cotizacion_id
    AND (public.es_admin() OR c.created_by = auth.uid() OR c.oficina_id = public.mi_oficina_id())));
DROP POLICY IF EXISTS items_insert ON public.cotizacion_items;
CREATE POLICY items_insert ON public.cotizacion_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cotizaciones c WHERE c.id = cotizacion_items.cotizacion_id
    AND (public.es_admin() OR c.created_by = auth.uid() OR c.oficina_id = public.mi_oficina_id())));
DROP POLICY IF EXISTS items_update ON public.cotizacion_items;
CREATE POLICY items_update ON public.cotizacion_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cotizaciones c WHERE c.id = cotizacion_items.cotizacion_id
    AND (public.es_admin() OR c.created_by = auth.uid() OR c.oficina_id = public.mi_oficina_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cotizaciones c WHERE c.id = cotizacion_items.cotizacion_id
    AND (public.es_admin() OR c.created_by = auth.uid() OR c.oficina_id = public.mi_oficina_id())));
DROP POLICY IF EXISTS items_delete ON public.cotizacion_items;
CREATE POLICY items_delete ON public.cotizacion_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cotizaciones c WHERE c.id = cotizacion_items.cotizacion_id
    AND (public.es_admin() OR c.created_by = auth.uid() OR c.oficina_id = public.mi_oficina_id())));

-- SESIONES_APP: dueño o admin (mirror Paso13D1)
DROP POLICY IF EXISTS ses_select ON public.sesiones_app;
CREATE POLICY ses_select ON public.sesiones_app FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.es_admin());
DROP POLICY IF EXISTS ses_insert ON public.sesiones_app;
CREATE POLICY ses_insert ON public.sesiones_app FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.es_admin());
DROP POLICY IF EXISTS ses_update ON public.sesiones_app;
CREATE POLICY ses_update ON public.sesiones_app FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.es_admin())
  WITH CHECK (user_id = auth.uid() OR public.es_admin());
DROP POLICY IF EXISTS ses_delete ON public.sesiones_app;
CREATE POLICY ses_delete ON public.sesiones_app FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.es_admin());

-- AUDIT_LOG: cada uno ve/inserta lo suyo; admin todo (sin UPDATE)
DROP POLICY IF EXISTS audit_select ON public.audit_log;
CREATE POLICY audit_select ON public.audit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.es_admin());
DROP POLICY IF EXISTS audit_insert ON public.audit_log;
CREATE POLICY audit_insert ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL OR public.es_admin());
DROP POLICY IF EXISTS audit_delete ON public.audit_log;
CREATE POLICY audit_delete ON public.audit_log FOR DELETE TO authenticated
  USING (public.es_admin());
