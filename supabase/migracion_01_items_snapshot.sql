-- Migración 01 — Snapshot del nombre del material en cotizacion_items.
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
-- Motivo: los ítems creados desde el maestro SGT (mae_materiales, ids tipo
-- MAT-00004) no tienen contraparte en la tabla legacy `materiales`, por lo
-- que el join viene null y el detalle/PDF muestran "—". Con estas columnas
-- se guarda el nombre al crear la cotización y ya no depende del join.

ALTER TABLE public.cotizacion_items
  ADD COLUMN IF NOT EXISTS descripcion TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS material_codigo TEXT;
