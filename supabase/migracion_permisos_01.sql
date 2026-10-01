-- ============================================================================
-- SGT360 · Migración permisos 01 — nombres de función por recurso
-- Los recursos nacieron como códigos MODULO-NN sin nombre legible.
-- Esta migración agrega public.seg_permisos_matriz.nombre y fija grupo real.
-- NO toca permitido: los predeterminados por rol se conservan
-- (ADMIN 106, SUPERVISOR 18, ASESOR 12, PROVEEDOR 3).
-- Para editar defaults a nivel BD: UPDATE seg_permisos_matriz SET permitido=...
--   WHERE rol_codigo='X' AND recurso='Y'. A nivel sistema: Administración > Permisos.
-- Ejecutar DESPUÉS de supabase/schema_sgt360.sql. Idempotente.
-- ============================================================================

ALTER TABLE public.seg_permisos_matriz
  ADD COLUMN IF NOT EXISTS nombre TEXT;

CREATE TEMP TABLE IF NOT EXISTS tmp_perm_cat(recurso TEXT PRIMARY KEY, grupo TEXT NOT NULL, nombre TEXT NOT NULL);
DELETE FROM tmp_perm_cat;
INSERT INTO tmp_perm_cat(recurso, grupo, nombre) VALUES
-- ADMINISTRACION (44)
('ADMINISTRACION-01','Acceso general','Entrar al módulo'),
('ADMINISTRACION-02','Acceso general','Ver consola administrativa'),
('ADMINISTRACION-03','Usuarios','Ver usuarios'),
('ADMINISTRACION-04','Usuarios','Crear usuario'),
('ADMINISTRACION-05','Usuarios','Editar usuario'),
('ADMINISTRACION-06','Usuarios','Activar usuario'),
('ADMINISTRACION-07','Usuarios','Desactivar usuario'),
('ADMINISTRACION-08','Usuarios','Carga masiva de usuarios'),
('ADMINISTRACION-09','Usuarios','Exportar usuarios'),
('ADMINISTRACION-10','Proveedores','Ver proveedores'),
('ADMINISTRACION-11','Proveedores','Crear proveedor'),
('ADMINISTRACION-12','Proveedores','Editar proveedor'),
('ADMINISTRACION-13','Proveedores','Activar proveedor'),
('ADMINISTRACION-14','Proveedores','Desactivar proveedor'),
('ADMINISTRACION-15','Proveedores','Carga masiva de proveedores'),
('ADMINISTRACION-16','Oficinas','Ver oficinas de ventas'),
('ADMINISTRACION-17','Oficinas','Crear oficina'),
('ADMINISTRACION-18','Oficinas','Editar oficina'),
('ADMINISTRACION-19','Oficinas','Activar oficina'),
('ADMINISTRACION-20','Oficinas','Desactivar oficina'),
('ADMINISTRACION-21','Vinculaciones','Ver vinculaciones'),
('ADMINISTRACION-22','Vinculaciones','Crear vinculación'),
('ADMINISTRACION-23','Vinculaciones','Desactivar vinculación'),
('ADMINISTRACION-24','Vinculaciones','Editar vinculación'),
('ADMINISTRACION-25','Grupos','Ver grupos de vendedores'),
('ADMINISTRACION-26','Grupos','Crear grupo'),
('ADMINISTRACION-27','Grupos','Editar grupo'),
('ADMINISTRACION-28','Grupos','Desactivar grupo'),
('ADMINISTRACION-29','Asignaciones','Ver asignaciones'),
('ADMINISTRACION-30','Asignaciones','Crear asignación'),
('ADMINISTRACION-31','Asignaciones','Editar asignación'),
('ADMINISTRACION-32','Asignaciones','Desactivar asignación'),
('ADMINISTRACION-33','Roles','Ver roles'),
('ADMINISTRACION-34','Roles','Crear rol'),
('ADMINISTRACION-35','Roles','Editar rol'),
('ADMINISTRACION-36','Roles','Desactivar rol'),
('ADMINISTRACION-37','Permisos','Ver matriz de permisos'),
('ADMINISTRACION-38','Permisos','Editar matriz de permisos'),
('ADMINISTRACION-39','Permisos','Guardar matriz de permisos'),
('ADMINISTRACION-40','Recursos visuales','Ver recursos visuales'),
('ADMINISTRACION-41','Recursos visuales','Subir logo del encabezado'),
('ADMINISTRACION-42','Recursos visuales','Subir imagen de acceso'),
('ADMINISTRACION-43','Recursos visuales','Subir imagen del PDF'),
('ADMINISTRACION-44','Recursos visuales','Subir favicon'),
-- CLIENTES (21)
('CLIENTES-01','Consulta','Ver lista de clientes'),
('CLIENTES-02','Consulta','Buscar clientes'),
('CLIENTES-03','Consulta','Filtrar clientes'),
('CLIENTES-04','Consulta','Visualizar ficha de cliente'),
('CLIENTES-05','Consulta','Exportar clientes'),
('CLIENTES-06','Registro','Crear cliente'),
('CLIENTES-07','Registro','Editar cliente'),
('CLIENTES-08','Registro','Activar cliente'),
('CLIENTES-09','Registro','Desactivar cliente'),
('CLIENTES-10','Registro','Vincular código SAP'),
('CLIENTES-11','Registro','Ver historial del cliente'),
('CLIENTES-12','Carga masiva','Abrir carga masiva'),
('CLIENTES-13','Carga masiva','Descargar plantilla'),
('CLIENTES-14','Carga masiva','Validar archivo'),
('CLIENTES-15','Carga masiva','Crear clientes por carga'),
('CLIENTES-16','Revisión','Ver revisión SAP'),
('CLIENTES-17','Revisión','Validar revisión'),
('CLIENTES-18','Revisión','Observar revisión'),
('CLIENTES-19','Revisión','Ver código SAP'),
('CLIENTES-20','Revisión','Editar código SAP'),
('CLIENTES-21','Revisión','Ver auditoría del cliente'),
-- COTIZACIONES (22)
('COTIZACIONES-01','Consulta','Ver lista de cotizaciones'),
('COTIZACIONES-02','Consulta','Buscar cotizaciones'),
('COTIZACIONES-03','Consulta','Filtrar cotizaciones'),
('COTIZACIONES-04','Registro','Nueva cotización'),
('COTIZACIONES-05','Registro','Editar borrador'),
('COTIZACIONES-06','Registro','Agregar materiales'),
('COTIZACIONES-07','Consulta','Ver detalle'),
('COTIZACIONES-08','Registro','Cambiar estado'),
('COTIZACIONES-09','Documento','Generar PDF'),
('COTIZACIONES-10','Documento','Regenerar PDF'),
('COTIZACIONES-11','Documento','Enviar por correo'),
('COTIZACIONES-12','Financiamiento','Ver financiamiento'),
('COTIZACIONES-13','Financiamiento','Simular cuotas'),
('COTIZACIONES-14','Financiamiento','Editar financiamiento'),
('COTIZACIONES-15','Registro','Duplicar cotización'),
('COTIZACIONES-16','Registro','Eliminar borrador'),
('COTIZACIONES-17','Consulta','Ver historial'),
('COTIZACIONES-18','Consulta','Exportar lista'),
('COTIZACIONES-19','Seguimiento','Ver observaciones'),
('COTIZACIONES-20','Seguimiento','Editar observaciones'),
('COTIZACIONES-21','Documento','Descargar PDF'),
('COTIZACIONES-22','Seguimiento','Ver cliente'),
-- DASHBOARD (2)
('DASHBOARD-01','General','Ver indicadores'),
('DASHBOARD-02','General','Ver últimos movimientos'),
-- GESTION_COMERCIAL (8)
('GESTION_COMERCIAL-01','Ventas','Ver solicitudes de venta'),
('GESTION_COMERCIAL-02','Ventas','Nueva solicitud de venta'),
('GESTION_COMERCIAL-03','Ventas','Ver detalle de venta'),
('GESTION_COMERCIAL-04','Ventas','Aprobar solicitud'),
('GESTION_COMERCIAL-05','Ventas','Observar solicitud'),
('GESTION_COMERCIAL-06','Ventas','Registrar y validar abonos'),
('GESTION_COMERCIAL-07','Ventas','Registrar y validar instalación'),
('GESTION_COMERCIAL-08','Ventas','Cerrar venta y exportar'),
-- MATERIALES (9)
('MATERIALES-01','Catálogo','Ver materiales'),
('MATERIALES-02','Catálogo','Buscar materiales'),
('MATERIALES-03','Catálogo','Crear material'),
('MATERIALES-04','Catálogo','Editar material'),
('MATERIALES-05','Catálogo','Activar material'),
('MATERIALES-06','Catálogo','Desactivar material'),
('MATERIALES-07','Catálogo','Carga masiva de precios'),
('MATERIALES-08','Catálogo','Descargar plantillas'),
('MATERIALES-09','Catálogo','Ver historial de precios');

UPDATE public.seg_permisos_matriz m
   SET grupo = c.grupo, nombre = c.nombre
  FROM tmp_perm_cat c
 WHERE m.recurso = c.recurso;
