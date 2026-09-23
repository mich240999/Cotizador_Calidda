Soluciones Hogar · Cotizador Hogar — Guía de importación Supabase
================================================================
Archivos: supabase/schema.sql (tablas+RLS) y supabase/seed.sql (datos base).
Ejecutar en este orden. No requiere CLI; basta el Dashboard.

1) REQUISITOS
- Proyecto Supabase creado (región South America West / East la más cercana).
- Rol postgres / owner en SQL Editor.

2) IMPORTAR SCHEMA (tablas, funciones, triggers, RLS, índices)
a) Supabase Dashboard > tu proyecto > SQL Editor > New query.
b) Pega TODO el contenido de supabase/schema.sql > Run (o por bloques si el
   editor protesta por tamaño).
c) Verifica sin errores: Table Editor debe mostrar roles, profiles, oficinas,
   proveedores, asesores, clientes, materiales, cotizaciones,
   cotizacion_items, sesiones_app, audit_log.
d) Si re-ejecutas: el script es re-ejecutable (IF NOT EXISTS / DROP POLICY /
   DROP TRIGGER / CREATE OR REPLACE).

3) IMPORTAR SEED (catálogo demo)
a) SQL Editor > New query > pega supabase/seed.sql > Run.
b) Comprueba:
   SELECT * FROM roles;        -- 3 filas: admin, asesor, oficina
   SELECT * FROM oficinas;     -- 1 fila: Oficina Central
   SELECT * FROM proveedores;  -- 3 filas
   SELECT * FROM materiales;   -- 8 filas MAT-001..MAT-008
   SELECT * FROM clientes;     -- 1 fila Juan Pérez (demo)
c) El seed es idempotente (ON CONFLICT / WHERE NOT EXISTS): puedes correrlo
   varias veces sin duplicar.

4) CREAR USUARIOS Y VINCULAR PROFILES (obligatorio para RLS)
La app usa auth.users + public.profiles (id UUID = auth.users.id).
a) Authentication > Users > Add user > Email/Password (crea 1 admin demo y
   1 asesor demo). Copia cada UID (columna UID).
b) En SQL Editor, por cada usuario:
   -- rol admin:
   INSERT INTO profiles (id, email, nombre, rol_id, oficina_id, activo)
   VALUES ('<UID-ADMIN>', 'admin@solucioneshogar.pe', 'Admin Central',
           (SELECT id FROM roles WHERE nombre='admin'), 1, true);
   -- rol asesor:
   INSERT INTO profiles (id, email, nombre, rol_id, oficina_id, activo)
   VALUES ('<UID-ASESOR>', 'asesor@solucioneshogar.pe', 'Asesor Demo',
           (SELECT id FROM roles WHERE nombre='asesor'), 1, true);
   -- opcional ficha comercial:
   INSERT INTO asesores (profile_id, codigo, comision_pct)
   VALUES ('<UID-ASESOR>', 'ASE-001', 5.00);
c) Asigna el cliente demo al asesor (opcional):
   UPDATE clientes SET asesor_id = (SELECT id FROM asesores WHERE codigo='ASE-001'),
     created_by = '<UID-ASESOR>' WHERE dni = '12345678';

5) PROBAR RLS (anon=nada, oficina=scoped, admin=todo)
a) Sin login (anon): cualquier SELECT debe devolver 0 filas / error 42501.
b) Logueado como asesor: solo ve filas de su oficina_id (clientes,
   cotizaciones, items, profiles de su oficina). Catálogos (roles, oficinas,
   proveedores, materiales) los ve todos (solo lectura).
c) Logueado como admin: ve y edita todo.
d) Service role key (backend) bypassa RLS: úsala solo en servidor.

6) PROBAR LÓGICA (códigos y totales automáticos)
-- Crea cotización sin código: el trigger asigna COT-YYYY-XXXX
INSERT INTO cotizaciones (cliente_id, oficina_id, validez_dias, observaciones, created_by)
VALUES ((SELECT id FROM clientes WHERE dni='12345678'), 1, 15, 'Prueba', '<UID-ASESOR>')
RETURNING codigo, subtotal, igv, total;  -- ej. COT-2026-0001, 0,0,0
-- Agrega 2 líneas: total_linea e IGV 18% se recalculan solos
INSERT INTO cotizacion_items (cotizacion_id, material_id, cantidad, precio_unit, descuento_pct)
VALUES ('<ID-COTIZACION>', (SELECT id FROM materiales WHERE codigo='MAT-001'), 2, 89.90, 10),
       ('<ID-COTIZACION>', (SELECT id FROM materiales WHERE codigo='MAT-004'), 4, 12.90, 0);
SELECT codigo, subtotal, igv, total FROM cotizaciones WHERE id = '<ID-COTIZACION>';
-- Esperado: línea1=161.82, línea2=51.60, subtotal=213.42, igv=38.42, total=251.84

7) SESIONES / HEARTBEAT (mirror Paso13D1 cada 120s)
- Al login, el frontend inserta en sesiones_app:
  INSERT INTO sesiones_app (user_id, token_hash, modulo, origen, user_agent)
  VALUES (auth.uid(), encode(digest('<token-aleatorio>','sha256'),'hex'), 'Paso14', 'web', '...');
  (nunca guardes el token plano, solo su hash SHA256).
- Cada 120s llama: SELECT heartbeat_sesion('<mismo-token_hash>', '<modulo-actual>');
- Limpieza periódica (cron/Edge Function): SELECT marcar_sesiones_inactivas();
  Marca inactivas las sesiones sin heartbeat en 10 min.
- Auditoría desde cliente/servidor: SELECT registrar_audit('COTIZACION.Crear', '{"id":"..."}', 'Paso14');

8) PDF / CORREO (Paso16, fuera del SQL)
- Genera el PDF en el backend (Edge Function / Apps Script) leyendo
  cotizaciones + cotizacion_items + materiales, y envía por correo/SMTP.
- Registra cada envío con registrar_audit('COTIZACION.EnviarPDF', ...).

9) PROBLEMAS COMUNES
- "permission denied / 42501": es RLS funcionando; verifica profile (rol_id,
  oficina_id, activo=true) del usuario logueado.
- "function auth.uid() does not exist": estás fuera de Supabase (el esquema
  auth solo existe en la nube); corre el script en el SQL Editor del proyecto.
- "duplicate key COT-...": dos inserts concurrentes el mismo año; reintenta
  (el contador es MAX+1, tolerante a concurrencia media; para alto volumen
  cambia a una secuencia por año).
- "profiles insert violates RLS": solo admin puede insertar profiles (o usa
  service_role en el backend de aprovisionamiento).

10) LIMPIEZA PRUEBA (opcional)
DELETE FROM cotizacion_items WHERE cotizacion_id = '<ID-COTIZACION>';
DELETE FROM cotizaciones WHERE id = '<ID-COTIZACION>';
