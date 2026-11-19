-- ============================================================================
-- AMCA · Proveedores del Excel Libro1.xlsx (hoja MATERIALES VF)
-- Solo nombre comercial: RUC, contacto e integradora se completan en
-- /admin/proveedores cuando el área los envíe.
-- Ejecutar después de migracion_amca_01.sql (permite RUC nulo) y antes de
-- carga_materiales_venta_libro1.sql para dejar id_proveedor vinculado.
-- Reejecutable: identifica al proveedor por interlocutor.
-- ============================================================================
BEGIN;

DO $$
DECLARE r RECORD; v_id TEXT; v_next INT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('AGL'),
    ('DEIDAMIA'),
    ('DEYBIS CRUZ'),
    ('JCHAN'),
    ('JECAR'),
    ('KOJAC'),
    ('LANDCORP INVERSIONES E.I.R.L.'),
    ('MADERAS AMERICA'),
    ('MHAC'),
    ('PLACA DECOR'),
    ('RESCATE 24')
  ) AS x(nombre)
  LOOP
    SELECT id INTO v_id FROM public.mae_proveedores WHERE upper(interlocutor) = upper(r.nombre) LIMIT 1;

    IF v_id IS NULL THEN
      SELECT COALESCE(MAX((regexp_match(id, '^PRV([0-9]{4})$'))[1]::INT), 0) + 1
        INTO v_next FROM public.mae_proveedores;
      v_id := 'PRV' || lpad(v_next::TEXT, 4, '0');
      INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
      VALUES (v_id, r.nombre, NULL, r.nombre, r.nombre, 'ACTIVO');
    ELSE
      UPDATE public.mae_proveedores
         SET razon_social = r.nombre,
             nombre_comercial = r.nombre,
             estado = 'ACTIVO'
       WHERE id = v_id;
    END IF;

    -- Vincula las asignaciones de material cargadas por nombre de proveedor.
    UPDATE public.mae_materiales
       SET id_proveedor = v_id
     WHERE espacio = 'VENTAS'
       AND id_proveedor IS NULL
       AND upper(coalesce(proveedor_nombre, '')) = upper(r.nombre);

    v_id := NULL;
  END LOOP;
END $$;

COMMIT;
-- Proveedores esperados: 11.
