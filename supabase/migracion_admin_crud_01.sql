-- ============================================================================
-- SGT360 · Migración admin CRUD 01 — asignaciones de asesores
-- Tabla seg_asignaciones_asesores (id ASGxxxx) con estados por bandeja.
-- Ejecutar DESPUÉS de supabase/schema_sgt360.sql. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seg_asignaciones_asesores (
  id            TEXT PRIMARY KEY CHECK (id ~ '^ASG[0-9]{4}$'),
  id_asesor     TEXT NOT NULL REFERENCES public.seg_usuarios(id) ON DELETE RESTRICT,
  id_supervisor TEXT REFERENCES public.seg_usuarios(id) ON DELETE SET NULL,
  id_proveedor  TEXT REFERENCES public.mae_proveedores(id) ON DELETE SET NULL,
  id_oficina    TEXT REFERENCES public.mae_oficinas_ventas(id) ON DELETE SET NULL,
  id_grupo      TEXT REFERENCES public.mae_grupos_vendedores(id) ON DELETE SET NULL,
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE,
  estado        TEXT NOT NULL DEFAULT 'VIGENTE'
                CHECK (estado IN ('VIGENTE','PROGRAMADA','FINALIZADA','CANCELADA')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.seg_asignaciones_asesores IS 'SGT360 seg: asesor ↔ supervisor/proveedor/oficina/grupo con vigencia.';

DROP TRIGGER IF EXISTS trg_seg_asig_upd ON public.seg_asignaciones_asesores;
CREATE TRIGGER trg_seg_asig_upd BEFORE UPDATE ON public.seg_asignaciones_asesores
  FOR EACH ROW EXECUTE FUNCTION public.fn_sgt360_set_updated_at();

CREATE INDEX IF NOT EXISTS ix_seg_asig_asesor ON public.seg_asignaciones_asesores(id_asesor);
CREATE INDEX IF NOT EXISTS ix_seg_asig_sup    ON public.seg_asignaciones_asesores(id_supervisor);
CREATE INDEX IF NOT EXISTS ix_seg_asig_prov   ON public.seg_asignaciones_asesores(id_proveedor);
CREATE INDEX IF NOT EXISTS ix_seg_asig_ofi    ON public.seg_asignaciones_asesores(id_oficina);
CREATE INDEX IF NOT EXISTS ix_seg_asig_estado ON public.seg_asignaciones_asesores(estado);

ALTER TABLE public.seg_asignaciones_asesores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seg_asig_select ON public.seg_asignaciones_asesores;
CREATE POLICY seg_asig_select ON public.seg_asignaciones_asesores FOR SELECT TO authenticated
  USING (public.fn_sgt360_is_admin() OR id_asesor IN (
    SELECT u.id FROM public.seg_usuarios u WHERE lower(u.correo) = lower(coalesce(auth.jwt() ->> 'email', ''))));
DROP POLICY IF EXISTS seg_asig_admin ON public.seg_asignaciones_asesores;
CREATE POLICY seg_asig_admin ON public.seg_asignaciones_asesores FOR ALL TO authenticated
  USING (public.fn_sgt360_is_admin()) WITH CHECK (public.fn_sgt360_is_admin());
