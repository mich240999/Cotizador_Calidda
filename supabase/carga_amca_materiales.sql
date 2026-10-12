-- Carga AMCA · materiales (86 productos de la hoja MATERIALES).
-- ESPACIO: COTIZACION -> módulo Cotizaciones, VENTAS -> Solicitudes de venta.
-- MATERIAL (SAP) -> codigo_sap; sin código -> NULL. PRECIO -> tarifa inicial VIGENTE PEN.
-- Idempotente (por codigo_sap, o por nombre si no tiene código).
DO $$
DECLARE v_n int; v_id text;
BEGIN
  SELECT COALESCE(max(substring(id from 5)::int), 10000) INTO v_n FROM public.mae_materiales WHERE id ~ '^MAT-[0-9]{5}$';
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'COCINA - Muebles Altos (Hasta 60cm Alto) - Puertas Batientes') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'COCINA - Muebles Altos (Hasta 60cm Alto) - Puertas Batientes', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'COCINA',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 550, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 550 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'COCINA - Muebles Altos (Hasta 60cm Alto) Puertas Abatibles') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'COCINA - Muebles Altos (Hasta 60cm Alto) Puertas Abatibles', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'COCINA',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 650, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 650 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'COCINA - Muebles Altos (Hasta 100cm Alto) - Puertas Batientes') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'COCINA - Muebles Altos (Hasta 100cm Alto) - Puertas Batientes', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'COCINA',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 700, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 700 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'COCINA - Muebles Bajos - Solo Incluye: 1 cajonera y 1 condimentero') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'COCINA - Muebles Bajos - Solo Incluye: 1 cajonera y 1 condimentero', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'COCINA',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 750, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 750 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'COCINA - Mezón de Granito') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'COCINA - Mezón de Granito', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'COCINA',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 650, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 650 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'COCINA - Mezón de Cuarzo - Colores Homogeneos') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'COCINA - Mezón de Cuarzo - Colores Homogeneos', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'COCINA',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 650, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 650 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'COCINA - Mezón de Cuarzo Calacatta') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'COCINA - Mezón de Cuarzo Calacatta', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'COCINA',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 750, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 750 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'COCINA - Mezón de Priedra Sinterizada') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'COCINA - Mezón de Priedra Sinterizada', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'COCINA',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 750, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 750 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'DORMITORIO - ROPERO/CLOSET - Puertas Batientes - Maletero Batiente o Abatible') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'DORMITORIO - ROPERO/CLOSET - Puertas Batientes - Maletero Batiente o Abatible', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'DORMITORIO',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 1600, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 1600 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'Accesorios Premium') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'Accesorios Premium', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'TODOS',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 50, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 50 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE nombre = 'Luz Led') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'Luz Led', NULL, 'UND', 'LONGITUD', 2, 'ACTIVO', 'COTIZACION', 'TODOS',
      NULL,
      (SELECT id FROM public.mae_proveedores WHERE razon_social = '' OR nombre_comercial = '' OR interlocutor = '' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 50, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 50 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4507974') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - L&H', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4507974',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4507975') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - L&H DESCUENTO', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4507975',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4508293') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - L&H', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4508293',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4508301') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - L&H DESCUENTO', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4508301',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4508298') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - L&H', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4508298',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4508306') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - L&H DESCUENTO', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4508306',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4507792') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - RESCATE 24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4507792',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4507793') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - RESCATE 24 DESCUENTO', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4507793',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4508292') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - RESCATE 24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4508292',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4508300') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - RESCATE 24 DESCUENTO', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4508300',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4508297') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - RESCATE 24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4508297',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4508305') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - RESCATE 24 DESCUENTO', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4508305',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509493') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - PLACA DECOR', 'Responsable: PLACA DECOR', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4509493',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'PLACA DECOR' OR nombre_comercial = 'PLACA DECOR' OR interlocutor = 'PLACA DECOR' LIMIT 1),
      'PLACA DECOR',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC1' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509494') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - PLACA DECOR DESCUENTO', 'Responsable: PLACA DECOR', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4509494',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'PLACA DECOR' OR nombre_comercial = 'PLACA DECOR' OR interlocutor = 'PLACA DECOR' LIMIT 1),
      'PLACA DECOR',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC1' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509495') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - PLACA DECOR', 'Responsable: PLACA DECOR', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4509495',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'PLACA DECOR' OR nombre_comercial = 'PLACA DECOR' OR interlocutor = 'PLACA DECOR' LIMIT 1),
      'PLACA DECOR',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC1' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509496') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - PLACA DECOR DESCUENTO', 'Responsable: PLACA DECOR', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4509496',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'PLACA DECOR' OR nombre_comercial = 'PLACA DECOR' OR interlocutor = 'PLACA DECOR' LIMIT 1),
      'PLACA DECOR',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC1' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509497') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - PLACA DECOR', 'Responsable: PLACA DECOR', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4509497',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'PLACA DECOR' OR nombre_comercial = 'PLACA DECOR' OR interlocutor = 'PLACA DECOR' LIMIT 1),
      'PLACA DECOR',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC1' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509498') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - PLACA DECOR DESCUENTO', 'Responsable: PLACA DECOR', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4509498',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'PLACA DECOR' OR nombre_comercial = 'PLACA DECOR' OR interlocutor = 'PLACA DECOR' LIMIT 1),
      'PLACA DECOR',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC1' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4508903') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'SERVICIO DE DISEÑO DE MUEBLES', 'Responsable: Todos los proveedores', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'TODOS',
      '4508903',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'Todos los proveedores' OR nombre_comercial = 'Todos los proveedores' OR interlocutor = 'Todos los proveedores' LIMIT 1),
      'Todos los proveedores',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      NULL);
    INSERT INTO public.pre_tarifario (id_material, precio, moneda, incluye_igv, fecha_inicio, fecha_fin, estado)
    SELECT v_id, 200, 'PEN', true, CURRENT_DATE, NULL, 'VIGENTE'
    WHERE NOT EXISTS (SELECT 1 FROM public.pre_tarifario t WHERE t.id_material = v_id AND t.precio = 200 AND t.fecha_inicio = CURRENT_DATE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4505160') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - KOJAC', 'Responsable: KOJAC', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4505160',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'KOJAC' OR nombre_comercial = 'KOJAC' OR interlocutor = 'KOJAC' LIMIT 1),
      'KOJAC',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC5' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4505176') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - KOJAC DESCUENTO', 'Responsable: KOJAC', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4505176',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'KOJAC' OR nombre_comercial = 'KOJAC' OR interlocutor = 'KOJAC' LIMIT 1),
      'KOJAC',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC5' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4505178') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - KOJAC', 'Responsable: KOJAC', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4505178',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'KOJAC' OR nombre_comercial = 'KOJAC' OR interlocutor = 'KOJAC' LIMIT 1),
      'KOJAC',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC5' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4505179') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - KOJAC DESCUENTO', 'Responsable: KOJAC', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4505179',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'KOJAC' OR nombre_comercial = 'KOJAC' OR interlocutor = 'KOJAC' LIMIT 1),
      'KOJAC',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC5' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4505180') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - KOJAC', 'Responsable: KOJAC', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4505180',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'KOJAC' OR nombre_comercial = 'KOJAC' OR interlocutor = 'KOJAC' LIMIT 1),
      'KOJAC',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC5' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4505181') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - KOJAC DESCUENTO', 'Responsable: KOJAC', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4505181',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'KOJAC' OR nombre_comercial = 'KOJAC' OR interlocutor = 'KOJAC' LIMIT 1),
      'KOJAC',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC5' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509141') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - MICROALIDOS - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4509141',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'JCHAN / DEIDAMIA / DEYBIS CRUZ BLAS / MHAC CONSTRUCTION S.A.C (LGANCIA) / JECAR / AGL',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509788') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO CON DESCUENTO - MICROALIDOS - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4509788',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509142') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - MICROALIDOS - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4509142',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509789') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO  CON DESCUENTO - MICROALIDOS - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4509789',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509391') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - MICROALIDOS - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4509391',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509790') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO  CON DESCUENTO - MICROALIDOS - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4509790',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509476') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - CONTRATISTA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4509476',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509791') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO  CON DESCUENTO - CONTRATISTA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4509791',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509477') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - CONTRATISTA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4509477',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509792') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO  CON DESCUENTO - CONTRATISTA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4509792',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509478') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - CONTRATISTA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4509478',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509810') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO  CON DESCUENTO - CONTRATISTA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4509810',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509479') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'ROPEROS COTIZADO - MAQUILA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'TO-GO',
      '4509479',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC9' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509480') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'TOCADOR COTIZADO - MAQUILA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'TO-GO',
      '4509480',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC9' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509481') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'ZAPATERA COTIZADO - MAQUILA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'TO-GO',
      '4509481',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC9' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509482') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'ESCRITORIO COTIZADO - MAQUILA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'TO-GO',
      '4509482',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC9' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509818') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'ROPEROS COTIZADO  CON DESCUENTO - MAQUILA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'TO-GO',
      '4509818',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC9' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509914') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'TOCADOR COTIZADO  CON DESCUENTO - MAQUILA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'TO-GO',
      '4509914',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC9' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509939') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'ZAPATERA COTIZADO  CON DESCUENTO - MAQUILA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'TO-GO',
      '4509939',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC9' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509959') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'ESCRITORIO COTIZADO  CON DESCUENTO - MAQUILA - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'TO-GO',
      '4509959',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'MADERAS AMERICA',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC9' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4509965') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO - INDEPENDIENTE MICROALIADO - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4509965',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      'JCHAN / DEIDAMIA / DEYBIS CRUZ BLAS / MHAC CONSTRUCTION S.A.C (LGANCIA) / JECAR / AGL',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500108') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO - INDEPENDIENTE MICROALIADO - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4500108',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500111') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO - INDEPENDIENTE MICROALIADO - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4500111',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500112') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE COCINA COTIZADO CON DESCUENTO - INDEPENDIENTE MICROALIADO - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'COCINA',
      '4500112',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500141') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE DORMITORIO COTIZADO CON DESCUENTO - INDEPENDIENTE MICROALIADO - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'DORMITORIO',
      '4500141',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500289') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'MUEBLE DE SALA COTIZADO CON DESCUENTO - INDEPENDIENTE MICROALIADO - MADERAS AMERICA', 'Responsable: MADERAS AMERICA', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'SALA',
      '4500289',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'MADERAS AMERICA' OR nombre_comercial = 'MADERAS AMERICA' OR interlocutor = 'MADERAS AMERICA' LIMIT 1),
      NULL,
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AC7' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500292') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO PINTURA - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4500292',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500295') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO VIDRIERIA - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4500295',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500331') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO ELECTRICIDAD E ILUMINACIÓN - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4500331',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500472') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO GASFITERIA - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4500472',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500812') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO ALBAÑILERÍA - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4500812',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500821') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO PISOS Y ENCHAPES - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4500821',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4500891') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO CARPINTERIA Y PUERTAS - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4500891',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501001') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO DRYWALL - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501001',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501179') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO OBRA CIVIL - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501179',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501180') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO VIDRIOS Y ALUMINIO - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501180',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501182') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO TECHOS E IMPERMEABILIZACIÓN - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501182',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4502450') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'VISITA TÉCNICA - AMCA 2.0 - LANDCORP', 'Responsable: LANDCORP INVERSIONES E.I.R.L.', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4502450',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'LANDCORP INVERSIONES E.I.R.L.' OR nombre_comercial = 'LANDCORP INVERSIONES E.I.R.L.' OR interlocutor = 'LANDCORP INVERSIONES E.I.R.L.' LIMIT 1),
      'LANDCORP INVERSIONES E.I.R.L.',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM8' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501316') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO PINTURA - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501316',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501325') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO VIDRIERIA - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501325',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501462') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO ELECTRICIDAD E ILUMINACIÓN - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501462',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501515') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO GASFITERIA - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501515',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501640') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO ALBAÑILERÍA - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501640',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501641') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO PISOS Y ENCHAPES - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501641',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501642') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO CARPINTERIA Y PUERTAS - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501642',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501812') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO DRYWALL - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501812',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4501892') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO OBRA CIVIL - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4501892',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4502360') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO VIDRIOS Y ALUMINIO - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4502360',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4502449') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'REMODELACIÓN COTIZADO TECHOS E IMPERMEABILIZACIÓN - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4502449',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mae_materiales WHERE codigo_sap = '4502451') THEN
    v_n := v_n + 1;
    v_id := 'MAT-' || lpad(v_n::text, 5, '0');
    INSERT INTO public.mae_materiales (id, codigo_tmp, nombre, descripcion, unidad, tipo_medida, decimales, estado, espacio, espacio_remodelar, codigo_sap, id_proveedor, asesor_nombre, id_oficina, id_grupo)
    VALUES (v_id, NULL, 'VISITA TÉCNICA - AMCA 2.0 - RESCATE24', 'Responsable: RESCATE 24', 'UND', 'LONGITUD', 2, 'ACTIVO', 'VENTAS', 'REMODELACION',
      '4502451',
      (SELECT id FROM public.mae_proveedores WHERE razon_social = 'RESCATE 24' OR nombre_comercial = 'RESCATE 24' OR interlocutor = 'RESCATE 24' LIMIT 1),
      'RESCATE 24',
      (SELECT id FROM public.mae_oficinas_ventas WHERE codigo_sap = 'AMCA' OR nombre = 'AMCA' LIMIT 1),
      (SELECT id FROM public.mae_grupos_vendedores WHERE codigo_sap = 'AM0' LIMIT 1));
  END IF;
END $$;
