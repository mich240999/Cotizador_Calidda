# Soluciones Hogar — Cotizador (Next.js + Supabase)

Réplica ingeniería inversa de la app Apps Script `Soluciones Hogar` (deployment `AKfycbyeVs8EfMmbd9FX1VlMhDwjqbhSVqMNIi1pyIAXs1MIxNokXJmYTwPezby5Hc4aTpQb`).
`google.script.run` → `POST /api/operacion { operacion, argumentos, modulo }`.

## 1. Supabase (2 min)
1. Crea proyecto en https://supabase.com/dashboard
2. SQL Editor > New query > pega `supabase/schema.sql` > Run
3. New query > pega `supabase/seed.sql` > Run
4. Authentication > Users > crea admin + asesor, luego vincula en SQL (ver `supabase/README_IMPORT.txt` paso 4):
```sql
INSERT INTO profiles (id, email, nombre, rol_id, oficina_id, activo)
VALUES ('<UID>', 'admin@tu-dominio.com', 'Admin', (SELECT id FROM roles WHERE nombre='admin'), 1, true);
```
5. Authentication > Providers > activa Google y Azure (Microsoft) con tus Client ID/Secret. Redirect URL: `https://<tu-proyecto>.supabase.co/auth/v1/callback` + `http://localhost:3000` para dev.
6. Copia: Project URL, `anon public`, `service_role` (Settings > API).

## 2. Local
```cmd
cd COTIZADOR
copy .env.example .env.local
:: edita .env.local con tus 3 keys
npm.cmd install
npm.cmd run dev
```
Abre http://localhost:3000

## 3. GitHub
```cmd
git init
git add .
git commit -m "Cotizador Soluciones Hogar - Next.js + Supabase"
gh repo create cotizador-hogar --private --source=. --push
```

## 4. Vercel
1. vercel.com > Add New Project > importa el repo
2. Environment Variables (Production + Preview):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo server, sin `NEXT_PUBLIC_`)
- `AUTH_ALLOWED_DOMAINS` (opcional, ej. `calidda.com.pe`)
- `SMTP_HOST/PORT/USER/PASS/FROM` (opcional, para enviarCorreo)
- `CRON_SECRET` (opcional, protege /api/cron/heartbeat)
3. Deploy. Cron `*/5 * * * *` → `/api/cron/heartbeat` ya está en `vercel.json`.

## Estructura
- `app/` login (Google/Microsoft), dashboard, clientes, materiales, cotizaciones/nueva/[id], admin
- `app/api/operacion` whitelist + rol + zod + audit_log + heartbeat (mirror Paso13D2)
- `app/api/cotizaciones/[id]/pdf` PDF jsPDF · `app/api/cron/heartbeat` limpia sesiones >30min
- `lib/` supabaseClient (browser anon), supabaseServer (cookies + service_role), auth (profiles+roles), operaciones
- `supabase/schema.sql` 11 tablas + RLS + triggers (COT-YYYY-XXXX, IGV 18%) · `seed.sql` catálogo demo
- `components/` AuthGate (heartbeat 120s), Navbar, Tablas (apiOperacion), CotizadorForm (subtotal/IGV/total vivo)

## Operaciones disponibles
`listarClientes, crearCliente, listarMateriales, crearMaterial, crearCotizacion, listarCotizaciones, cambiarEstadoCotizacion (BORRADOR/ENVIADA/APROBADA/RECHAZADA), generarPDF, enviarCorreo, listarProveedores, listarOficinas, adminListarUsuarios/Crear/Actualizar/Eliminar`
