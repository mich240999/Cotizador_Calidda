-- Guarda por venta las órdenes ERP y sus sustentos del PV de venta y del PV de abono.
ALTER TABLE public.vta_solicitudes_venta
  ADD COLUMN IF NOT EXISTS orden_pedido_venta TEXT,
  ADD COLUMN IF NOT EXISTS orden_pedido_abono TEXT,
  ADD COLUMN IF NOT EXISTS orden_pedido_venta_sustento_url TEXT,
  ADD COLUMN IF NOT EXISTS orden_pedido_abono_sustento_url TEXT;
