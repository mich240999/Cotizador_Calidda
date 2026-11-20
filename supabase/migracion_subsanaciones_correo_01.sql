-- Avisos configurables para solicitudes/evidencias que el proveedor debe subsanar.
-- Ejecutar una vez en Supabase después de migracion_03_flujo_ventas.sql.

ALTER TABLE public.cfg_cortes
  DROP CONSTRAINT IF EXISTS cfg_cortes_clave_check;
ALTER TABLE public.cfg_cortes
  ADD CONSTRAINT cfg_cortes_clave_check
  CHECK (clave IN ('ventas_pv', 'instalaciones_liq', 'subsanaciones'));

ALTER TABLE public.cfg_cortes
  ADD COLUMN IF NOT EXISTS modo_envio TEXT NOT NULL DEFAULT 'programado';
ALTER TABLE public.cfg_cortes
  DROP CONSTRAINT IF EXISTS cfg_cortes_modo_envio_check;
ALTER TABLE public.cfg_cortes
  ADD CONSTRAINT cfg_cortes_modo_envio_check
  CHECK (modo_envio IN ('automatico', 'programado'));

INSERT INTO public.cfg_cortes
  (clave, horas, para, copia, asunto, mensaje, activo, modo_envio)
VALUES
  ('subsanaciones', '09:00,15:00', '', '',
   'Pendientes por subsanar: {cantidad} solicitudes — {proveedor}',
   'Hola {proveedor},\n\nTienes {cantidad} solicitud(es) con información o evidencias por subsanar:\n{detalle}\n\nIngresa al módulo de Instalaciones para corregir y volver a enviar la información.\n\n{fecha} {hora}',
   true, 'automatico')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cfg_subsanaciones_cola (
  id BIGSERIAL PRIMARY KEY,
  solicitud_id TEXT NOT NULL REFERENCES public.vta_solicitudes_venta(id) ON DELETE CASCADE,
  id_proveedor TEXT REFERENCES public.mae_proveedores(id) ON DELETE SET NULL,
  etapa TEXT NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_at TIMESTAMPTZ,
  resuelto_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_cfg_subsanaciones_pendientes
  ON public.cfg_subsanaciones_cola (creado_at)
  WHERE enviado_at IS NULL AND resuelto_at IS NULL;

ALTER TABLE public.cfg_subsanaciones_cola ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cfg_subsanaciones_cola FROM anon, authenticated;

-- Si el job de cortes ya existe, aumenta su frecuencia a un minuto para
-- respetar exactamente las horas configuradas en la interfaz.
DO $$
DECLARE v_job_id BIGINT;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = $1 ORDER BY jobid DESC LIMIT 1'
      INTO v_job_id USING 'cortes-cotizador';
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.alter_job(v_job_id, schedule => '* * * * *');
    END IF;
  END IF;
END $$;

-- Encola las instalaciones que ya estaban observadas antes de instalar esta migración.
INSERT INTO public.cfg_subsanaciones_cola (solicitud_id, id_proveedor, etapa, motivo)
SELECT s.id, s.id_proveedor, 'las evidencias de instalación', COALESCE(i.observacion, 'Evidencias pendientes de subsanar.')
FROM public.vta_solicitudes_venta s
JOIN public.vta_instalaciones i ON i.solicitud_id = s.id
WHERE i.estado = 'observada'
  AND NOT EXISTS (
    SELECT 1 FROM public.cfg_subsanaciones_cola q
    WHERE q.solicitud_id = s.id AND q.resuelto_at IS NULL
  );
