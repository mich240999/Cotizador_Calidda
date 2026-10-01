-- ============================================================================
-- SGT360 · Migración roles 01 — permitir crear nuevos roles
-- seg_roles nació con CHECK cerrados (solo ADMIN/PROVEEDOR/SUPERVISOR/ASESOR
-- y niveles 20/30/40/50). Esta migración libera codigo/nivel/alcance para
-- que Administración > Roles pueda crear y editar roles.
-- Los 4 roles base y sus permisos predeterminados NO se tocan.
-- Ejecutar DESPUÉS de supabase/schema_sgt360.sql. Idempotente.
-- ============================================================================

ALTER TABLE public.seg_roles DROP CONSTRAINT IF EXISTS seg_roles_codigo_check;
ALTER TABLE public.seg_roles DROP CONSTRAINT IF EXISTS seg_roles_nivel_check;
ALTER TABLE public.seg_roles DROP CONSTRAINT IF EXISTS seg_roles_alcance_check;

ALTER TABLE public.seg_roles
  ADD CONSTRAINT seg_roles_codigo_check CHECK (char_length(codigo) BETWEEN 2 AND 30 AND codigo = upper(codigo)),
  ADD CONSTRAINT seg_roles_nivel_check CHECK (nivel BETWEEN 1 AND 100),
  ADD CONSTRAINT seg_roles_alcance_check CHECK (char_length(alcance) BETWEEN 2 AND 30);
