-- ============================================================================
-- SGT360 · Migración ventas 02 — asesor, teléfono y foto del espacio
-- Ejecutar DESPUÉS de supabase/schema_ventas.sql. Idempotente.
-- ============================================================================

ALTER TABLE public.vta_solicitudes_venta
  ADD COLUMN IF NOT EXISTS id_asesor TEXT REFERENCES public.seg_usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asesor_telefono TEXT,
  ADD COLUMN IF NOT EXISTS foto_espacio_url TEXT;

CREATE INDEX IF NOT EXISTS ix_vta_sol_asesor ON public.vta_solicitudes_venta(id_asesor);
