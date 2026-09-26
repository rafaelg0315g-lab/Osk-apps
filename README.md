<div align="center">

# 🧰 OSK APPS

**La navaja suiza de herramientas online: PDF, imágenes, facturas, QR, acortador de links, calculadoras y más.**

Gratis, rápido, sin registro y 100 % en español.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Licencia](https://img.shields.io/badge/Licencia-MIT-green)

</div>

---

## ✨ Características

- **Catálogo de 53 herramientas en 7 categorías**, visible completo desde el día 1: las herramientas aún no desarrolladas se muestran con un badge «Próximamente».
- **Herramientas stateless (privacidad por diseño):** los archivos que subes (PDF, imágenes, etc.) se procesan **en memoria** y se devuelven directamente al navegador. **Nunca se guardan en disco ni en la base de datos.** Límite de **20 MB por archivo**.
- **Módulos con estado:**
  - **Generador de facturas** — facturas profesionales con cálculo automático de impuestos y descuentos, plantillas reutilizables y **exportación a PDF**.
  - **Acortador de links** — URLs cortas con **analytics de clics**: gráfico de los últimos 14 días, referrers, dispositivos, navegadores y sistema operativo, persistidos en base de datos.
- **Dark / light mode** con detección automática del tema del sistema (`next-themes`).
- **Buscador integrado** por nombre, descripción y palabras clave.
- **Diseño responsive** mobile-first.
- **Widget flotante de donación PayPal** integrado en toda la app.

## 🧰 Catálogo de herramientas

El catálogo completo está definido en un único registro (`src/lib/tools-registry.ts`), de donde se alimentan la interfaz, el buscador y el sitemap.

| Categoría | Listas | Total |
| --- | :---: | :---: |
| PDF | 2 | 16 |
| Imágenes | 2 | 9 |
| Video y Audio | 0 | 7 |
| Texto y Documentos | 2 | 6 |
| Utilidades y Dev | 6 | 7 |
| Calculadoras y Conversores | 2 | 4 |
| Inteligencia Artificial | 0 | 4 |
| **Total** | **14** | **53** |

### Herramientas disponibles (14)

| Herramienta | Categoría | Ruta |
| --- | --- | --- |
| Combinar PDF | PDF | `/tools/pdf/unir-pdf` |
| Dividir PDF | PDF | `/tools/pdf/dividir-pdf` |
| Comprimir imagen | Imágenes | `/tools/imagen/comprimir-imagen` |
| Convertir imagen | Imágenes | `/tools/imagen/convertir-imagen` |
| Generador de facturas | Texto y Documentos | `/tools/texto/generador-facturas` |
| Contador de palabras | Texto y Documentos | `/tools/texto/contador-palabras` |
| Acortador de links | Utilidades y Dev | `/tools/dev/acortador-links` |
| Generador de QR | Utilidades y Dev | `/tools/dev/generador-qr` |
| Generador de contraseñas | Utilidades y Dev | `/tools/dev/generador-contrasenas` |
| Formateador JSON | Utilidades y Dev | `/tools/dev/formateador-json` |
| Convertidor Base64 | Utilidades y Dev | `/tools/dev/convertidor-base64` |
| Generador de hash | Utilidades y Dev | `/tools/dev/generador-hash` |
| Conversor de unidades | Calculadoras y Conversores | `/tools/calculadoras/conversor-unidades` |
| Calculadora de fechas | Calculadoras y Conversores | `/tools/calculadoras/calculadora-fechas` |

Los slugs en español de cada URL se definen en el campo `slug` de `src/lib/tools-registry.ts`.

## 🚀 Puesta en marcha local

**Requisitos:** Node.js 20+ o [Bun](https://bun.sh).

```bash
# 1. Clonar el repositorio
git clone https://github.com/<tu-usuario>/osk-apps.git
cd osk-apps

# 2. Instalar dependencias
bun install        # o: npm install

# 3. Crear la base de datos SQLite
bun run db:push    # crea/regenera db/custom.db desde prisma/schema.prisma
                   # (requiere DATABASE_URL en .env, p. ej. "file:./db/custom.db")

# 4. Arrancar el servidor de desarrollo
bun run dev        # → http://localhost:3000
```

Otros scripts útiles:

| Script | Descripción |
| --- | --- |
| `bun run lint` | ESLint sobre todo el proyecto |
| `bun run build` | Build de producción (output standalone) |
| `bun run db:generate` | Regenera el cliente Prisma |
| `bun run db:migrate` / `bun run db:reset` | Migraciones / reinicio de la base |

## 🔍 SEO implementado

- **Rutas reales y descriptivas en español por herramienta** (`/tools/pdf/unir-pdf`, `/tools/imagen/comprimir-imagen`, …), con slugs gestionados desde el registro de herramientas.
- **Metadata por página** con `generateMetadata`: título con el patrón **«[Nombre] gratis online | OSK APPS»**, descripción, canonical y **Open Graph / Twitter Card**.
- **`sitemap.xml` dinámico** (`src/app/sitemap.ts`): se genera desde el registro de herramientas, **sin URLs hardcodeadas** — toda herramienta marcada como disponible se indexa automáticamente.
- **`robots.txt`** generado desde `src/app/robots.ts` (rastreo permitido + referencia al sitemap).
- **Contenido textual + preguntas frecuentes (FAQ)** bajo cada herramienta (`src/lib/seo-content.ts`), con **datos estructurados JSON-LD de tipo `FAQPage`** para resultados enriquecidos en Google.
- Variable de entorno **opcional** `NEXT_PUBLIC_SITE_URL` (p. ej. `https://osk-apps.vercel.app`) para construir las **URLs absolutas** del sitemap, robots y canonicals.

## 🗄️ Base de datos

- **Prisma ORM + SQLite** por defecto: esquema en `prisma/schema.prisma` y archivo de base en **`db/custom.db`** (configurado vía `DATABASE_URL` en `.env`).
- Modelos:
  - **`ShortLink`** — links acortados (`slug` único, `url`, `title` opcional, `createdAt`).
  - **`Click`** — un registro por clic con `referrer`, `device`, `browser`, `os` y `createdAt`; índice compuesto `(linkId, createdAt)` y borrado en cascada junto al link.
- 🔒 **Los archivos subidos a las herramientas NUNCA se guardan** ni en disco ni en la base de datos: solo se persisten los links acortados y sus clics.

## ▲ Deploy en Vercel

1. Haz **push del repositorio a GitHub**.
2. **Importa el repo en Vercel** (*Add New → Project*); el framework **Next.js se detecta automáticamente**.
3. Configura la variable de entorno **`NEXT_PUBLIC_SITE_URL`** con el dominio asignado (p. ej. `https://osk-apps.vercel.app`).
4. **Deploy.** 🎉

> ⚠️ **Importante en producción:** el filesystem de las funciones serverless es efímero, por lo que **SQLite solo sirve para desarrollo local**. En producción conviene usar **PostgreSQL**.

**Migración SQLite → PostgreSQL:**

1. Cambia el datasource en `prisma/schema.prisma`:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Apunta `DATABASE_URL` a una base **Postgres gestionada** (Neon, Supabase, Railway…).
3. Ejecuta `npx prisma db push` para crear las tablas en la nueva base.
4. Si usas **driver adapters**, agrega el driver de Postgres (`@prisma/adapter-pg`) y configúralo en la instanciación del cliente Prisma.

## 🗺️ Roadmap

- **Fase 2 — Ampliar catálogo:** conversiones PDF↔Office, PDF a JPG, JPG a PDF, herramientas de video/audio con `ffmpeg.wasm`, redimensionar y recortar imagen, corrector ortográfico y comparador de texto.
- **Fase 3 — Cuentas de usuario:** autenticación con **NextAuth**, historial y guardado de documentos, facturas guardadas por usuario, generador de CV con estado y más módulos con estado.
- **Fase 4 — Monetización y escala:** plan premium, API pública, cuentas para equipos/empresas, **PWA** con soporte offline e internacionalización (**i18n**).

## 🤝 Donaciones

El proyecto es y será gratuito. La app integra un **widget flotante de donación PayPal** (disponible desde el header, el footer y el botón flotante) para quien quiera apoyar el mantenimiento y el desarrollo de nuevas herramientas. 💚

## 📄 Licencia

Distribuido bajo la licencia **MIT**. Libre para usar, estudiar, modificar y compartir.
