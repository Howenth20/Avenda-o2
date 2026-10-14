# AVENDAÑO RINDE+

Aplicación nueva para gestionar gastos, asistencia y viáticos por obra. Está escrita en TypeScript con Next.js y mantiene su propio backend, esquema PostgreSQL y servicio de base de datos. No importa código, datos ni configuración del ZIP de referencia.

## Funciones incluidas

- Dos perfiles: administrador con acceso global y cuenta de obra limitada a un único proyecto.
- Obras con responsable, ubicación, estado y tarifa diaria de viáticos.
- Trabajadores con DNI, correo y teléfono únicos; baja lógica y restauración.
- Asistencia diaria para asistió, faltó o justificado. Impide duplicados y fechas futuras.
- Viático calculado en el servidor con tarifa histórica: días asistidos × tarifa diaria. Cambios de tarifa y asistencia recalculan los importes pendientes y guardan auditoría.
- Tres etapas financieras: pendiente, aprobado y pagado. Reabrir un registro cerrado requiere motivo administrativo.
- Gastos, tablero general, desglose por obra, reportes PDF, tickets de soporte y auditoría con valores antes/después, usuario, fecha e IP.
- Sesiones persistidas en PostgreSQL, contraseñas con hash, cookies HttpOnly, validación de entrada y límite básico de intentos de acceso/tickets.

## Requisitos

- Node.js 20.9 o posterior; esta entrega se verificó con Node 24.21.
- Docker Desktop para iniciar PostgreSQL localmente.

## Inicio local

Desde esta carpeta, crea `.env.local` a partir del ejemplo y reemplaza todos los valores de muestra. Usa una contraseña de administrador larga y única y un secreto aleatorio para `AUTH_SECRET`.

```powershell
Copy-Item .env.example .env.local
docker compose --env-file .env.local up -d database
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Abre `http://localhost:3000`. La dirección y contraseña del administrador son las que definiste en `.env.local`. El sembrado inicial solo funciona con la tabla de usuarios vacía; no crea una cuenta demo ni agrega datos empresariales ficticios.

## Correo de soporte

Para enviar el aviso del ticket a Gmail, configura `GMAIL_USER`, `GMAIL_APP_PASSWORD` y `SUPPORT_EMAIL` con una cuenta y una contraseña de aplicación autorizadas. El ticket se guarda aunque falte configuración de correo; la respuesta y la pantalla indican si el aviso se envió, falló o quedó sin configurar.

## Producción

Configura `DATABASE_URL` para una instancia PostgreSQL dedicada a RINDE+, con TLS (`DATABASE_SSL=true`), copias de seguridad y acceso de red limitado. Usa secretos distintos para producción, establece `AUTH_SECRET`, limita el tamaño del pool según el proveedor, configura el proxy confiable para `x-real-ip` y ejecuta `npm run db:migrate` como paso de despliegue antes de `npm run build` y `npm run start`. El contenedor local solo publica PostgreSQL en `127.0.0.1` y no es una configuración de producción.

El PDF, autenticación, consultas y Route Handlers requieren el runtime Node.js de Next.js. No se configura Edge Runtime para los endpoints de base de datos.

## Validaciones ejecutables

```powershell
npm run lint
npm run type-check
npm run build
```

Las operaciones de estado financiero, cálculo de viáticos, acceso por obra y escrituras de auditoría se ejecutan en el backend y dentro de transacciones PostgreSQL cuando comparten cambios.
