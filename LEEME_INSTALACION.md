# GUAYACA Transport · Back v0.2.1 con Sequelize

Esta versión sustituye al back v0.1.1 y mantiene su API para usar el front v0.1.1. Está organizada en modelos, controladores, rutas, middlewares, servicios y migraciones JavaScript, siguiendo la forma de trabajo de Kafer Forms. Sequelize usa `pg` como controlador de conexión PostgreSQL: eso no requiere escribir ni ejecutar SQL manualmente.

## Instalación desde cero

Requisitos: Node.js LTS, PostgreSQL instalado y una base de datos vacía creada. El servidor no crea automáticamente la base de datos. En Windows, por ejemplo, abra PowerShell en la carpeta de este back:

```powershell
npm ci
Copy-Item .env.example .env
notepad .env
```

Si ya tiene un archivo `.env` de GUAYACA, consérvelo y revise sus valores; no lo sobrescriba. Ejemplo local, reemplace usuario, contraseña y base por los suyos:

```env
PORT=8088
DATABASE_URL=postgresql://postgres:SU_CLAVE@localhost:5432/guayaca
JWT_SECRET=PEGUE_UNA_CADENA_ALEATORIA_DE_AL_MENOS_32_CARACTERES
APP_URL=http://localhost:5173
UPLOAD_DIR=./uploads
ADMIN_NAME=Administrador
ADMIN_EMAIL=su-correo@ejemplo.com
ADMIN_PASSWORD=UnaClaveDe12CaracteresOMas
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tu-correo@gmail.com
SMTP_PASS=CLAVE_DE_APLICACION
SMTP_FROM=tu-correo@gmail.com
```

No utilice valores de ejemplo ni publique el `.env`. Para generar JWT_SECRET, use `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. El usuario inicial requiere contraseña de al menos 12 caracteres. Para una clave de base con caracteres especiales, codifique el componente contraseña en la URL: por ejemplo, `#` es `%23`. SMTP puede quedar vacío para acceder con el administrador inicial; es necesario configurarlo para crear otros usuarios y para verificar correo o usar doble factor. El administrador inicial queda verificado al crearse. Se aplican las mismas limitaciones de la versión anterior de prueba.

## Migración y administrador

Con la base vacía y `.env` configurado, ejecute en este orden:

```powershell
npm run db:migrate
npm run db:seed:admin
npm run dev
```

`db:migrate` crea la estructura y guarda el registro en `guayaca_migrations`; ejecutarlo de nuevo informa que no hay migraciones pendientes. `db:seed:admin` solo crea el primer administrador si no existe ninguno; nunca cambia la contraseña de un administrador existente. `npm run dev` no crea ni modifica tablas: requiere la migración inicial aplicada. No ejecute el antiguo `npm run init`: ese comando se retiró.

Para subir cambios futuros a un servidor, respalde la base y los adjuntos, coloque la nueva versión, instale dependencias, ejecute las migraciones pendientes con `npm run db:migrate`, y luego reinicie el servicio. No se ejecuta `sync({alter:true})` ni `sync({force:true})` al iniciar. Las futuras modificaciones se añaden como migraciones nuevas; el archivo `schema001.js` corresponde a la estructura inicial y no debe modificarse para actualizar instalaciones existentes.

## Si ya se crearon tablas con v0.1.1

La migración inicial detecta las tablas previas sin registro y se detiene; no elimina ni transforma los datos existentes. Si la base anterior contiene información que necesita conservar, haga un respaldo y solicite una migración específica para esos datos. Si ya comenzó una prueba y quiere empezar de cero, utilice otra base vacía o decida la limpieza solo después de confirmar y respaldar lo necesario. No ejecute el esquema SQL antiguo sobre la nueva base.

## Ubicación de archivos

- `src/models/`: un modelo Sequelize por entidad y asociaciones en `index.js`.
- `src/controllers/`, `src/routes/`, `src/middlewares/`, `src/services/`: API y reglas.
- `src/utils/connection.js`: conexión Sequelize con `DATABASE_URL`.
- `src/migrations/`: migraciones JavaScript y estructura inicial congelada.
- `src/scripts/migrate.js`: ejecutor de migraciones con Umzug y registro en la base.
- `src/scripts/seedAdmin.js`: creación controlada del primer administrador.

## Comprobación

El servidor escucha por defecto en `127.0.0.1:8088`. Compruebe `http://127.0.0.1:8088/api/health`. El front v0.1.1 local puede usar `VITE_API_URL=http://localhost:8088/api`. La ubicación del conductor requiere permiso y un contexto seguro; en producción se necesita HTTPS. Se conservan las limitaciones: puntos manuales, sin seguimiento continuo ni recuperación de contraseña, y resultados de hasta 300 viajes recientes.

Pruebas efectuadas: migración y seed ejecutados dos veces; inicio de sesión, verificación de correo y doble factor con SMTP simulado; permisos, viaje, odómetro, gastos, archivo, limpieza y desactivación de usuario. Las pruebas usaron un motor PostgreSQL compatible en memoria por socket; falta comprobar con PostgreSQL y correo reales en local y en el servidor. Antes de operación real, configure respaldos fuera del servidor y pruebe su restauración.

## Comprobar Gmail SMTP

Configure las variables SMTP con el correo de Gmail y una contraseña de aplicación nueva (sin espacios). Ejecute `npm run smtp:verify` para verificar conexión y autenticación; esta prueba no envía correo. El comando no exige conexión a la base ni JWT_SECRET. Para Gmail use puerto 465 con SMTP_SECURE=true; el puerto 587 requiere SMTP_SECURE=false y STARTTLS. Proteja el archivo .env. No use como contraseña de aplicación la contraseña normal de Gmail.
