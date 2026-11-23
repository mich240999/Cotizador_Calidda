-- Distingue una venta observada durante la revisión de evidencias de una
-- solicitud observada durante su aprobación comercial.
ALTER TABLE public.vta_solicitudes_venta
  DROP CONSTRAINT IF EXISTS vta_solicitudes_venta_estado_check;

ALTER TABLE public.vta_solicitudes_venta
  ADD CONSTRAINT vta_solicitudes_venta_estado_check CHECK (estado IN (
    'borrador','pendiente_aprobacion','observado','observado_por_sustento',
    'subsanado_pendiente','aprobada','generada','en_instalacion','instalada',
    'validada_proveedor','cerrada','pendiente_liquidar','liquidada'
  ));
