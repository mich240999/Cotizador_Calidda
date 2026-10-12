-- ============================================================================
-- SGT360 · Migración AMCA 01 — materiales por espacio y relaciones comerciales
-- ESPACIO: COTIZACION (módulo Cotizaciones) o VENTAS (módulo Ventas).
-- Relaciones por fila: proveedor, asesor (texto + FK best-effort), oficina, grupo.
-- Ejecutar DESPUÉS de supabase/schema_sgt360.sql. Idempotente.
-- ============================================================================

ALTER TABLE public.mae_materiales
  ADD COLUMN IF NOT EXISTS espacio TEXT CHECK (espacio IS NULL OR espacio IN ('COTIZACION','VENTAS')),
  ADD COLUMN IF NOT EXISTS espacio_remodelar TEXT,
  ADD COLUMN IF NOT EXISTS codigo_sap TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS id_proveedor TEXT REFERENCES public.mae_proveedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_asesor TEXT REFERENCES public.seg_usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asesor_nombre TEXT,
  ADD COLUMN IF NOT EXISTS id_oficina TEXT REFERENCES public.mae_oficinas_ventas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_grupo TEXT REFERENCES public.mae_grupos_vendedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_mat_espacio   ON public.mae_materiales(espacio);
CREATE INDEX IF NOT EXISTS ix_mat_proveedor ON public.mae_materiales(id_proveedor);
CREATE INDEX IF NOT EXISTS ix_mat_sap       ON public.mae_materiales(codigo_sap);

-- El Excel AMCA identifica al proveedor por BP (interlocutor); el RUC llega después.
ALTER TABLE public.mae_proveedores ALTER COLUMN ruc DROP NOT NULL;
