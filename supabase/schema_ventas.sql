-- ============================================================================
-- SGT360 · Soluciones Hogar Cálidda · supabase/schema_ventas.sql (NUEVO)
-- Modelo de Registro de Ventas estilo SGT360. NO modifica otros archivos.
-- Orden: ejecutar DESPUÉS de schema_sgt360.sql (mae_clientes, mae_proveedores,
--   mae_materiales, fn_sgt360_is_admin). Idempotente: re-ejecutable.
-- Prefijo vta_: solicitudes + items + abonos + instalaciones.
-- Adjuntos: columnas *_url TEXT (sin Storage buckets en este archivo).
--   Las URLs pueden apuntar a Supabase Storage cuando creen los buckets
--   (ej. public URL de bucket 'ventas'), sin cambiar el modelo.
-- Seed: 0 filas demo (sin datos quemados).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. Helper updated_at: reusa fn_sgt360_set_updated_at() si existe, si no la crea
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_sgt360_set_updated_at'
  ) THEN
    CREATE FUNCTION public.fn_sgt360_set_updated_at()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END $fn$;
  END IF;
END $$;

-- Fallback seguro para RLS si schema_sgt360.sql aún no se ejecutó.
-- Si ya existe la implementación real (seg_usuarios + JWT), este bloque NO la toca.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_sgt360_is_admin'
  ) THEN
    CREATE FUNCTION public.fn_sgt360_is_admin()
    RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
      SELECT false;
    $fn$;
    COMMENT ON FUNCTION public.fn_sgt360_is_admin() IS
      'STUB schema_ventas.sql: reemplazado por la implementacion real de schema_sgt360.sql (seg_usuarios rol ADMIN).';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Cabecera: vta_solicitudes_venta
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vta_solicitudes_venta (
  id                    TEXT PRIMARY KEY CHECK (id ~ '^VTA-[0-9]{6}$'),
  numero_pedido         TEXT UNIQUE, -- nullable: UNIQUE permite múltiples NULL en Postgres
  id_cliente            TEXT NOT NULL REFERENCES public.mae_clientes(id) ON DELETE RESTRICT,
  id_proveedor          TEXT REFERENCES public.mae_proveedores(id) ON DELETE SET NULL,
  canal                 TEXT CHECK (canal IS NULL OR canal IN ('proveedor','microaliado','contratista')),
  es_microaliado        BOOLEAN NOT NULL DEFAULT false,
  visita_estado         TEXT CHECK (visita_estado IS NULL OR visita_estado IN ('visitado','agendado')),
  proyecto_financiado   BOOLEAN NOT NULL DEFAULT true,
  pago_modo             TEXT CHECK (pago_modo IS NULL OR pago_modo IN ('financiado_total','mixto','contado_total')),
  tea                   NUMERIC(6,2) NOT NULL DEFAULT 40 CHECK (tea >= 0),
  observaciones         TEXT,
  adjunto_cotizacion_url TEXT, -- URL (futura public URL de Supabase Storage o externa)
  adjunto_dni_url        TEXT, -- URL (futura public URL de Supabase Storage o externa)
  estado                TEXT NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador','pendiente_aprobacion','observado','aprobada',
                                          'en_instalacion','instalada','validada_proveedor','cerrada')),
  observacion_admin     TEXT,
  created_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.vta_solicitudes_venta IS
  'SGT360 vta: registro de venta. id VTA-000001 correlativo (trigger). numero_pedido UNIQUE nullable (pedido ERP). TEA default 40, editable solo admin (trigger). Adjuntos como URL (apuntan a Supabase Storage cuando se creen los buckets).';
COMMENT ON COLUMN public.vta_solicitudes_venta.tea IS 'TEA % default 40. Solo admin puede insertar distinto de 40 o modificarlo (trigger fn_vta_protect_tea).';
COMMENT ON COLUMN public.vta_solicitudes_venta.adjunto_cotizacion_url IS 'URL cotización firmada / cotización PDF. Sin bucket en este DDL; usar public URL de Supabase Storage cuando exista.';
COMMENT ON COLUMN public.vta_solicitudes_venta.adjunto_dni_url IS 'URL foto/PDF DNI. Sin bucket en este DDL; usar public URL de Supabase Storage cuando exista.';

-- Correlativo VTA-000001: si id viene NULL/vacío se autogenera (tolerante a concurrencia media)
CREATE OR REPLACE FUNCTION public.fn_vta_next_solicitud_id()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_next INT;
BEGIN
  SELECT COALESCE(MAX((regexp_match(id, '^VTA-([0-9]{6})$'))[1]::int), 0) + 1
    INTO v_next
    FROM public.vta_solicitudes_venta;
  RETURN 'VTA-' || lpad(v_next::text, 6, '0');
END $$;

CREATE OR REPLACE FUNCTION public.fn_vta_set_solicitud_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS NULL OR btrim(NEW.id) = '' THEN
    NEW.id := public.fn_vta_next_solicitud_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vta_solicitud_id ON public.vta_solicitudes_venta;
CREATE TRIGGER trg_vta_solicitud_id BEFORE INSERT ON public.vta_solicitudes_venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_vta_set_solicitud_id();

-- TEA editable solo por admin: no-admin solo puede insertar DEFAULT 40 y no puede modificarlo
CREATE OR REPLACE FUNCTION public.fn_vta_protect_tea()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tea IS DISTINCT FROM 40 AND NOT public.fn_sgt360_is_admin() THEN
      RAISE EXCEPTION 'SGT360 vta: TEA solo editable por admin (INSERT con tea distinto de 40 denegado)';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.tea IS DISTINCT FROM OLD.tea AND NOT public.fn_sgt360_is_admin() THEN
      RAISE EXCEPTION 'SGT360 vta: TEA solo editable por admin';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vta_protect_tea ON public.vta_solicitudes_venta;
CREATE TRIGGER trg_vta_protect_tea BEFORE INSERT OR UPDATE ON public.vta_solicitudes_venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_vta_protect_tea();

-- ----------------------------------------------------------------------------
-- 2. Detalle: vta_venta_items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vta_venta_items (
  id                   SERIAL PRIMARY KEY,
  solicitud_id         TEXT NOT NULL REFERENCES public.vta_solicitudes_venta(id) ON DELETE CASCADE,
  id_material          TEXT REFERENCES public.mae_materiales(id) ON DELETE SET NULL,
  cantidad             NUMERIC(12,2) CHECK (cantidad IS NULL OR cantidad > 0),
  precio_unit          NUMERIC(12,2) CHECK (precio_unit IS NULL OR precio_unit >= 0), -- editable
  descuento_monto      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (descuento_monto >= 0),
  modo                 TEXT NOT NULL DEFAULT 'financiado' CHECK (modo IN ('financiado','contado')),
  medio_pago           TEXT CHECK (medio_pago IS NULL OR medio_pago IN ('financiado','efectivo','tarjeta')),
  subtotal             NUMERIC(12,2) CHECK (subtotal IS NULL OR subtotal >= 0),
  numero_pedido_venta  TEXT, -- nullable; UNIQUE parcial (solo no-nulos) vía índice
  numero_pedido_abono  TEXT  -- nullable
);
COMMENT ON TABLE public.vta_venta_items IS
  'SGT360 vta: items de la solicitud. precio_unit editable. subtotal = cantidad*precio_unit - descuento_monto (trigger). numero_pedido_venta UNIQUE parcial solo no-nulos.';

-- Autocálculo subtotal: cantidad*precio_unit - descuento_monto (redondeo 2 dec)
CREATE OR REPLACE FUNCTION public.fn_vta_calc_item_subtotal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cantidad IS NOT NULL AND NEW.precio_unit IS NOT NULL THEN
    NEW.subtotal := round(NEW.cantidad * NEW.precio_unit - COALESCE(NEW.descuento_monto, 0), 2);
    IF NEW.subtotal < 0 THEN NEW.subtotal := 0; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vta_item_subtotal ON public.vta_venta_items;
CREATE TRIGGER trg_vta_item_subtotal BEFORE INSERT OR UPDATE ON public.vta_venta_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_vta_calc_item_subtotal();

-- UNIQUE parcial: numero_pedido_venta por item, solo cuando no es nulo
CREATE UNIQUE INDEX IF NOT EXISTS uq_vta_items_pedido_venta
  ON public.vta_venta_items (numero_pedido_venta)
  WHERE numero_pedido_venta IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Abonos / cuota inicial: vta_abonos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vta_abonos (
  id              SERIAL PRIMARY KEY,
  solicitud_id    TEXT NOT NULL REFERENCES public.vta_solicitudes_venta(id) ON DELETE CASCADE,
  item_id         INT REFERENCES public.vta_venta_items(id) ON DELETE SET NULL,
  monto           NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  medio           TEXT NOT NULL CHECK (medio IN ('efectivo','tarjeta')),
  comprobante_url TEXT, -- URL voucher/comprobante (futura public URL de Supabase Storage)
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','efectuado','validado')),
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.vta_abonos IS 'SGT360 vta: abonos / cuota inicial (mixto y contado_total). comprobante como URL (Supabase Storage cuando exista).';
COMMENT ON COLUMN public.vta_abonos.comprobante_url IS 'URL comprobante de pago. Sin bucket en este DDL; usar public URL de Supabase Storage cuando exista.';

-- ----------------------------------------------------------------------------
-- 4. Instalación: vta_instalaciones (1 por solicitud)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vta_instalaciones (
  id               SERIAL PRIMARY KEY,
  solicitud_id     TEXT NOT NULL UNIQUE REFERENCES public.vta_solicitudes_venta(id) ON DELETE CASCADE,
  foto_antes_url   TEXT, -- URL (futura public URL de Supabase Storage)
  foto_despues_url TEXT, -- URL (futura public URL de Supabase Storage)
  boleta_url       TEXT, -- URL (futura public URL de Supabase Storage)
  acta_url         TEXT, -- URL acta de instalación (futura public URL de Supabase Storage)
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','registrada','validada_proveedor','observada','cerrada')),
  observacion      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.vta_instalaciones IS 'SGT360 vta: evidencia de instalacion, 1 fila por solicitud (UNIQUE solicitud_id). Fotos/boleta/acta como URL (Supabase Storage cuando exista).';

-- ----------------------------------------------------------------------------
-- 5. Índices en FKs / estado
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_vta_sol_cliente   ON public.vta_solicitudes_venta(id_cliente);
CREATE INDEX IF NOT EXISTS ix_vta_sol_proveedor ON public.vta_solicitudes_venta(id_proveedor);
CREATE INDEX IF NOT EXISTS ix_vta_sol_estado    ON public.vta_solicitudes_venta(estado);
CREATE INDEX IF NOT EXISTS ix_vta_sol_created   ON public.vta_solicitudes_venta(created_by);
CREATE INDEX IF NOT EXISTS ix_vta_sol_pedido    ON public.vta_solicitudes_venta(numero_pedido);
CREATE INDEX IF NOT EXISTS ix_vta_item_sol      ON public.vta_venta_items(solicitud_id);
CREATE INDEX IF NOT EXISTS ix_vta_item_mat      ON public.vta_venta_items(id_material);
CREATE INDEX IF NOT EXISTS ix_vta_item_modo     ON public.vta_venta_items(modo);
CREATE INDEX IF NOT EXISTS ix_vta_item_pabono   ON public.vta_venta_items(numero_pedido_abono);
CREATE INDEX IF NOT EXISTS ix_vta_abono_sol     ON public.vta_abonos(solicitud_id);
CREATE INDEX IF NOT EXISTS ix_vta_abono_item    ON public.vta_abonos(item_id);
CREATE INDEX IF NOT EXISTS ix_vta_abono_estado  ON public.vta_abonos(estado);
CREATE INDEX IF NOT EXISTS ix_vta_abono_created ON public.vta_abonos(created_by);
CREATE INDEX IF NOT EXISTS ix_vta_inst_sol      ON public.vta_instalaciones(solicitud_id);
CREATE INDEX IF NOT EXISTS ix_vta_inst_estado   ON public.vta_instalaciones(estado);

-- ----------------------------------------------------------------------------
-- 6. Triggers updated_at (reusa fn_sgt360_set_updated_at)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_vta_solicitudes_upd ON public.vta_solicitudes_venta;
CREATE TRIGGER trg_vta_solicitudes_upd BEFORE UPDATE ON public.vta_solicitudes_venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();
DROP TRIGGER IF EXISTS trg_vta_instalaciones_upd ON public.vta_instalaciones;
CREATE TRIGGER trg_vta_instalaciones_upd BEFORE UPDATE ON public.vta_instalaciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Grants mínimos (service_role bypass RLS; authenticated vía RLS)
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vta_solicitudes_venta TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vta_venta_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vta_abonos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vta_instalaciones TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.vta_venta_items_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.vta_abonos_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.vta_instalaciones_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_vta_next_solicitud_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_vta_calc_item_subtotal() TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. RLS: authenticated lectura propia por created_by + admin todo
--    Cabecera: created_by directo. Hijas: herencia del dueño de la solicitud
--    (items/instalaciones sin created_by; abonos: dueño propio o de la solicitud).
-- ----------------------------------------------------------------------------
ALTER TABLE public.vta_solicitudes_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vta_venta_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vta_abonos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vta_instalaciones      ENABLE ROW LEVEL SECURITY;

-- 8.1 Solicitudes
DROP POLICY IF EXISTS vta_sol_select ON public.vta_solicitudes_venta;
CREATE POLICY vta_sol_select ON public.vta_solicitudes_venta FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.fn_sgt360_is_admin());
DROP POLICY IF EXISTS vta_sol_insert ON public.vta_solicitudes_venta;
CREATE POLICY vta_sol_insert ON public.vta_solicitudes_venta FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.fn_sgt360_is_admin());
DROP POLICY IF EXISTS vta_sol_update ON public.vta_solicitudes_venta;
CREATE POLICY vta_sol_update ON public.vta_solicitudes_venta FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.fn_sgt360_is_admin())
  WITH CHECK (created_by = auth.uid() OR public.fn_sgt360_is_admin());
DROP POLICY IF EXISTS vta_sol_delete ON public.vta_solicitudes_venta;
CREATE POLICY vta_sol_delete ON public.vta_solicitudes_venta FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.fn_sgt360_is_admin());

-- 8.2 Items (hereda dueño de la solicitud)
DROP POLICY IF EXISTS vta_item_select ON public.vta_venta_items;
CREATE POLICY vta_item_select ON public.vta_venta_items FOR SELECT TO authenticated
  USING (public.fn_sgt360_is_admin() OR EXISTS (
    SELECT 1 FROM public.vta_solicitudes_venta s
    WHERE s.id = vta_venta_items.solicitud_id AND s.created_by = auth.uid()));
DROP POLICY IF EXISTS vta_item_insert ON public.vta_venta_items;
CREATE POLICY vta_item_insert ON public.vta_venta_items FOR INSERT TO authenticated
  WITH CHECK (public.fn_sgt360_is_admin() OR EXISTS (
    SELECT 1 FROM public.vta_solicitudes_venta s
    WHERE s.id = vta_venta_items.solicitud_id AND s.created_by = auth.uid()));
DROP POLICY IF EXISTS vta_item_update ON public.vta_venta_items;
CREATE POLICY vta_item_update ON public.vta_venta_items FOR UPDATE TO authenticated
  USING (public.fn_sgt360_is_admin() OR EXISTS (
    SELECT 1 FROM public.vta_solicitudes_venta s
    WHERE s.id = vta_venta_items.solicitud_id AND s.created_by = auth.uid()))
  WITH CHECK (public.fn_sgt360_is_admin() OR EXISTS (
    SELECT 1 FROM public.vta_solicitudes_venta s
    WHERE s.id = vta_venta_items.solicitud_id AND s.created_by = auth.uid()));
DROP POLICY IF EXISTS vta_item_delete ON public.vta_venta_items;
CREATE POLICY vta_item_delete ON public.vta_venta_items FOR DELETE TO authenticated
  USING (public.fn_sgt360_is_admin() OR EXISTS (
    SELECT 1 FROM public.vta_solicitudes_venta s
    WHERE s.id = vta_venta_items.solicitud_id AND s.created_by = auth.uid()));

-- 8.3 Abonos (dueño propio o dueño de la solicitud)
DROP POLICY IF EXISTS vta_abono_select ON public.vta_abonos;
CREATE POLICY vta_abono_select ON public.vta_abonos FOR SELECT TO authenticated
  USING (public.fn_sgt360_is_admin()
    OR vta_abonos.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.vta_solicitudes_venta s
               WHERE s.id = vta_abonos.solicitud_id AND s.created_by = auth.uid()));
DROP POLICY IF EXISTS vta_abono_insert ON public.vta_abonos;
CREATE POLICY vta_abono_insert ON public.vta_abonos FOR INSERT TO authenticated
  WITH CHECK (public.fn_sgt360_is_admin()
    OR vta_abonos.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.vta_solicitudes_venta s
               WHERE s.id = vta_abonos.solicitud_id AND s.created_by = auth.uid()));
DROP POLICY IF EXISTS vta_abono_update ON public.vta_abonos;
CREATE POLICY vta_abono_update ON public.vta_abonos FOR UPDATE TO authenticated
  USING (public.fn_sgt360_is_admin()
    OR vta_abonos.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.vta_solicitudes_venta s
               WHERE s.id = vta_abonos.solicitud_id AND s.created_by = auth.uid()))
  WITH CHECK (public.fn_sgt360_is_admin()
    OR vta_abonos.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.vta_solicitudes_venta s
               WHERE s.id = vta_abonos.solicitud_id AND s.created_by = auth.uid()));
DROP POLICY IF EXISTS vta_abono_delete ON public.vta_abonos;
CREATE POLICY vta_abono_delete ON public.vta_abonos FOR DELETE TO authenticated
  USING (public.fn_sgt360_is_admin()
    OR vta_abonos.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.vta_solicitudes_venta s
               WHERE s.id = vta_abonos.solicitud_id AND s.created_by = auth.uid()));

-- 8.4 Instalaciones (hereda dueño de la solicitud, 1 por solicitud)
DROP POLICY IF EXISTS vta_inst_select ON public.vta_instalaciones;
CREATE POLICY vta_inst_select ON public.vta_instalaciones FOR SELECT TO authenticated
  USING (public.fn_sgt360_is_admin() OR EXISTS (
    SELECT 1 FROM public.vta_solicitudes_venta s
    WHERE s.id = vta_instalaciones.solicitud_id AND s.created_by = auth.uid()));
DROP POLICY IF EXISTS vta_inst_insert ON public.vta_instalaciones;
CREATE POLICY vta_inst_insert ON public.vta_instalaciones FOR INSERT TO authenticated
  WITH CHECK (public.fn_sgt360_is_admin() OR EXISTS (
    SELECT 1 FROM public.vta_solicitudes_venta s
    WHERE s.id = vta_instalaciones.solicitud_id AND s.created_by = auth.uid()));
DROP POLICY IF EXISTS vta_inst_update ON public.vta_instalaciones;
CREATE POLICY vta_inst_update ON public.vta_instalaciones FOR UPDATE TO authenticated
  USING (public.fn_sgt360_is_admin() OR EXISTS (
    SELECT 1 FROM public.vta_solicitudes_venta s
    WHERE s.id = vta_instalaciones.solicitud_id AND s.created_by = auth.uid()))
  WITH CHECK (public.fn_sgt360_is_admin() OR EXISTS (
    SELECT 1 FROM public.vta_solicitudes_venta s
    WHERE s.id = vta_instalaciones.solicitud_id AND s.created_by = auth.uid()));
DROP POLICY IF EXISTS vta_inst_delete ON public.vta_instalaciones;
CREATE POLICY vta_inst_delete ON public.vta_instalaciones FOR DELETE TO authenticated
  USING (public.fn_sgt360_is_admin() OR EXISTS (
    SELECT 1 FROM public.vta_solicitudes_venta s
    WHERE s.id = vta_instalaciones.solicitud_id AND s.created_by = auth.uid()));

-- ----------------------------------------------------------------------------
-- 9. Seed: 0 filas demo (sin datos quemados) — sin INSERTs por diseño
-- ----------------------------------------------------------------------------
-- RESUMEN (para verificación):
--   Tablas: 4 (vta_solicitudes_venta, vta_venta_items, vta_abonos, vta_instalaciones)
--   Estados solicitud (8): borrador/pendiente_aprobacion/observado/aprobada/
--     en_instalacion/instalada/validada_proveedor/cerrada (default borrador)
--   Estados abono (3): pendiente/efectuado/validado (default pendiente)
--   Estados instalación (5): pendiente/registrada/validada_proveedor/observada/cerrada
--     (default pendiente)
--   Checks catálogo: canal(3) visita_estado(2) pago_modo(3) modo(2) medio_pago(3) medio(2)
