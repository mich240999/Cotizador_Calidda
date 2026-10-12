-- ============================================================================
-- SGT360 · Migración AMCA 02 — grupos sin proveedor obligatorio + vacíos
-- Los grupos (AM8, AM0, AC1...) son transversales: un grupo puede existir
-- sin proveedor asignado. Las cargas aceptan celdas vacías como NULL.
-- Ejecutar DESPUÉS de supabase/schema_sgt360.sql. Idempotente.
-- ============================================================================

ALTER TABLE public.mae_grupos_vendedores ALTER COLUMN id_proveedor DROP NOT NULL;
