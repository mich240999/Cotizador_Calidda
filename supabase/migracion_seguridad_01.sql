-- ============================================================================
-- SGT360 · Migración seguridad 01
--
-- Cierra dos hallazgos de la auditoría:
--   1. Cualquier usuario autenticado (o registrado con la anon key, ya que el
--      signup está abierto) podía leer TODA la base SGT vía PostgREST porque
--      schema_sgt360.sql creó policies "sgt360_read_* USING (true)".
--   2. public.profiles permitía UPDATE propio sin restringir columnas, así que
--      un usuario podía cambiarse rol_id y volverse admin.
--
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run.
-- Idempotente y re-ejecutable.
--
-- No rompe la app: todas las consultas de negocio pasan por /api/operacion con
-- service_role, que conserva los privilegios. getSession() sigue leyendo su
-- propia fila de public.profiles y public.roles (SELECT intacto).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) public.profiles: sin auto-edición de rol/oficina/estado desde el cliente.
-- ----------------------------------------------------------------------------
drop policy if exists profiles_update on public.profiles;
revoke insert, update, delete on public.profiles from authenticated, anon;

-- Defensa en profundidad: aunque en el futuro se recree la policy, el trigger
-- bloquea cambios sensibles hechos con un JWT "authenticated".
create or replace function public.fn_profiles_sin_escalada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and (
       new.id          is distinct from old.id
    or new.email       is distinct from old.email
    or new.rol_id      is distinct from old.rol_id
    or new.oficina_id  is distinct from old.oficina_id
    or new.activo      is distinct from old.activo
  ) then
    raise exception 'Cambio no permitido en profiles' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_sin_escalada on public.profiles;
create trigger trg_profiles_sin_escalada
  before update on public.profiles
  for each row execute function public.fn_profiles_sin_escalada();

-- ----------------------------------------------------------------------------
-- 2) Tablas SGT: quitar lectura/escritura directa a authenticated y anon.
--    Se eliminan las policies de lectura abierta y se revocan los privilegios.
--    Las policies "sgt360_admin_*" se conservan (inocuas sin privilegios).
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'mae_proveedores','mae_oficinas_ventas','rel_proveedor_oficinas',
    'mae_grupos_vendedores','seg_roles','seg_usuarios','seg_permisos_matriz',
    'seg_recursos_visuales','mae_clientes','mae_materiales','pre_tarifario',
    'ven_cotizaciones','ven_cotizacion_items','ven_financiamiento_sim'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'sgt360_read_' || t, t);
    execute format('revoke all on public.%I from authenticated, anon', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Storage: el navegador ya no sube directo a los buckets.
--    /api/uploads usa service_role y no pasa por RLS. La lectura pública se
--    mantiene porque los links se usan en PDF y correos.
-- ----------------------------------------------------------------------------
drop policy if exists "subida autenticados adjuntos" on storage.objects;

commit;

-- ============================================================================
-- Verificación posterior (con la anon key / un usuario normal):
--   GET /rest/v1/seg_usuarios?select=correo     -> 401/403 o 0 filas
--   GET /rest/v1/mae_clientes?select=nombres    -> 401/403 o 0 filas
--   PATCH /rest/v1/profiles?id=eq.<uid> {"rol_id":1} -> 401/403
-- La app (login, cotizaciones, ventas, instalaciones, admin) debe seguir igual.
--
-- Rollback: re-ejecutar supabase/schema.sql y supabase/schema_sgt360.sql
--   (recrean las policies, pero NO restauran los privilegios revocados).
-- ============================================================================
