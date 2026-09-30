-- ============================================================================
-- SGT360 · Migración ventas 01 — columna observacion en vta_abonos
-- Ejecutar DESPUÉS de supabase/schema_ventas.sql (SQL Editor > New query > Run)
-- Requerida por validarAbono(accion=observar) en lib/operacionesVentas.ts
-- Idempotente y re-ejecutable.
-- ============================================================================

ALTER TABLE public.vta_abonos
  ADD COLUMN IF NOT EXISTS observacion TEXT;
