-- Carga AMCA · proveedores/oficinas/grupos/vínculos (11 proveedores).
-- Generado desde "Materiales_ AMCA 2026.xlsx" hoja PROVEEDORES. Idempotente (DO + upserts).
-- Grupos: codigo_sap = código de la hoja, nombre = 'Grupo <cod>'.
DO $$
DECLARE v_ofv text; v_n int; v_id text;
BEGIN
  SELECT id INTO v_ofv FROM public.mae_oficinas_ventas WHERE id = 'OFV0001';
  IF v_ofv IS NULL THEN
    INSERT INTO public.mae_oficinas_ventas (id, codigo_sap, nombre, descripcion, estado)
    VALUES ('OFV0001','AMCA','Ambientes Cálidos','Venta de Muebles de Melamina','ACTIVO');
    v_ofv := 'OFV0001';
  END IF;
  SELECT COALESCE(max(substring(id from 4)::int), 0) INTO v_n FROM public.mae_proveedores WHERE id ~ '^PRV[0-9]{4}$';
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5003830921') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5003830921', NULL, 'LANDCORP INVERSIONES E.I.R.L.', 'LANDCORP INVERSIONES E.I.R.L.', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' WHERE interlocutor = '5003830921';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5003660285') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5003660285', NULL, 'RESCATE 24', 'RESCATE 24', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'RESCATE 24' WHERE interlocutor = '5003660285';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5003805068') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5003805068', NULL, 'PLACA DECOR', 'PLACA DECOR', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'PLACA DECOR' WHERE interlocutor = '5003805068';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5003388055') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5003388055', NULL, 'KOJAC', 'KOJAC', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'KOJAC' WHERE interlocutor = '5003388055';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5004008016') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5004008016', NULL, 'MADERAS AMERICA', 'MADERAS AMERICA', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'MADERAS AMERICA' WHERE interlocutor = '5004008016';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5003968987') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5003968987', NULL, 'JCHAN', 'JCHAN', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'JCHAN' WHERE interlocutor = '5003968987';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5003968994') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5003968994', NULL, 'DEIDAMIA', 'DEIDAMIA', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'DEIDAMIA' WHERE interlocutor = '5003968994';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5003966796') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5003966796', NULL, 'DEYBIS CRUZ BLAS', 'DEYBIS CRUZ BLAS', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'DEYBIS CRUZ BLAS' WHERE interlocutor = '5003966796';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5003966794') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5003966794', NULL, 'MHAC CONSTRUCTION S.A.C (LGANCIA)', 'MHAC CONSTRUCTION S.A.C (LGANCIA)', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'MHAC CONSTRUCTION S.A.C (LGANCIA)' WHERE interlocutor = '5003966794';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5003968991') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5003968991', NULL, 'JECAR', 'JECAR', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'JECAR' WHERE interlocutor = '5003968991';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_proveedores WHERE interlocutor = '5003966795') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, estado)
    VALUES ('PRV' || lpad(v_n::text, 4, '0'), '5003966795', NULL, 'AGL', 'AGL', 'ACTIVO');
  ELSE
    UPDATE public.mae_proveedores SET nombre_comercial = 'AGL' WHERE interlocutor = '5003966795';
  END IF;
  SELECT COALESCE(max(substring(id from 4)::int), 0) INTO v_n FROM public.mae_grupos_vendedores WHERE id ~ '^GVE[0-9]{4}$';
  IF NOT EXISTS (SELECT 1 FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_grupos_vendedores (id, codigo_sap, nombre, id_proveedor, id_oficina, estado)
    VALUES ('GVE' || lpad(v_n::text, 4, '0'), 'AM8', 'Grupo AM8', NULL, v_ofv, 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_grupos_vendedores (id, codigo_sap, nombre, id_proveedor, id_oficina, estado)
    VALUES ('GVE' || lpad(v_n::text, 4, '0'), 'AM0', 'Grupo AM0', NULL, v_ofv, 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC1') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_grupos_vendedores (id, codigo_sap, nombre, id_proveedor, id_oficina, estado)
    VALUES ('GVE' || lpad(v_n::text, 4, '0'), 'AC1', 'Grupo AC1', NULL, v_ofv, 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC5') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_grupos_vendedores (id, codigo_sap, nombre, id_proveedor, id_oficina, estado)
    VALUES ('GVE' || lpad(v_n::text, 4, '0'), 'AC5', 'Grupo AC5', NULL, v_ofv, 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC8') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_grupos_vendedores (id, codigo_sap, nombre, id_proveedor, id_oficina, estado)
    VALUES ('GVE' || lpad(v_n::text, 4, '0'), 'AC8', 'Grupo AC8', NULL, v_ofv, 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_grupos_vendedores (id, codigo_sap, nombre, id_proveedor, id_oficina, estado)
    VALUES ('GVE' || lpad(v_n::text, 4, '0'), 'AC7', 'Grupo AC7', NULL, v_ofv, 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC9') THEN
    v_n := v_n + 1;
    INSERT INTO public.mae_grupos_vendedores (id, codigo_sap, nombre, id_proveedor, id_oficina, estado)
    VALUES ('GVE' || lpad(v_n::text, 4, '0'), 'AC9', 'Grupo AC9', NULL, v_ofv, 'ACTIVO');
  END IF;
  SELECT COALESCE(max(substring(id from 4)::int), 0) INTO v_n FROM public.rel_proveedor_oficinas WHERE id ~ '^POF[0-9]{4}$';
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5003830921' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5003830921';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5003660285' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5003660285';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5003805068' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5003805068';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5003388055' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5003388055';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5004008016' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5004008016';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5003968987' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5003968987';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5003968994' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5003968994';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5003966796' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5003966796';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5003966794' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5003966794';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5003968991' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5003968991';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rel_proveedor_oficinas r JOIN public.mae_proveedores p ON p.id = r.id_proveedor WHERE p.interlocutor = '5003966795' AND r.id_oficina = v_ofv) THEN
    v_n := v_n + 1;
    INSERT INTO public.rel_proveedor_oficinas (id, id_proveedor, id_oficina, estado)
    SELECT 'POF' || lpad(v_n::text, 4, '0'), id, v_ofv, 'ACTIVO' FROM public.mae_proveedores WHERE interlocutor = '5003966795';
  END IF;
END $$;
