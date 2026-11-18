-- ============================================================================
-- AMCA 04 — cotización dimensional, integradores, materiales de venta y revisión.
-- Ejecutar después de schema_sgt360.sql, schema_ventas.sql y migracion_03.
-- Idempotente; conserva clientes, Auth y cuentas existentes.
-- ============================================================================

BEGIN;

-- 1) Integradores: una empresa integradora puede agrupar varios proveedores.
CREATE TABLE IF NOT EXISTS public.mae_integradores (
  id          TEXT PRIMARY KEY CHECK (id ~ '^INT[0-9]{4}$'),
  nombre      TEXT NOT NULL UNIQUE,
  estado      TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mae_proveedores
  ADD COLUMN IF NOT EXISTS id_integrador TEXT REFERENCES public.mae_integradores(id) ON DELETE SET NULL;
ALTER TABLE public.seg_usuarios
  ADD COLUMN IF NOT EXISTS id_integrador TEXT REFERENCES public.mae_integradores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_mae_proveedores_integrador ON public.mae_proveedores(id_integrador);
CREATE INDEX IF NOT EXISTS ix_seg_usuarios_integrador ON public.seg_usuarios(id_integrador);

-- 2) Los materiales de venta pueden repetirse por asesor/proveedor/ambiente.
-- El código SAP identifica al producto, no a una asignación única de venta.
ALTER TABLE public.mae_materiales
  ADD COLUMN IF NOT EXISTS proveedor_nombre TEXT,
  ADD COLUMN IF NOT EXISTS id_integrador TEXT REFERENCES public.mae_integradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS integrador_nombre TEXT,
  ADD COLUMN IF NOT EXISTS oficina_ref TEXT,
  ADD COLUMN IF NOT EXISTS grupo_ref TEXT;

ALTER TABLE public.mae_materiales
  DROP CONSTRAINT IF EXISTS mae_materiales_codigo_sap_key;
DROP INDEX IF EXISTS public.mae_materiales_codigo_sap_key;
CREATE INDEX IF NOT EXISTS ix_mae_materiales_venta_match
  ON public.mae_materiales(espacio, espacio_remodelar, id_proveedor, id_asesor);
CREATE INDEX IF NOT EXISTS ix_mae_materiales_venta_nombre
  ON public.mae_materiales(espacio, lower(proveedor_nombre), lower(asesor_nombre));

-- 3) Cotización: empresa/integrador y medidas por línea. Precio es el importe
-- del producto; el interés se guarda en la simulación/cuota, no en el precio.
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS id_proveedor TEXT REFERENCES public.mae_proveedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_integrador TEXT REFERENCES public.mae_integradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_asesor TEXT REFERENCES public.seg_usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ambiente TEXT;

ALTER TABLE public.cotizacion_items
  ADD COLUMN IF NOT EXISTS ambiente TEXT,
  ADD COLUMN IF NOT EXISTS alto NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ancho NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fondo NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_cotizaciones_proveedor ON public.cotizaciones(id_proveedor);
CREATE INDEX IF NOT EXISTS ix_cotizaciones_integrador ON public.cotizaciones(id_integrador);

-- 4) Solicitud: conserva integrador, tasa y cuota calculada, y el único sustento
-- obligatorio al solicitar venta (código de audio, voucher o contrato físico).
ALTER TABLE public.vta_solicitudes_venta
  ADD COLUMN IF NOT EXISTS id_integrador TEXT REFERENCES public.mae_integradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cuota_mensual NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medio_respaldo TEXT,
  ADD COLUMN IF NOT EXISTS voucher_solicitud_url TEXT,
  ADD COLUMN IF NOT EXISTS contrato_fisico_url TEXT,
  ADD COLUMN IF NOT EXISTS nota_liquidacion TEXT,
  ADD COLUMN IF NOT EXISTS nota_reversion TEXT;

ALTER TABLE public.vta_solicitudes_venta
  DROP CONSTRAINT IF EXISTS vta_solicitudes_venta_estado_check;
ALTER TABLE public.vta_solicitudes_venta
  ADD CONSTRAINT vta_solicitudes_venta_estado_check CHECK (estado IN (
    'borrador','pendiente_aprobacion','observado','subsanado_pendiente','aprobada','generada',
    'en_instalacion','instalada','validada_proveedor','cerrada','pendiente_liquidar','liquidada'));

ALTER TABLE public.vta_solicitudes_venta
  DROP CONSTRAINT IF EXISTS vta_solicitudes_venta_pago_modo_check;
ALTER TABLE public.vta_solicitudes_venta
  ADD CONSTRAINT vta_solicitudes_venta_pago_modo_check CHECK (
    pago_modo IS NULL OR pago_modo IN ('financiado','con_abono','financiado_total','mixto','contado_total')
  );

-- 5) Cada pedido queda trazable a su producto y cuota. Con abono habrá una fila
-- VENTA financiada y otra ABONO, ambas con el mismo código de material.
ALTER TABLE public.vta_venta_items
  ADD COLUMN IF NOT EXISTS tipo_pedido TEXT NOT NULL DEFAULT 'VENTA',
  ADD COLUMN IF NOT EXISTS nro_cuotas INT,
  ADD COLUMN IF NOT EXISTS cuota_mensual NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_codigo TEXT,
  ADD COLUMN IF NOT EXISTS material_nombre TEXT,
  ADD COLUMN IF NOT EXISTS alto NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS ancho NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fondo NUMERIC(10,2);

ALTER TABLE public.vta_venta_items
  DROP CONSTRAINT IF EXISTS vta_venta_items_tipo_pedido_check;
ALTER TABLE public.vta_venta_items
  ADD CONSTRAINT vta_venta_items_tipo_pedido_check CHECK (tipo_pedido IN ('VENTA','ABONO'));

-- 6) Evidencias separadas para que administración apruebe/rechace cada archivo
-- y guarde observación por sustento sin perder la versión enviada.
CREATE TABLE IF NOT EXISTS public.vta_instalacion_evidencias (
  id            BIGSERIAL PRIMARY KEY,
  solicitud_id  TEXT NOT NULL REFERENCES public.vta_solicitudes_venta(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN (
    'foto_antes','foto_durante','foto_despues','foto_dni',
    'foto_cliente_dni','acta','boleta'
  )),
  url           TEXT NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','aprobado','rechazado')),
  observacion   TEXT,
  revisado_por  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revisado_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (solicitud_id, tipo)
);
CREATE INDEX IF NOT EXISTS ix_vta_inst_evid_solicitud
  ON public.vta_instalacion_evidencias(solicitud_id);

ALTER TABLE public.vta_instalaciones
  DROP CONSTRAINT IF EXISTS vta_instalaciones_tipo_liquidacion_check;
ALTER TABLE public.vta_instalaciones
  ADD CONSTRAINT vta_instalaciones_tipo_liquidacion_check
  CHECK (tipo_liquidacion IS NULL OR tipo_liquidacion = 'acta');

ALTER TABLE public.vta_instalaciones
  DROP CONSTRAINT IF EXISTS vta_instalaciones_estado_check;
ALTER TABLE public.vta_instalaciones
  ADD CONSTRAINT vta_instalaciones_estado_check CHECK (estado IN (
    'pendiente','registrada','validada_proveedor','observada','subsanado_pendiente',
    'pendiente_liquidar','cerrada','liquidada'));

-- 7) Semilla de las únicas cuatro categorías habilitadas para cotizar.
DO $$
DECLARE
  r RECORD;
  v_id TEXT;
  v_next INT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('COT-COCINA',     'Ambiente cocina',     'COCINA'),
      ('COT-SALA',       'Ambiente sala',       'SALA'),
      ('COT-DORMITORIO', 'Ambiente dormitorio', 'DORMITORIO'),
      ('COT-OTROS',      'Ambiente otros',      'OTROS')
    ) AS x(codigo, nombre, ambiente)
  LOOP
    SELECT id INTO v_id
      FROM public.mae_materiales
      WHERE codigo_sap = r.codigo AND espacio = 'COTIZACION'
      ORDER BY id LIMIT 1;

    IF v_id IS NULL THEN
      SELECT COALESCE(MAX((regexp_match(id, '^MAT-([0-9]{5})$'))[1]::INT), 0) + 1
        INTO v_next FROM public.mae_materiales;
      v_id := 'MAT-' || lpad(v_next::TEXT, 5, '0');
      INSERT INTO public.mae_materiales (
        id,codigo_sap,nombre,descripcion,unidad,tipo_medida,decimales,estado,espacio,espacio_remodelar
      ) VALUES (
        v_id,r.codigo,r.nombre,'Material genérico para cotización','UND','LONGITUD',2,'ACTIVO','COTIZACION',r.ambiente
      );
    ELSE
      UPDATE public.mae_materiales
        SET nombre=r.nombre, espacio='COTIZACION', espacio_remodelar=r.ambiente, estado='ACTIVO'
        WHERE id=v_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.pre_tarifario
      WHERE id_material=v_id AND precio=0 AND fecha_fin IS NULL
    ) THEN
      INSERT INTO public.pre_tarifario (
        id_material,precio,moneda,incluye_igv,fecha_inicio,fecha_fin,estado
      ) VALUES (v_id,0,'PEN',true,CURRENT_DATE,NULL,'VIGENTE');
    END IF;
  END LOOP;
END $$;

COMMIT;
