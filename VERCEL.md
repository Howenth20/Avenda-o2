# Despliegue en Vercel con PostgreSQL

La base Docker de tu computadora (`localhost:5432`) solo sirve en desarrollo. Vercel se ejecuta en la nube y necesita una base PostgreSQL externa.

## 1. Configura Vercel

En el proyecto de Vercel abre **Storage** y conecta una base PostgreSQL externa, por ejemplo una integración de Neon. Después ve a **Settings → Environment Variables** y agrega las variables necesarias para **Production**:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | Cadena PostgreSQL externa entregada por el proveedor. Nunca uses `localhost` ni la URL de Docker. |
| `DATABASE_SSL` | `true` si la URL no incluye `sslmode=require`. |
| `DB_POOL_MAX` | `3` |
| `ADMIN_NAME` | Nombre del administrador inicial. |
| `ADMIN_EMAIL` | Correo que usarás para entrar. |
| `ADMIN_PASSWORD` | Contraseña inicial de al menos 14 caracteres. |
| `AUTH_SECRET` | Secreto aleatorio de 32 bytes o más. |

Guarda las variables antes de descargarlas. Vercel solo las aplica a los nuevos despliegues. No publiques ni compartas `.env.production.local`.

## 2. Enlaza la carpeta con Vercel y descarga las variables

En Windows PowerShell, `vercel` puede no estar instalado como comando. Usa `npx.cmd`, que descarga la CLI sin instalarla globalmente. En el primer comando inicia sesión en la cuenta de Vercel; después enlaza la carpeta al proyecto correcto:

```powershell
Set-Location "C:\Users\Luis\rinde-plus-github-20261014-163657"
npx.cmd --yes vercel@latest login
if ($LASTEXITCODE -ne 0) { throw "No se pudo iniciar sesión en Vercel. No continúes." }
npx.cmd --yes vercel@latest link
if ($LASTEXITCODE -ne 0) { throw "No se pudo enlazar el proyecto de Vercel. No continúes." }
npx.cmd --yes vercel@latest env pull .env.production.local --environment=production
if ($LASTEXITCODE -ne 0) { throw "Vercel no pudo descargar las variables de Production." }
if (-not (Test-Path -LiteralPath ".env.production.local")) { throw "No se creó .env.production.local. Revisa el inicio de sesión y el enlace al proyecto." }
node --env-file=.env.production.local -e "for (const k of ['DATABASE_URL','ADMIN_NAME','ADMIN_EMAIL','ADMIN_PASSWORD']) { if (!process.env[k]) { console.error(k + ': FALTA'); process.exitCode=1 } else { console.log(k + ': OK') } }"
if ($LASTEXITCODE -ne 0) { throw "Faltan variables. Agrégalas en Vercel Production y repite env pull." }
```

El comando no imprime contraseñas ni la URL de la base. Si vuelve a salir `vercel no se reconoce`, asegúrate de copiar los comandos `npx.cmd` de arriba tal como aparecen.

## 3. Migra la base y crea el administrador inicial

Ejecuta la migración contra la misma `DATABASE_URL` que Vercel descargó. La migración conserva los datos existentes. Ejecuta `seed-admin.mjs` solo si la tabla `users` está vacía; el sembrado no se puede repetir sobre una base con cuentas.

```powershell
node --env-file=.env.production.local scripts/migrate.mjs
if ($LASTEXITCODE -ne 0) { throw "Falló la migración. Lee el error antes de continuar." }
node --env-file=.env.production.local scripts/seed-admin.mjs
if ($LASTEXITCODE -ne 0) { throw "No se creó el administrador. Si ya hay cuentas en esa base, inicia con la cuenta existente." }
```

## 4. Despliega y verifica

En Vercel confirma que el proyecto use el repositorio `Howenth20/Avenda-o2` y la rama `main`; luego espera el nuevo deployment o ejecuta **Redeploy** desde **Deployments**. Abre `https://TU-DOMINIO-VERCEL/api/health`. Cuando la base y las cuatro migraciones estén listas, debe devolver JSON con `"status":"ok"`. Si devuelve 503, el mensaje indica qué falta.

- `DATABASE_URL apunta a localhost`: reemplázala en Vercel por la cadena PostgreSQL externa.
- `No se pudo conectar`: revisa URL, credenciales, SSL y disponibilidad del proveedor.
- `Faltan migraciones`: repite el paso 3.
- `Correo o contraseña incorrectos`: usa `ADMIN_EMAIL` y `ADMIN_PASSWORD` del sembrado de producción; no tienen por qué coincidir con el administrador local.
- `DEPLOYMENT_NOT_FOUND`: abre **Settings → Domains** en Vercel y usa el dominio que aparece en el proyecto desplegado.

Los comprobantes nuevos (PDF e imágenes JPG, PNG, WEBP, GIF o BMP) se guardan en PostgreSQL y permanecen disponibles entre despliegues. El tamaño máximo es 4 MB por archivo para mantenerse bajo el límite de 4.5 MB del cuerpo de petición de Vercel. Considera el espacio de base de datos disponible al almacenar muchos archivos; los comprobantes antiguos que solo estén en el disco temporal de una función no se pueden recuperar desde nuevos despliegues.
