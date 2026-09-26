# OSK APPS

**La navaja suiza de herramientas online** — PDF, imágenes, facturas, QR, acortador de links, calculadoras y más. Todo gratis, en un solo hub y sin registro.

> Inspirado en 123apps.com, smallpdf.com e ilovepdf.com, con módulos SaaS adicionales.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript 5 |
| Estilos | Tailwind CSS 4 + shadcn/ui (New York) + lucide-react |
| Estado | Zustand (navegación SPA) |
| Backend | Next.js API Routes (Node runtime) |
| Base de datos | Prisma ORM + SQLite (migrable a PostgreSQL cambiando el `datasource`) |
| Procesamiento | sharp (imágenes), pdf-lib + JSZip (PDF), jsPDF (facturas) |
| Cliente | qrcode, crypto-js, date-fns |
| SEO | Metadata API, sitemap dinámico, robots.txt, JSON-LD (WebSite, WebApplication, FAQPage) |

## Arquitectura

Aplicación de página única (SPA) con navegación por hash (`#/tool/<id>`) — el catálogo completo vive en `/`. Cada herramienta es un módulo independiente cargado perezosamente (code-splitting por chunk).

```
src/
├── app/
│   ├── page.tsx              → SPA: landing + vista de herramienta (hash-routing)
│   ├── layout.tsx            → metadata global (OG/Twitter/canonical), ThemeProvider
│   ├── sitemap.ts            → sitemap dinámico desde el registro de herramientas
│   ├── robots.ts             → robots.txt (allow all + sitemap)
│   └── api/
│       ├── tools/            → compress-image · convert-image · merge-pdf · split-pdf
│       └── links/ · s/       → acortador: CRUD + redirect con tracking
├── components/
│   ├── shared/               → ToolShell, FileDropzone, DownloadButton, CopyButton,
│   │                           ThemeToggle, DonateWidget (PayPal), ToolSeoContent
│   ├── home/                 → header, hero+buscador, catálogo, footer, vista de tool
│   └── tools/                → 14 herramientas (1 componente = 1 chunk)
└── lib/
    ├── tools-registry.ts     → catálogo completo (53 tools, 7 categorías)
    ├── seo-content.ts        → párrafo + FAQ por herramienta (JSON-LD FAQPage)
    ├── processors/           → image.ts (sharp) · pdf.ts (pdf-lib/JSZip)
    ├── store.ts · upload-client.ts · db.ts · utils.ts
```

**Privacidad:** los archivos de usuario se procesan **en memoria** (Buffer) y nunca se persisten. Límite de 20 MB por archivo con mensajes de error claros.

## Fase 1 — MVP (✅ COMPLETADA)

Landing con catálogo completo (53 herramientas visuales, las no implementadas marcadas "Próximamente"), buscador instantáneo, dark mode, donaciones PayPal y **14 herramientas funcionales**:

**PDF** — Combinar PDF · Dividir PDF (rangos o ZIP por página)
**Imágenes** — Comprimir imagen (calidad ajustable) · Convertir imagen (PNG/JPG/WebP)
**Texto y Documentos** — Generador de facturas (impuestos, descuentos, PDF, plantillas localStorage) · Contador de palabras
**Utilidades y Dev** — Acortador de links con analytics (clics, dispositivos, referrers, navegadores) · Generador de QR personalizable · Generador/validador de contraseñas · Formateador JSON · Convertidor Base64 · Generador de hash (MD5/SHA-1/SHA-256/SHA-512)
**Calculadoras** — Conversor de unidades (8 categorías) · Calculadora de fechas (diferencias, días hábiles, sumar/restar)

## Fase 2 — Expansión PDF, imagen y texto (Roadmap)

- [ ] Comprimir PDF · Rotar/eliminar páginas · Numerar páginas · Marca de agua
- [ ] PDF ↔ Word/Excel/PowerPoint · PDF a JPG y JPG a PDF
- [ ] Proteger/desbloquear PDF con contraseña · Firmar PDF
- [ ] Redimensionar, recortar y rotar imagen · Marca de agua en imagen · Collage
- [ ] Corrector ortográfico · Generador de contratos simples
- [ ] Convertidor Markdown ↔ PDF/Word · Comparador de texto (diff)

## Fase 3 — Video/audio + IA (Roadmap)

- [ ] Convertir/comprimir video · Extraer audio (MP4→MP3) · Cortar y unir videos · Video a GIF
- [ ] Convertir audio (MP3, WAV, OGG)
- [ ] Quitar fondo con IA · Upscale con IA · OCR de PDF escaneado
- [ ] Resumidor de texto/PDF con IA · Traductor de documentos con IA
- [ ] Generador de descripciones de producto con IA · Generador de CV con editor visual
- [ ] Calculadora de IVA/impuestos · Conversor de divisas

## Fase 4 — Productos complejos (Roadmap a futuro)

- [ ] Chatbot embebible con IA para negocios (configuración por negocio)
- [ ] Programador de posts para redes sociales (OAuth Meta/X)
- [ ] Habit tracker / Pomodoro con estadísticas

## SEO

- `sitemap.xml` **dinámico**: generado desde `tools-registry.ts` — cada herramienta `available` se indexa sola.
- `robots.txt` dinámico con referencia al sitemap.
- Metadata por herramienta (title "… gratis online | OSK APPS" + description) aplicada al abrir cada vista.
- Datos estructurados: `WebSite`, `WebApplication` (landing) y `FAQPage` (cada herramienta, con bloque de texto + FAQ visible bajo la UI).
- Open Graph y Twitter Card completos; `metadataBase` configurable.

### Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | URL de SQLite (`file:./db/custom.db` por defecto). En producción: apuntar a Postgres al migrar. |
| `NEXT_PUBLIC_SITE_URL` | URL pública del sitio (ej. `https://osk-apps.vercel.app`). Sin ella, el sitemap usa ese valor por defecto. |

## Desarrollo

```bash
bun install
bun run db:push     # aplica el schema Prisma
bun run dev         # http://localhost:3000
bun run lint        # ESLint
```

## Deploy en Vercel

1. Push del repositorio y conéctalo en Vercel.
2. Configura `NEXT_PUBLIC_SITE_URL` con la URL del subdominio de Vercel.
3. Base de datos: para el acortador usa un proveedor Postgres gestionado (Railway/Supabase/Neon) y cambia `provider = "postgresql"` en `prisma/schema.prisma`; en desarrollo local basta SQLite.
4. Deploy — el resto (sitemap, robots, metadata) se genera automáticamente.

---

© OSK APPS — Hecho con herramientas propias. Si te sirve el proyecto, considera [donar](https://www.paypal.com/donate) para mantenerlo gratis.
