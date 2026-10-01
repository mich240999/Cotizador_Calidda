-- ============================================================================
-- SGT360 · Migración storage 01 — buckets para adjuntos de ventas
-- Ejecutar en Supabase Dashboard > Storage o SQL Editor > New query > Run
-- Idempotente y re-ejecutable.
-- URLs resultantes cortas (<200 chars), compatibles con columnas *_url.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('adjuntos-ventas', 'adjuntos-ventas', true),
  ('comprobantes', 'comprobantes', true),
  ('sustentos', 'sustentos', true)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública (links directos en PDF, correos y vistas).
DROP POLICY IF EXISTS "lectura publica adjuntos" ON storage.objects;
CREATE POLICY "lectura publica adjuntos" ON storage.objects
  FOR SELECT USING (bucket_id IN ('adjuntos-ventas', 'comprobantes', 'sustentos'));

-- Subida solo autenticados (el backend usa service_role y no pasa por RLS).
DROP POLICY IF EXISTS "subida autenticados adjuntos" ON storage.objects;
CREATE POLICY "subida autenticados adjuntos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('adjuntos-ventas', 'comprobantes', 'sustentos'));
