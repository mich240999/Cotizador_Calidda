-- ============================================================================
-- Migracion correos 02 - cuerpos profesionales para los avisos automaticos
--
-- Actualiza únicamente las plantillas que todavía conservan el texto original.
-- Si el usuario ya personalizó una plantilla, no se modifica.
--
-- Ejecutar después de migracion_correos_01.sql.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- cotizacion PDF
update public.cfg_correos
set
  mensaje = $msg$Estimado(a) {cliente}:

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

Este correo fue generado automáticamente.$msg$,
  updated_at = now()
where clave = 'cotizacion_pdf'
  and mensaje like '%Adjuntamos su cotización {codigo} de Ambientes Cáliddos por un total de S/%'
  and mensaje like '%Documento generado por Ambientes Cáliddos.%';

-- ---------------------------------------------------------------- corte ventas PV
update public.cfg_cortes
set mensaje = $msg$Estimado equipo:

Se comparte el resumen del corte de solicitudes pendientes de generar pedido de venta (PV).

• Fecha de corte: {fecha}
• Hora de corte: {hora}
• Total de solicitudes pendientes: {cantidad}

Detalle de solicitudes:
{detalle}

Acción recomendada:
Revisar las solicitudes listadas y generar los pedidos de venta correspondientes desde el módulo de Ventas.

Este mensaje fue generado automáticamente por el sistema Ambientes Cáliddos.$msg$
where clave = 'ventas_pv'
  and mensaje like '%A las {hora} del {fecha} hay {cantidad} solicitudes pendientes de generar PV%';

-- ---------------------------------------------------------------- corte instalaciones
update public.cfg_cortes
set mensaje = $msg$Estimado equipo:

Se comparte el resumen del corte de pedidos pendientes de liquidar.

• Fecha de corte: {fecha}
• Hora de corte: {hora}
• Total de pedidos pendientes: {cantidad}

Detalle de pedidos:
{detalle}

Acción recomendada:
Revisar las instalaciones registradas y completar la liquidación correspondiente.

Este mensaje fue generado automáticamente por el sistema Ambientes Cáliddos.$msg$
where clave = 'instalaciones_liq'
  and mensaje like '%A las {hora} del {fecha} hay {cantidad} pedidos pendientes de liquidar%';

commit;

-- ============================================================================
-- Verificación:
--   select clave, mensaje from public.cfg_cortes order by clave;
--   select clave, mensaje from public.cfg_correos order by clave;
-- ============================================================================
