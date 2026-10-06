-- ============================================================================
-- SGT360 · Migración ventas 03 — estado liquidada + foto extra instalación
-- Flujo: aprobada → instalada (proveedor sube 4 fotos) → validada_proveedor
--   → liquidada (Stephany valida y cierra).
-- Ejecutar DESPUÉS de supabase/schema_ventas.sql. Idempotente.
-- ============================================================================

ALTER TABLE public.vta_solicitudes_venta DROP CONSTRAINT IF EXISTS vta_solicitudes_venta_estado_check;
ALTER TABLE public.vta_solicitudes_venta
  ADD CONSTRAINT vta_solicitudes_venta_estado_check CHECK (estado IN (
    'borrador','pendiente_aprobacion','observado','aprobada',
    'en_instalacion','instalada','validada_proveedor','cerrada','liquidada'));

ALTER TABLE public.vta_instalaciones
  ADD COLUMN IF NOT EXISTS foto_extra_url TEXT;
