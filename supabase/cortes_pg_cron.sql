-- =====================================================================
-- Cortes programados con pg_cron + pg_net (usa solo tu Supabase).
-- PASO A PASO:
--  1) Supabase Dashboard > Database > Extensions: activa pg_cron y pg_net.
--  2) En Render (y en tu .env.local): agrega la variable CRON_SECRET con un
--     valor largo al azar. Nunca guardes el secreto real en este archivo.
--     Redeploy para que tome la variable.
--  3) Reemplaza TU-APP y TU-SECRETO abajo y ejecuta este archivo en el
--     SQL Editor (una sola vez). No subas el secreto real al repositorio.
--  4) Las horas (Lima) y correos se configuran en la web:
--     Administración > Cortes. pg_cron solo despierta al endpoint cada
--     15 min; el endpoint decide si toca enviar según tu configuración.
-- Útil: ver jobs -> SELECT * FROM cron.job;
--       borrar    -> SELECT cron.unschedule('cortes-cotizador');
-- NOTA: pg_cron corre en UTC. Lima es UTC-5; el endpoint ya convierte,
-- así que configura tus horas de Lima con normalidad en la web.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'cortes-cotizador',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://cotizador-calidda.onrender.com/api/cron/cortes?tipo=todos',
    headers := '{"Authorization": "Bearer TU-SECRETO"}'::jsonb
  );
  $$
);
