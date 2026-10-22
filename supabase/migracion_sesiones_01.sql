-- ============================================================================
-- Migracion sesiones 01 - tiempos de sesion y control de equipos conectados
--
-- 1. cfg_sesiones: configuracion global editable desde Administracion > Sesiones.
-- 2. sesiones_app: columnas para vencimiento absoluto, IP y motivo de cierre.
--
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run.
-- Idempotente y re-ejecutable.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Configuracion global de sesiones (una sola fila)
-- ----------------------------------------------------------------------------
create table if not exists public.cfg_sesiones (
  id               boolean primary key default true check (id),
  duracion_min     integer not null default 480  check (duracion_min between 5 and 10080),
  inactividad_min  integer not null default 30   check (inactividad_min between 1 and 1440),
  recordar_dias    integer not null default 180  check (recordar_dias between 1 and 365),
  una_sesion       boolean not null default true,
  updated_at       timestamptz not null default now()
);

insert into public.cfg_sesiones (id) values (true) on conflict (id) do nothing;

comment on table public.cfg_sesiones is
  'Configuracion de sesiones: duracion normal, inactividad, Recuerdame y una sola sesion.';

alter table public.cfg_sesiones enable row level security;
revoke all on public.cfg_sesiones from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) sesiones_app: datos para validar y mostrar cada equipo conectado
-- ----------------------------------------------------------------------------
alter table public.sesiones_app
  add column if not exists ip text,
  add column if not exists expira_en timestamptz,
  add column if not exists recordarme boolean not null default false,
  add column if not exists cerrada_motivo text,
  add column if not exists cerrada_at timestamptz;

create index if not exists ix_ses_activa_user
  on public.sesiones_app(user_id) where activa = true;

create index if not exists ix_ses_expira
  on public.sesiones_app(expira_en);

commit;

-- ============================================================================
-- Verificacion:
--   select * from public.cfg_sesiones;
--   select column_name from information_schema.columns
--    where table_name = 'sesiones_app' order by ordinal_position;
-- ============================================================================
