-- ============================================================================
-- Migracion correos 01 - plantilla editable del correo de cotizacion
--
-- 1. cfg_correos: plantillas de correo editables desde Administracion.
-- 2. Fila inicial para el PDF de cotizacion al cliente.
--
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run.
-- Idempotente y re-ejecutable.
-- ============================================================================

begin;

create table if not exists public.cfg_correos (
  clave       text primary key,
  asunto      text not null default '',
  mensaje     text not null default '',
  updated_at  timestamptz not null default now()
);

insert into public.cfg_correos (clave, asunto, mensaje)
values (
  'cotizacion_pdf',
  'Cotización {codigo} Ambientes Cáliddos',
  $msg$Estimado(a) {cliente}:

Adjuntamos su cotización {codigo} de Ambientes Cáliddos por un total de S/ {total}.

Financiamiento: adelanto S/ {adelanto}, valor a financiar S/ {capital}, TEA {tea}%, {plazo} cuotas de S/ {cuota} (cuota con IGV del interés incluido).

{detalles}

{observaciones}

Documento generado por Ambientes Cáliddos.$msg$
)
on conflict (clave) do nothing;

comment on table public.cfg_correos is
  'Plantillas editables de correos transaccionales (asunto y mensaje).';

alter table public.cfg_correos enable row level security;
revoke all on public.cfg_correos from anon, authenticated;

commit;

-- ============================================================================
-- Verificacion:
--   select clave, asunto, updated_at from public.cfg_correos;
-- ============================================================================
