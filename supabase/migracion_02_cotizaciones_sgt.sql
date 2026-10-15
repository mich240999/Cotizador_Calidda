-- Migración 02 — columnas SGT de cotizaciones + snapshot de ítems.
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
-- Motivo: el backend ya intenta guardar plazo, cuota_mensual, asesor,
-- proveedor, adelanto y nombre de material, pero estas columnas no existen
-- en la BD y los datos se pierden en silencio (ej. la columna CUOTAS de la
-- lista sale "—", el asesor no llega al PDF, el material sale "—").
-- Con IF NOT EXISTS es seguro: incluye lo de la migración 01.

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS descuento NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cuota_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capital NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tea NUMERIC(8,4) NOT NULL DEFAULT 0.40,
  ADD COLUMN IF NOT EXISTS plazo INT NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS cuota_mensual NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proveedor TEXT,
  ADD COLUMN IF NOT EXISTS asesor TEXT,
  ADD COLUMN IF NOT EXISTS asesor_telefono TEXT;

ALTER TABLE public.cotizacion_items
  ADD COLUMN IF NOT EXISTS descripcion TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS material_codigo TEXT;
