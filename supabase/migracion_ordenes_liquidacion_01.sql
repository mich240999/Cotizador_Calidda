-- Guarda por venta las órdenes ERP asociadas al PV de venta y al PV de abono.
ALTER TABLE public.vta_solicitudes_venta
  ADD COLUMN IF NOT EXISTS orden_pedido_venta TEXT,
  ADD COLUMN IF NOT EXISTS orden_pedido_abono TEXT;
