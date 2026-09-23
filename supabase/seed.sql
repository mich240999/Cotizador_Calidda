-- ============================================================================
-- Soluciones Hogar · Cotizador Hogar · seed.sql
-- Ejecutar DESPUÉS de schema.sql (SQL Editor > New query > Run)
-- Idempotente donde hay UNIQUE (ON CONFLICT DO NOTHING)
-- NOTA: profiles/asesores/cotizaciones de demo real se crean luego de dar de
-- alta usuarios en Authentication (ver README_IMPORT.txt). Aquí el cliente
-- demo queda con asesor_id/created_by NULL a propósito.
-- ============================================================================

-- 1. Roles (Paso2/3): admin, asesor, oficina -------------------------------
INSERT INTO public.roles (nombre, permisos) VALUES
  ('admin',  '{"modulos": ["*"], "admin_crud": true, "reportes": true, "pdf": true, "correo": true}'),
  ('asesor', '{"modulos": ["Paso6", "Paso10", "Paso14", "Paso16"], "cotizaciones": ["crear", "editar", "enviar"], "clientes": ["crear", "editar", "ver"]}'),
  ('oficina','{"modulos": ["Paso6", "Paso14"], "cotizaciones": ["ver", "aprobar", "rechazar"], "clientes": ["ver"]}')
ON CONFLICT (nombre) DO UPDATE SET permisos = EXCLUDED.permisos;

-- 2. Oficina central --------------------------------------------------------
INSERT INTO public.oficinas (id, nombre, direccion, telefono) VALUES
  (1, 'Oficina Central', 'Av. Los Hogares 123, Lima', '+51 1 555 0100')
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre,
  direccion = EXCLUDED.direccion, telefono = EXCLUDED.telefono;

-- 3. Proveedores (3) --------------------------------------------------------
INSERT INTO public.proveedores (id, nombre, ruc, contacto, email, telefono) VALUES
  (1, 'Pinturas Andinas S.A.C.',      '20123456781', 'María Torres',  'ventas@pinturasandinas.pe',  '+51 1 555 0111'),
  (2, 'ElectroCables Perú S.A.C.',    '20123456782', 'Jorge Quispe',  'contacto@electrocables.pe',  '+51 1 555 0222'),
  (3, 'Tuberías y Acabados Hogar E.I.R.L.', '20123456783', 'Ana Ríos', 'pedidos@acabadoshogar.pe', '+51 1 555 0333')
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, ruc = EXCLUDED.ruc,
  contacto = EXCLUDED.contacto, email = EXCLUDED.email, telefono = EXCLUDED.telefono;

-- 4. Materiales hogar (8): pintura, cable, tubería, etc. --------------------
-- Se resuelve proveedor_id por nombre para no depender del SERIAL.
INSERT INTO public.materiales (codigo, nombre, descripcion, unidad, precio_unit, stock, proveedor_id, activo) VALUES
  ('MAT-001', 'Pintura látex blanco 4L',       'Pintura látex interior/exterior blanco mate, 4 litros', 'GAL',  89.90, 120, (SELECT id FROM public.proveedores WHERE nombre = 'Pinturas Andinas S.A.C.'), true),
  ('MAT-002', 'Rodillo + kit pintor 9"',       'Rodillo, bandeja y brocha 2" para acabados hogar',      'KIT',  34.50, 200, (SELECT id FROM public.proveedores WHERE nombre = 'Pinturas Andinas S.A.C.'), true),
  ('MAT-003', 'Cable eléctrico 12AWG x 100m',  'Cable TW-80 12AWG rojo, rollo 100 m',                   'ROL', 145.00,  60, (SELECT id FROM public.proveedores WHERE nombre = 'ElectroCables Perú S.A.C.'), true),
  ('MAT-004', 'Foco LED 12W luz cálida',       'Foco LED E27 12W 3000K, pack unitario',                 'UND',  12.90, 500, (SELECT id FROM public.proveedores WHERE nombre = 'ElectroCables Perú S.A.C.'), true),
  ('MAT-005', 'Interruptor + tomacorriente',   'Placa doble: interruptor + tomacorriente universal',    'UND',  18.50, 300, (SELECT id FROM public.proveedores WHERE nombre = 'ElectroCables Perú S.A.C.'), true),
  ('MAT-006', 'Tubería PVC 1/2" x 5m',         'Tubo PVC presión 1/2" para agua, 5 metros',             'UND',  14.90, 250, (SELECT id FROM public.proveedores WHERE nombre = 'Tuberías y Acabados Hogar E.I.R.L.'), true),
  ('MAT-007', 'Pegamento PVC 118ml',           'Cemento solvente PVC transparente 118 ml',              'UND',   9.90, 400, (SELECT id FROM public.proveedores WHERE nombre = 'Tuberías y Acabados Hogar E.I.R.L.'), true),
  ('MAT-008', 'Cinta aislante 3/4" x 20m',     'Cinta aislante negra uso eléctrico 20 m',               'UND',   6.50, 600, (SELECT id FROM public.proveedores WHERE nombre = 'ElectroCables Perú S.A.C.'), true)
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion, unidad = EXCLUDED.unidad,
  precio_unit = EXCLUDED.precio_unit, stock = EXCLUDED.stock,
  proveedor_id = EXCLUDED.proveedor_id, activo = EXCLUDED.activo;

-- 5. Cliente demo (1) -------------------------------------------------------
-- Sin asesor/created_by hasta crear usuarios reales (ver README).
INSERT INTO public.clientes (nombres, dni, telefono, email, direccion, distrito, asesor_id, created_by)
SELECT 'Juan Pérez (demo)', '12345678', '+51 999 888 777', 'juan.perez.demo@example.com',
       'Jr. Las Flores 456', 'San Juan de Lurigancho', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.clientes WHERE dni = '12345678');
