-- ============================================================================
-- AMCA · Materiales genéricos de venta (todos los proveedores / todos los asesores)
-- Cubre los cinco ambientes del Excel Libro1.xlsx: COCINA, SALA, DORMITORIO,
-- DISEÑO y REMODELACION. Sirven de respaldo cuando un proveedor o asesor no
-- tiene una asignación específica, y como catálogo de servicios comunes.
-- Ejecutar después de migracion_05_proveedores_directos_usuario_multi.sql.
-- Reejecutable: actualiza la misma combinación ambiente / nombre genérico.
-- ============================================================================
BEGIN;

-- 1) Normaliza la etiqueta global del asesor en las filas ya cargadas.
UPDATE public.mae_materiales
   SET asesor_nombre = 'Todos los asesores'
 WHERE espacio = 'VENTAS'
   AND lower(coalesce(asesor_nombre, '')) LIKE 'todos%'
   AND lower(coalesce(proveedor_nombre, '')) LIKE 'todos%';

-- 2) Genéricos por ambiente. Sin código SAP: el código real se toma del
-- material específico del proveedor al generar el pedido.
DO $$
DECLARE r RECORD; v_id TEXT; v_next INT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('COCINA',      'MUEBLE DE COCINA COTIZADO'),
    ('SALA',        'MUEBLE DE SALA COTIZADO'),
    ('DORMITORIO',  'MUEBLE DE DORMITORIO COTIZADO'),
    ('DISEÑO',      'SERVICIO DE DISEÑO DE MUEBLES'),
    ('REMODELACION','REMODELACIÓN COTIZADO PINTURA'),
    ('REMODELACION','REMODELACIÓN COTIZADO VIDRIERIA'),
    ('REMODELACION','REMODELACIÓN COTIZADO ELECTRICIDAD E ILUMINACIÓN'),
    ('REMODELACION','REMODELACIÓN COTIZADO GASFITERIA'),
    ('REMODELACION','REMODELACIÓN COTIZADO ALBAÑILERÍA'),
    ('REMODELACION','REMODELACIÓN COTIZADO PISOS Y ENCHAPES'),
    ('REMODELACION','REMODELACIÓN COTIZADO CARPINTERIA Y PUERTAS'),
    ('REMODELACION','REMODELACIÓN COTIZADO DRYWALL'),
    ('REMODELACION','REMODELACIÓN COTIZADO OBRA CIVIL'),
    ('REMODELACION','REMODELACIÓN COTIZADO VIDRIOS Y ALUMINIO'),
    ('REMODELACION','REMODELACIÓN COTIZADO TECHOS E IMPERMEABILIZACIÓN')
  ) AS x(ambiente, nombre)
  LOOP
    SELECT id INTO v_id
      FROM public.mae_materiales
     WHERE espacio = 'VENTAS'
       AND upper(coalesce(espacio_remodelar, '')) = upper(r.ambiente)
       AND nombre = r.nombre
       AND lower(coalesce(proveedor_nombre, '')) LIKE 'todos%'
       AND lower(coalesce(asesor_nombre, '')) LIKE 'todos%'
     ORDER BY id LIMIT 1;

    IF v_id IS NULL THEN
      SELECT COALESCE(MAX((regexp_match(id, '^MAT-([0-9]{5})$'))[1]::INT), 0) + 1
        INTO v_next FROM public.mae_materiales;
      v_id := 'MAT-' || lpad(v_next::TEXT, 5, '0');
      INSERT INTO public.mae_materiales (
        id,codigo_sap,nombre,descripcion,unidad,tipo_medida,decimales,estado,
        espacio,espacio_remodelar,id_proveedor,proveedor_nombre,id_integrador,
        integrador_nombre,id_asesor,asesor_nombre,id_oficina,id_grupo,oficina_ref,grupo_ref
      ) VALUES (
        v_id,NULL,r.nombre,'Genérico · disponible para todos los proveedores','UND','LONGITUD',2,'ACTIVO',
        'VENTAS',r.ambiente,NULL,'Todos los proveedores',NULL,
        NULL,NULL,'Todos los asesores',NULL,NULL,NULL,NULL
      );
    ELSE
      UPDATE public.mae_materiales
         SET nombre = r.nombre,
             descripcion = 'Genérico · disponible para todos los proveedores',
             estado = 'ACTIVO',
             id_proveedor = NULL,
             proveedor_nombre = 'Todos los proveedores',
             id_integrador = NULL,
             integrador_nombre = NULL,
             id_asesor = NULL,
             asesor_nombre = 'Todos los asesores',
             id_oficina = NULL,
             id_grupo = NULL,
             oficina_ref = NULL,
             grupo_ref = NULL
       WHERE id = v_id;
    END IF;

    v_id := NULL;
  END LOOP;
END $$;

UPDATE public.mae_materiales SET estado='INACTIVO'
 WHERE espacio='VENTAS' AND upper(nombre) LIKE 'VISITA TÉCNICA - AMCA 2.0%';

COMMIT;
-- Filas genéricas esperadas: 15 (3 muebles + 1 diseño + 11 remodelación).
