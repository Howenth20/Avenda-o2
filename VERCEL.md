# Despliegue en Vercel con PostgreSQL

La base Docker de tu computadora (`localhost:5432`) solo sirve en desarrollo. Una función de Vercel se ejecuta en la nube y no puede acceder a ella. Por eso el inicio de sesión devuelve 500 cuando la aplicación se despliega sin una base PostgreSQL externa.

## 1. Crea o conecta una base externa

En Vercel abre el proyecto, entra a **Storage** y agrega una integración PostgreSQL del Marketplace, por ejemplo Neon. Crea la base en la misma región que el proyecto y copia la cadena de conexión de la integración.

## 2. Configura las variables de Production

En **Project → Settings → Environment Variables**, agrega estas variables y marca **Production**. Si también pruebas una URL Preview, marca **Preview** con una base de pruebas separada.

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | La cadena PostgreSQL completa del proveedor. No uses `localhost`, `127.0.0.1` ni la URL de Docker. |
| `DATABASE_SSL` | `true`, solamente si la cadena no contiene `sslmode`. |
| `DB_POOL_MAX` | `3` |
| `AUTH_SECRET` | Un secreto aleatorio de 32 bytes o más. |
| `BUSINESS_TIME_ZONE` | `America/Lima` |
| `UPLOADS_DIR` | No la configures en Vercel hasta usar almacenamiento persistente. |

No copies `.env.local` al repositorio ni a Vercel: contiene la URL de tu PostgreSQL local.

## 3. Crea tablas y el administrador en la base de producción

Ejecuta una sola vez desde tu computadora. Este proceso usa las variables que Vercel tiene en Production, aplica las migraciones sin borrar datos y crea el administrador solo si la tabla de usuarios está vacía.

```powershell
npm install -g vercel
cd C:\ruta\a\rinde-plus-github
vercel link
vercel env pull .env.production.local --environment=production
node --env-file=.env.production.local scripts/migrate.mjs
node --env-file=.env.production.local scripts/seed-admin.mjs
```

Antes de ejecutar el último comando, agrega también `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` en Vercel Production. Luego elimina `.env.production.local` de tu equipo o guárdalo fuera del proyecto.

## 4. Vuelve a desplegar

En Vercel abre **Deployments** y usa **Redeploy**, o envía un nuevo commit a la rama de producción. Las variables nuevas solo se aplican a despliegues creados después de guardarlas.

## Diagnóstico

- `DATABASE_URL apunta a localhost`: se copió la URL local; reemplázala por la URL externa.
- `No se pudo conectar a PostgreSQL`: verifica URL, SSL, región y permisos del proveedor.
- `La base de datos no tiene las tablas requeridas`: ejecuta el paso 3.
- `Correo o contraseña incorrectos`: usa el correo y la clave definidos al ejecutar el sembrado de producción; no son necesariamente los de tu `.env.local`.

Los PDFs requieren almacenamiento persistente en producción. El sistema seguirá funcionando con su control de datos; para conservar comprobantes entre despliegues se debe conectar almacenamiento de objetos compatible con S3 antes de usar esa función en Vercel.