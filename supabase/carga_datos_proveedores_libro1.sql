-- Datos públicos encontrados para proveedores del Libro1.xlsx.
-- Ejecutar después de supabase/migracion_05_proveedores_directos_usuario_multi.sql.
-- Verificar el estado RUC vigente en SUNAT antes de contratar.
-- Fuentes consultadas:
--   https://tramitesperu.com/empresas/landcorp-inversiones-e-i-r-l-20607853259/
--   https://www.veritradecorp.com/es/peru/importaciones-y-exportaciones-maderas-america-sac/ruc-20513091461
--   https://www.facebook.com/p/Maderas-America-SAC-100066764204722/
--   https://tramitesperu.com/empresas/j-chan-interiores-s-a-c-20611940239/
--   https://tramitesperu.com/empresas/jecar-melamine-s-a-c-20609988798/
--   https://www.datosperu.org/empresa-kojac-sac-20603577176.php
--   https://www.datosperu.org/empresa-placa-decor-eirl-20605855645.php
--   https://rescate24peru.com/
-- Reejecutable. Solo reemplaza campos para los matches identificados.
BEGIN;

UPDATE public.mae_proveedores
   SET razon_social = 'LANDCORP INVERSIONES E.I.R.L.',
       ruc = '20607853259',
       direccion = 'Av. República de Panamá 3461, Int. 1702, San Isidro, Lima'
 WHERE upper(interlocutor) = upper('LANDCORP INVERSIONES E.I.R.L.');

UPDATE public.mae_proveedores
   SET razon_social = 'MADERAS AMERICA S.A.C.',
       nombre_comercial = 'Maderas America',
       ruc = '20513091461',
       correo = 'ventas1@maderasamerica.com',
       telefono = '+51 998 878 316',
       sitio_web = 'https://maderasamerica.com',
       direccion = 'Av. Pachacútec 6301, Villa María del Triunfo, Lima'
 WHERE upper(interlocutor) = upper('MADERAS AMERICA');

UPDATE public.mae_proveedores
   SET razon_social = 'J CHAN INTERIORES S.A.C.',
       nombre_comercial = 'JCHAN',
       ruc = '20611940239',
       telefono = '+51 955 417 902',
       direccion = 'Av. Separadora Industrial, Mz. N1 Lt. 11, Parque Industrial, Villa El Salvador, Lima'
 WHERE upper(interlocutor) = upper('JCHAN');

UPDATE public.mae_proveedores
   SET razon_social = 'JECAR MELAMINE S.A.C.',
       nombre_comercial = 'JECAR',
       ruc = '20609988798',
       direccion = 'Carabayllo, Lima'
 WHERE upper(interlocutor) = upper('JECAR');

UPDATE public.mae_proveedores
   SET razon_social = 'KOJAC S.A.C.',
       nombre_comercial = 'KOJAC',
       ruc = '20603577176'
 WHERE upper(interlocutor) = upper('KOJAC');

UPDATE public.mae_proveedores
   SET razon_social = 'PLACA DECOR E.I.R.L.',
       nombre_comercial = 'PLACA DECOR',
       ruc = '20605855645',
       sitio_web = 'https://www.facebook.com/placadecor'
 WHERE upper(interlocutor) = upper('PLACA DECOR');

UPDATE public.mae_proveedores
   SET nombre_comercial = 'Corporación Rescate 24',
       correo = 'ovenancio@rescate24peru.com',
       telefono = '+51 941 943 946',
       sitio_web = 'https://rescate24peru.com',
       direccion = 'Jr. Huancavelica 3225, Lima'
 WHERE upper(interlocutor) = upper('RESCATE 24');

COMMIT;

-- No se completan por falta de un match legal inequívoco: AGL, DEIDAMIA,
-- DEYBIS CRUZ y MHAC. Uno de los resultados para DEIDAMIA corresponde a una
-- empresa de transporte, por lo que no se asume que sea el proveedor del Excel.
