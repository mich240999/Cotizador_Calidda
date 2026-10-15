-- =====================================================================
-- Migración 03 — Flujo de ventas por etapas (CONSOLIDADA).
-- Ejecutar en el SQL Editor de Supabase UNA SOLA VEZ al final del proyecto.
-- Secciones por etapa; todo con IF NOT EXISTS (seguro re-ejecutar).
-- =====================================================================

-- ---------------------------------------------------------------- ETAPA 1
-- Clientes formato Airtable: cuenta contrato + campos del Leads-Base.
-- Columnas usadas del XLSX: DNI Cliente, Nombres y Apellidos, Teléfono1,
-- Teléfono2, Correo electrónico, BP Cliente, Cuenta Contrato, Linea de
-- Credito, NSE, Dirección, Referencia, Distrito, Ambiente.
-- (El archivo se sube tal cual con sus 58 columnas; el resto se ignora.)

ALTER TABLE public.mae_clientes
  ADD COLUMN IF NOT EXISTS cuenta_contrato TEXT,
  ADD COLUMN IF NOT EXISTS telefono2 TEXT,
  ADD COLUMN IF NOT EXISTS bp_cliente TEXT,
  ADD COLUMN IF NOT EXISTS linea_credito NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS nse TEXT,
  ADD COLUMN IF NOT EXISTS direccion TEXT,
  ADD COLUMN IF NOT EXISTS referencia TEXT,
  ADD COLUMN IF NOT EXISTS distrito TEXT,
  ADD COLUMN IF NOT EXISTS ambiente TEXT;

CREATE INDEX IF NOT EXISTS ix_mae_clientes_cta
  ON public.mae_clientes(cuenta_contrato);

-- ---------------------------------------------------------------- ETAPA 2
-- Cuenta contrato como dato identificativo de la cotización.
-- Se copia al crear (snapshot); si viene vacía se jala del maestro.

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS cuenta_contrato TEXT;

CREATE INDEX IF NOT EXISTS ix_cotizaciones_cta
  ON public.cotizaciones(cuenta_contrato);

-- ---------------------------------------------------------------- ETAPA 3
-- Solicitudes de venta nacidas de una cotización.
-- cotizacion_id: cotización origen (PDF se regenera, no se almacena).
-- asesor_nombre: snapshot del asesor de la cotización.
-- anticipo: cuota inicial que venía en la cotización.
-- monto_financiado: total − anticipo. nro_cuotas: plazo elegido.

ALTER TABLE public.vta_solicitudes_venta
  ADD COLUMN IF NOT EXISTS cotizacion_id UUID REFERENCES public.cotizaciones(id),
  ADD COLUMN IF NOT EXISTS asesor_nombre TEXT,
  ADD COLUMN IF NOT EXISTS anticipo NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_financiado NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nro_cuotas INT,
  ADD COLUMN IF NOT EXISTS ambiente TEXT;

CREATE INDEX IF NOT EXISTS ix_vta_sol_cot
  ON public.vta_solicitudes_venta(cotizacion_id);

-- ---------------------------------------------------------------- ETAPA 4
-- PV de Stephany: pedido único a cabecera, estado "generada".
-- numero_pedido ya existe (UNIQUE, un PV por solicitud).
-- pv_abono guarda el PV del anticipo (solo si hubo abono inicial).

ALTER TABLE public.vta_solicitudes_venta DROP CONSTRAINT IF EXISTS vta_solicitudes_venta_estado_check;
ALTER TABLE public.vta_solicitudes_venta
  ADD CONSTRAINT vta_solicitudes_venta_estado_check CHECK (estado IN (
    'borrador','pendiente_aprobacion','observado','aprobada','generada',
    'en_instalacion','instalada','validada_proveedor','cerrada','liquidada'));

ALTER TABLE public.vta_solicitudes_venta
  ADD COLUMN IF NOT EXISTS codigo_llamada TEXT,
  ADD COLUMN IF NOT EXISTS pv_abono TEXT;

-- ---------------------------------------------------------------- ETAPA 5
-- Cortes programados: horas y correos configurables desde Administración.
-- pg_cron llama cada 15 min al endpoint; el endpoint envía solo en las
-- horas configuradas (hora de Lima) y una vez por hora (ultimo_envio).

CREATE TABLE IF NOT EXISTS public.cfg_cortes (
  clave TEXT PRIMARY KEY CHECK (clave IN ('ventas_pv','instalaciones_liq')),
  horas TEXT NOT NULL DEFAULT '',
  para TEXT NOT NULL DEFAULT '',
  copia TEXT NOT NULL DEFAULT '',
  asunto TEXT NOT NULL DEFAULT '',
  mensaje TEXT NOT NULL DEFAULT '',
  activo BOOLEAN NOT NULL DEFAULT true,
  ultimo_envio TEXT
);

INSERT INTO public.cfg_cortes (clave, horas, para, copia, asunto, mensaje, activo)
VALUES
  ('ventas_pv', '12:00,17:00', '', '',
   'Solicitudes pendientes de generar PV ({cantidad}) — corte {hora}',
   'A las {hora} del {fecha} hay {cantidad} solicitudes pendientes de generar PV:\n{detalle}',
   true),
  ('instalaciones_liq', '11:00,16:00', '', '',
   'Pedidos pendientes de liquidar ({cantidad}) — corte {hora}',
   'A las {hora} del {fecha} hay {cantidad} pedidos pendientes de liquidar:\n{detalle}',
   true)
ON CONFLICT (clave) DO NOTHING;
