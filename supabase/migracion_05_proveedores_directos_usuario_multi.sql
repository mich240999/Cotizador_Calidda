-- ============================================================================
-- AMCA 05 — empresas directamente proveedoras, datos públicos y asignación
-- múltiple de proveedores por usuario.
-- Ejecutar después de migracion_04_cotizaciones_ventas_integradores.sql.
-- Los campos de integrador se conservan solo para compatibilidad histórica;
-- se limpian para que la aplicación ya no dependa de esa jerarquía.
-- ============================================================================
BEGIN;

ALTER TABLE public.mae_proveedores
  ADD COLUMN IF NOT EXISTS sitio_web TEXT,
  ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE public.mae_proveedores ALTER COLUMN ruc DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.seg_usuario_proveedores (
  id_usuario   TEXT NOT NULL REFERENCES public.seg_usuarios(id) ON DELETE CASCADE,
  id_proveedor TEXT NOT NULL REFERENCES public.mae_proveedores(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_usuario, id_proveedor)
);
CREATE INDEX IF NOT EXISTS ix_seg_usr_prov_link
  ON public.seg_usuario_proveedores(id_proveedor, id_usuario);
ALTER TABLE public.seg_usuario_proveedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sgt360_read_seg_usuario_proveedores ON public.seg_usuario_proveedores;
DROP POLICY IF EXISTS sgt360_admin_seg_usuario_proveedores ON public.seg_usuario_proveedores;
CREATE POLICY sgt360_read_seg_usuario_proveedores ON public.seg_usuario_proveedores
  FOR SELECT TO authenticated USING (public.fn_sgt360_is_admin());
CREATE POLICY sgt360_admin_seg_usuario_proveedores ON public.seg_usuario_proveedores
  FOR ALL TO authenticated USING (public.fn_sgt360_is_admin()) WITH CHECK (public.fn_sgt360_is_admin());

-- Migra el vínculo único anterior a la nueva relación múltiple.
INSERT INTO public.seg_usuario_proveedores(id_usuario, id_proveedor)
SELECT id, id_proveedor
  FROM public.seg_usuarios
 WHERE id_proveedor IS NOT NULL
ON CONFLICT (id_usuario, id_proveedor) DO NOTHING;

-- Libro1: si las cuentas demo de asesores ya fueron creadas antes de aplicar
-- esta migración, completa aquí sus 22 relaciones asesor-proveedor.
INSERT INTO public.seg_usuario_proveedores(id_usuario, id_proveedor)
SELECT u.id, p.id
  FROM (VALUES
    ('huberto.echegaray@demo.calidda.com.pe','LANDCORP INVERSIONES E.I.R.L.'),
    ('omar.venancio@demo.calidda.com.pe','RESCATE 24'),
    ('erika.matta@demo.calidda.com.pe','PLACA DECOR'),
    ('camelia.sanchez@demo.calidda.com.pe','KOJAC'),
    ('ever.cardenas@demo.calidda.com.pe','KOJAC'),
    ('rafael.gomez@demo.calidda.com.pe','JCHAN'),
    ('rafael.gomez@demo.calidda.com.pe','DEYBIS CRUZ'),
    ('rafael.gomez@demo.calidda.com.pe','MHAC'),
    ('rafael.gomez@demo.calidda.com.pe','AGL'),
    ('rafael.gomez@demo.calidda.com.pe','JECAR'),
    ('rafael.gomez@demo.calidda.com.pe','DEIDAMIA'),
    ('rafael.gomez@demo.calidda.com.pe','MADERAS AMERICA'),
    ('cesar.cueva@demo.calidda.com.pe','JCHAN'),
    ('cesar.cueva@demo.calidda.com.pe','DEYBIS CRUZ'),
    ('cesar.cueva@demo.calidda.com.pe','MHAC'),
    ('cesar.cueva@demo.calidda.com.pe','AGL'),
    ('cesar.cueva@demo.calidda.com.pe','JECAR'),
    ('cesar.cueva@demo.calidda.com.pe','DEIDAMIA'),
    ('cesar.cueva@demo.calidda.com.pe','MADERAS AMERICA'),
    ('joshajane.chan@demo.calidda.com.pe','JCHAN'),
    ('deidamia@demo.calidda.com.pe','DEIDAMIA'),
    ('deybis.cruz.blas@demo.calidda.com.pe','DEYBIS CRUZ')
  ) AS m(correo, interlocutor)
  JOIN public.seg_usuarios u ON lower(u.correo) = m.correo
  JOIN public.mae_proveedores p ON upper(p.interlocutor) = upper(m.interlocutor)
ON CONFLICT (id_usuario, id_proveedor) DO NOTHING;

-- Retira los vínculos de integrador sin borrar datos históricos ni tablas.
UPDATE public.mae_proveedores SET id_integrador = NULL WHERE id_integrador IS NOT NULL;
UPDATE public.seg_usuarios SET id_integrador = NULL WHERE id_integrador IS NOT NULL;
UPDATE public.mae_materiales SET id_integrador = NULL, integrador_nombre = NULL WHERE id_integrador IS NOT NULL;
UPDATE public.cotizaciones SET id_integrador = NULL WHERE id_integrador IS NOT NULL;
UPDATE public.vta_solicitudes_venta SET id_integrador = NULL WHERE id_integrador IS NOT NULL;

-- La visita técnica se incluye en remodelación y deja de ofertarse como línea
-- independiente. Los registros históricos de cotizaciones/ventas se conservan.
UPDATE public.mae_materiales
   SET estado = 'INACTIVO'
 WHERE espacio = 'VENTAS'
   AND (codigo_sap IN ('4502450','4502451')
        OR upper(nombre) LIKE 'VISITA TÉCNICA - AMCA 2.0%');

COMMIT;
