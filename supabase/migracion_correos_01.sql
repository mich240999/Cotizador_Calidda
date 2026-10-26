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

Adjuntamos la cotización {codigo} elaborada por Ambientes Cáliddos.

RESUMEN DE LA COTIZACIÓN
• Total cotizado: S/ {total}
• Adelanto: S/ {adelanto}
• Valor a financiar: S/ {capital}
• TEA: {tea}%
• Plazo: {plazo} cuotas
• Cuota mensual referencial: S/ {cuota}

{detalles}

{observaciones}

La cuota mensual incluye el IGV correspondiente al interés. La propuesta está sujeta a evaluación y disponibilidad de stock.

Quedamos atentos a cualquier consulta.

Atentamente,
Ambientes Cáliddos

Este correo fue generado automáticamente.$msg$
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
