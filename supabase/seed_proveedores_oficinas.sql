-- ============================================================================
-- SGT360 · Seed proveedores y oficina de ventas (carga inicial)
-- 13 proveedores + oficina Ambientes Cálidos.
-- Upsert por id: si el registro ya existe se actualiza con estos valores.
-- Ejecutar DESPUÉS de supabase/schema_sgt360.sql. Idempotente.
-- ============================================================================

INSERT INTO public.mae_proveedores (id, interlocutor, ruc, razon_social, nombre_comercial, correo, telefono, estado) VALUES
  ('PRV0008', '1000000001', '20503758114', 'GAS NATURAL DE LIMA Y CALLAO S.A.', 'Cálidda Gas Natural del Peru', NULL, '6149000', 'ACTIVO'),
  ('PRV0009', '5001624910', '20552836481', 'IBR PERU S.A.', 'IBR Peru S.A.', NULL, NULL, 'ACTIVO'),
  ('PRV0010', '5001620547', '20566158061', 'SEI PERU S.A.C.', 'Totem', NULL, NULL, 'ACTIVO'),
  ('PRV0011', '5003388055', '20603577176', 'KOJAC S.A.C.', 'Kojac', NULL, NULL, 'ACTIVO'),
  ('PRV0012', '5003660285', '20601864071', 'CORPORACION RESCATE 24 S.A.C.', 'Rescate 24', NULL, NULL, 'ACTIVO'),
  ('PRV0013', '5003805068', '20605855645', 'PLACA DECOR E.I.R.L.', 'Placa Decor', NULL, NULL, 'ACTIVO'),
  ('PRV0014', '5003830921', '20607853259', 'LANDCORP INVERSIONES E.I.R.L.', 'Landcorp Inversiones', NULL, NULL, 'ACTIVO'),
  ('PRV0015', '5003968987', '20611940239', 'J CHAN INTERIORES S.A.C', 'J Chan Interiores', NULL, NULL, 'ACTIVO'),
  ('PRV0016', '5003968991', '20609988798', 'JECAR MELAMINE S.A.C.', 'Jecar Melamine', NULL, NULL, 'ACTIVO'),
  ('PRV0017', '5003968994', '10106424611', 'QUISPE FELIX DEIDAMIA', 'Deidamia Quispe', NULL, NULL, 'ACTIVO'),
  ('PRV0018', '5003966794', '20603706626', 'MHAC CONSTRUCTION S.A.C.', 'Mhac Construction', NULL, NULL, 'ACTIVO'),
  ('PRV0019', '5003966795', '20615402223', 'AGL INTERIORES S.A.C.', 'Agl Interiores', NULL, NULL, 'ACTIVO'),
  ('PRV0020', '5003966796', '10421655974', 'CRUZ BLAS HITBER DEYBIS', 'Hitber Cruz', NULL, NULL, 'ACTIVO')
ON CONFLICT (id) DO UPDATE SET
  interlocutor = EXCLUDED.interlocutor,
  ruc = EXCLUDED.ruc,
  razon_social = EXCLUDED.razon_social,
  nombre_comercial = EXCLUDED.nombre_comercial,
  telefono = EXCLUDED.telefono,
  estado = EXCLUDED.estado;

INSERT INTO public.mae_oficinas_ventas (id, codigo_sap, nombre, descripcion, estado) VALUES
  ('OFV0001', 'AMCA', 'Ambientes Cálidos', 'Venta de Muebles de Melamina', 'ACTIVO')
ON CONFLICT (id) DO UPDATE SET
  codigo_sap = EXCLUDED.codigo_sap,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  estado = EXCLUDED.estado;
