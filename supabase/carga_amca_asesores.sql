-- Carga AMCA · asesores (13 filas de la hoja ASESORES).
-- Crea fichas seg_usuarios rol ASESOR con correo/DNI provisorios (ACTUALIZAR luego en Usuarios):
--   correo = slug + '@carga.amca.local', nro_doc = 'CARGA-<BP>-<n>'.
--   NO crea accesos Auth: con el correo real, créalos en Administración > Usuarios.
-- Idempotente (IF NOT EXISTS por correo).
DO $$
DECLARE v_n int;
BEGIN
  SELECT COALESCE(max(substring(id from 2)::int), 0) INTO v_n FROM public.seg_usuarios WHERE id ~ '^U[0-9]{5}$';
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'huberto.echegaray.1@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Huberto Echegaray', 'DNI', 'CARGA-5003830921-1', 'huberto.echegaray.1@carga.amca.local', NULL,
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '5003830921'), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'cesar.benites.2@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'CESAR BENITES', 'DNI', 'CARGA-5003660285-2', 'cesar.benites.2@carga.amca.local', NULL,
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '5003660285'), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'erika.matta.3@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'ERIKA MATTA', 'DNI', 'CARGA-5003805068-3', 'erika.matta.3@carga.amca.local', NULL,
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '5003805068'), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'ever.cardenas.acuy.4@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Ever Cardenas Acuy', 'DNI', 'CARGA-5003388055-4', 'ever.cardenas.acuy.4@carga.amca.local', '984173879',
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '5003388055'), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'camelia.sanchez.5@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Camelia Sanchez', 'DNI', 'CARGA-SBP-5', 'camelia.sanchez.5@carga.amca.local', '941556229',
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = ''), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'alonso.guanilo.camacho.6@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Alonso Guanilo Camacho', 'DNI', 'CARGA-SBP-6', 'alonso.guanilo.camacho.6@carga.amca.local', '987596435',
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = ''), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'cesar.antonio.cueva.calderon.7@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Cesar Antonio Cueva Calderon', 'DNI', 'CARGA-5004008016-7', 'cesar.antonio.cueva.calderon.7@carga.amca.local', '993276119',
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '5004008016'), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'rafael.gomez.chinchay.8@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Rafael Gómez chinchay', 'DNI', 'CARGA-SBP-8', 'rafael.gomez.chinchay.8@carga.amca.local', '923620973',
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = ''), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'jhosajane.cacsire.avila.9@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Jhosajane Cacsire Avila', 'DNI', 'CARGA-5003968987-9', 'jhosajane.cacsire.avila.9@carga.amca.local', NULL,
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '5003968987'), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'deidamia.10@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Deidamia', 'DNI', 'CARGA-5003968994-10', 'deidamia.10@carga.amca.local', NULL,
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '5003968994'), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'deybis.cruz.11@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Deybis Cruz', 'DNI', 'CARGA-5003966796-11', 'deybis.cruz.11@carga.amca.local', NULL,
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '5003966796'), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'carlos.alberto.sulca.palomino.12@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Carlos Alberto Sulca Palomino', 'DNI', 'CARGA-5003968991-12', 'carlos.alberto.sulca.palomino.12@carga.amca.local', NULL,
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '5003968991'), 'ACTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seg_usuarios WHERE correo = 'lucero.gonzales.13@carga.amca.local') THEN
    v_n := v_n + 1;
    INSERT INTO public.seg_usuarios (id, nombre, tipo_doc, nro_doc, correo, telefono, rol_codigo, id_proveedor, estado)
    VALUES ('U' || lpad(v_n::text, 5, '0'), 'Lucero Gonzales', 'DNI', 'CARGA-5003966795-13', 'lucero.gonzales.13@carga.amca.local', NULL,
      'ASESOR', (SELECT id FROM public.mae_proveedores WHERE interlocutor = '5003966795'), 'ACTIVO');
  END IF;
END $$;
