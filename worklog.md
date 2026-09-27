# OSK APPS — Worklog compartido

Proyecto: plataforma "navaja suiza" de herramientas online (Next.js 16 + App Router + TypeScript + Tailwind 4 + shadcn/ui + Prisma/SQLite).

## Convenciones globales (LEER ANTES DE TRABAJAR)

- **UI 100% en español**. Código/identificadores en inglés.
- Stack: Next.js 16 App Router, TypeScript estricto, Tailwind CSS 4, shadcn/ui (carpeta `src/components/ui`), lucide-react, sonner para toasts (`import { toast } from "sonner"`), zustand (`@/lib/store`), Prisma + SQLite (`import { db } from "@/lib/db"`).
- **NO usar colores azul/indigo** como acento. Acentos: emerald, rose, amber, teal, violet, orange, zinc.
- Límite de archivos: **20 MB** por archivo, mensajes de error claros en español.
- Los archivos de usuario NUNCA se persisten: procesamiento en memoria (Buffer) y respuesta directa.
- Diseño responsive mobile-first. Cards con `p-4/p-5`, gaps `gap-3/gap-4`. Listas largas: `max-h-96 overflow-y-auto`.
- Componentes shadcn disponibles en `src/components/ui/*` (button, card, input, textarea, tabs, select, slider, switch, badge, dialog, sheet, label, separator, skeleton, scroll-area, dropdown-menu, alert, etc.).

## Componentes compartidos ya creados (REUTILIZAR)

- `@/components/shared/tool-shell` → `<ToolShell>`: contenedor estándar del contenido de una tool (`max-w-4xl space-y-6`). Usar como raíz del componente de la herramienta.
- `@/components/shared/file-dropzone` → `<FileDropzone files onFilesChange accept multiple maxFiles maxSizeMB reorderable disabled hint />`: dropzone validada (tamaño/cantidad con toast) + lista de archivos con quitar/reordenar/limpiar.
- `@/components/shared/download-button` → `<DownloadButton blob filename label loading />`: botón de descarga estándar.
- `@/components/shared/copy-button` → `<CopyButton value label size />`: copia al portapapeles con toast.
- `@/lib/upload-client` → `processFiles(endpoint, formData)` → `{ blob, filename, headers }` (lanza `Error` con mensaje del servidor en español); `downloadBlob(blob, filename)`.
- `@/lib/utils` → `cn`, `formatBytes(bytes)`, `formatDate(date)`.
- `@/lib/tools-registry` → catálogo completo (53 tools; 14 `status:'available'`), categorías, `getToolById`, `searchTools`.
- `@/lib/store` → zustand: `activeToolId`, `searchQuery`, `openTool(id)`, `goHome()`.
- `src/app/page.tsx` → SPA con hash-routing `#/tool/<id>`. **NO MODIFICAR.**
- `src/components/tools/tool-components.tsx` → mapa id→componente (dynamic import). Ya referencia los 14 archivos de tools; **NO MODIFICAR**.
- Cada herramienta: `src/components/tools/<id>.tsx` con `export default function` (sin props), raíz `<ToolShell>`.

## Paquetes instalados y listos

sharp, pdf-lib, qrcode (+types), crypto-js (+types), jspdf, jspdf-autotable, jszip, zustand, sonner, next-themes, framer-motion, recharts, date-fns, zod.

## APIs ya definidas (contrato fijo)

- `POST /api/tools/compress-image` — FormData: `file` (imagen), `quality` (0–100), `format` (`keep|jpeg|png|webp`). Devuelve binario de imagen + headers `X-Original-Size`, `X-Result-Size`.
- `POST /api/tools/convert-image` — FormData: `file`, `target` (`png|jpeg|webp`), `quality` opcional. Devuelve binario.
- `POST /api/tools/merge-pdf` — FormData: `files` (varios PDF, en orden). Devuelve `application/pdf`.
- `POST /api/tools/split-pdf` — FormData: `file`, `mode` (`ranges|all`), `ranges` (ej. "1-3,5,8-", solo si mode=ranges). Devuelve `application/pdf` o `application/zip`.
- Errores: status 4xx/5xx con JSON `{ "error": "mensaje en español" }`.
- `runtime = "nodejs"` en los route handlers que usan sharp/pdf-lib.
- Prisma models: `ShortLink { id, slug unique, url, title?, createdAt, clicks[] }`, `Click { id, linkId, createdAt, referrer?, device?, browser?, os? }` (SQLite, ya aplicado con db:push).

---
Task ID: 1
Agent: main (orquestador)
Task: Fundación del proyecto OSK APPS

Work Log:
- Instaladas dependencias: pdf-lib, qrcode, crypto-js, jspdf, jspdf-autotable, jszip (+types qrcode/crypto-js).
- Prisma schema con `ShortLink` y `Click` para el acortador de links; `db:push` aplicado (SQLite).
- Creado `src/lib/tools-registry.ts` con el catálogo COMPLETO (53 herramientas, 14 available / 39 soon) y 7 categorías con chips de color.
- Creado `src/lib/store.ts` (zustand), `src/lib/upload-client.ts` (processFiles/downloadBlob), utils extendidos (formatBytes, formatDate).
- Componentes compartidos: tool-shell, file-dropzone (validación + reordenar), download-button, copy-button, theme-toggle.
- Stubs de las 14 tools en `src/components/tools/*.tsx` (los agentes los sobrescribirán) + mapa dynamic-import en tool-components.tsx.
- `layout.tsx`: metadata SEO en español, lang="es", ThemeProvider (next-themes), Toaster (sonner).
- `page.tsx`: SPA con hash-routing (#/tool/<id>), sincronización con botón atrás, layout sticky-footer (min-h-screen flex-col + footer mt-auto).
- Home components: site-header, site-footer, hero (buscador + accesos rápidos), catalog (secciones por categoría + resultados de búsqueda), tool-card (badge "Próximamente" + toast), tool-view.
- Lint limpio, dev server 200 OK.

Stage Summary:
- Fundación completa y compilando. Los agentes de tools deben crear SOLO sus archivos asignados reutilizando los componentes compartidos descritos arriba.
---
Task ID: 2-d
Agent: full-stack-developer
Task: Acortador de links full-stack con analytics y redirect

Work Log:
- Creado `src/app/api/links/route.ts`: POST (valida URL con new URL + protocolo http/https, customSlug con regex ^[a-z0-9-]{3,30}$, colisión → 409, slug auto de 7 chars base62 con crypto.randomBytes y reintento por colisión, título máx 100) y GET (lista ordenada por createdAt desc con totalClicks via _count y lastClickAt via clicks take 1; `dynamic = "force-dynamic"`). Retorna 201 { slug, path, shortUrl (derivado de x-forwarded-proto/host con fallback), url, title, createdAt }.
- Creado `src/app/api/links/[slug]/route.ts`: GET detalle (totalClicks, clicksByDay 14 días completados en JS desde hoy hacia atrás con key YYYY-MM-DD local, topReferrers top 5 con hostname y null → "Directo", devices conteo completo, browsers top 5, recentClicks últimos 10 con id) y DELETE (borra clicks explícitamente + link; la relación ya es Cascade). 404 "Link no encontrado" si no existe.
- Creado `src/app/api/s/[slug]/route.ts`: redirect 302 con `Cache-Control: no-store`; registra Click (device bot/mobile/tablet/desktop y browser Edg/OPR/Firefox/Chrome/Safari/Otro y os Windows/Android/iOS/macOS/Linux/Otro parseando user-agent; referrer header "referer" recortado a 500 chars, null si no hay). El fallo al registrar el clic no bloquea el redirect. Slug inexistente → 404 con HTML estilizado inline en español ("Link no encontrado" + link a "/"); error 500 también con HTML inline.
- Sobrescrito `src/components/tools/link-shortener.tsx`: dashboard client completo con ToolShell. Card "Crear link corto" (input URL, slug personalizado con adornment "/api/s/" y normalización a minúsculas, título opcional, botón Acortar con Loader2) y resultado destacado con borde emerald (URL corta font-mono, CopyButton, "Abrir" con href relativo /api/s/<slug> target _blank, "Ver estadísticas").
- Lista "Tus links": fetch GET /api/links al montar con refresh reutilizable, skeleton de carga, empty state con icono Link2 ("Aún no has acortado ningún link"), filas con título/url truncados, URL corta mono + CopyButton, Badge de clics con Eye, fecha formatDate + último clic relativo (Intl.RelativeTimeFormat es), botón Estadísticas y eliminar con AlertDialog de confirmación. Lista con max-h-96 overflow-y-auto y scrollbar estilizado.
- Sheet de estadísticas: fetch GET /api/links/[slug] al abrir con estados loading (skeletons)/error (reintentar)/datos. Incluye total de clics grande, gráfico de barras de 14 días construido con divs (flex items-end, altura proporcional bg-primary, tooltip title="N clics — 12 may", eje con días abreviados), dispositivos con iconos lucide (Smartphone/Tablet/Monitor/Bot), top referers y navegadores como listas con conteo, últimos 10 clics con fecha relativa + referrer hostname + badge de dispositivo.
- Errores de red y del server manejados con toast.error (sonner) usando data.error; toasts de éxito al crear/eliminar. Refresco de lista tras crear/eliminar.
- ESLint limpio en los 4 archivos (`bunx eslint`); `tsc --noEmit` sin errores en ellos. Verificado end-to-end con curl: POST (201/400/409), redirect 302 + no-store, registro de clics por UA (desktop Chrome+referer Google, mobile, bot, tablet), analytics correcto (devices/referrers/browsers/14 días), DELETE 200 y 404 posterior. Datos de prueba eliminados (DB queda limpia).

Stage Summary:
- Acortador de links full-stack operativo: 3 route handlers (crear/listar, detalle/eliminar, redirect con tracking) + dashboard client con gráfico de barras sin dependencias extra (solo divs) y analytics de dispositivo/navegador/OS/referer.
- Contrato de errores homogéneo { error: "mensaje en español" } con status 400/404/409/500; Next.js 16 con params como Promise y await en todos los handlers dinámicos.
- Archivos producidos: src/app/api/links/route.ts, src/app/api/links/[slug]/route.ts, src/app/api/s/[slug]/route.ts, src/components/tools/link-shortener.tsx (los 4 únicos permitidos; no se tocó page.tsx, shared components ni schema).
- Riesgo menor conocido: iPads con "Mobile/15E148" en el UA se clasifican como mobile (sigue el orden de regex especificado mobile antes de tablet). El shortUrl absoluto depende de x-forwarded-proto/host; el frontend usa rutas relativas para no depender de él.
---
Task ID: 2-b
Agent: full-stack-developer
Task: Herramientas cliente — contador palabras, QR, contraseñas, JSON, Base64, hash

Work Log:
- Leí worklog.md y las APIs de los componentes compartidos (ToolShell, CopyButton, DownloadButton, utils) antes de empezar.
- word-counter.tsx: textarea min-h-48 con stats en vivo (useMemo): palabras, caracteres, sin espacios, oraciones, párrafos, tiempo de lectura (200 ppm, "X min Y s"); grid grid-cols-2 sm:grid-cols-3 de stat cards; top 5 palabras frecuentes excluyendo stopwords españolas y tokens de 1 char; botón "Limpiar texto".
- qr-generator.tsx: QRCode.toDataURL en vivo (useEffect + debounce 300ms + ref de generación para evitar carreras), slider tamaño 128-1024 (step 16, default 512), margen 0-10 (default 2), color inputs (dark #09090b / light #ffffff), Select corrección L/M/Q/H (default M); placeholder si texto vacío, Alert inline + toast.error si el texto excede la capacidad; descarga PNG vía dataURL->Blob->DownloadButton ("codigo-qr.png").
- password-generator.tsx: Tabs Generador/Validador. Generador: longitud 8-64 (default 16), switches mayúsculas/minúsculas/números/símbolos + excluir ambiguos (l,1,I,O,0,o), generación con crypto.getRandomValues y rejection sampling (sin Math.random, sin sesgo de módulo), entropía = length*log2(pool) con barra Progress coloreada (Débil/Media/Fuerte/Excelente) y CopyButton. Validador: input con toggle Eye/EyeOff, entropía estimada, barra de fortaleza y checklist de 6 reglas con Check/X (longitud 12+, mayús+minús, números, símbolos, sin secuencias obvias abc/123/qwerty/password, sin repeticiones en exceso). Nota de privacidad local.
- json-formatter.tsx: textarea mono min-h-40 con contador de caracteres, ejemplo JSON precargado; botones Formatear (Select indentación 2/4/Tab) y Minificar, switch "Ordenar claves" (sortKeysDeep recursivo); salida en pre max-h-96 overflow-auto + CopyButton + DownloadButton "formateado.json" (application/json) + stats (caracteres, líneas, formatBytes); errores de JSON.parse en Alert destructivo con línea/columna calculadas desde "position N" del mensaje.
- base64-converter.tsx: Tabs Codificar/Decodificar con conversión en vivo (useMemo); UTF-8 correcto con TextEncoder + btoa por chunks de 0x8000; decodificación con normalización URL-safe (acepta +/ y -_, relleno automático) + TextDecoder, error en Alert destructivo "El texto no es Base64 válido"; switch URL-safe (salida con -_ y sin =); CopyButton en entrada/salida, descargas .txt y botón para usar el resultado como entrada del otro modo; formatBytes para tamaño de bytes.
- hash-generator.tsx: cálculo en vivo con crypto-js (MD5, SHA-1, SHA-256, SHA-512) vía useMemo; switch Mayúsculas; 4 filas con Badge de color por algoritmo, bits, hash font-mono text-xs break-all line-clamp-1 con botón expandir/contraer y CopyButton por fila; tamaño del input con formatBytes; nota de privacidad ("tu texto nunca sale del dispositivo").
- Calidad: bunx eslint sobre los 6 archivos (0 errores) y tsc --noEmit sin errores en ellos; dev server compila OK; UI 100% en español, sin emojis, sin azul/indigo (acentos emerald/amber/rose/violet/zinc).

Stage Summary:
- 6 herramientas 100% cliente listas y reutilizables: word-counter, qr-generator, password-generator, json-formatter, base64-converter, hash-generator (sobrescritos en src/components/tools/).
- Decisiones: generación QR con id de generación para descartar resultados obsoletos; contraseñas con Web Crypto y rejection sampling; Base64 con normalización URL-safe siempre al decodificar; sortKeys aplicado también al minificar; sortKeys/hashes memoizados.
- Solo se tocaron los 6 archivos permitidos; no se añadieron dependencias (qrcode y crypto-js ya instaladas). Sin backend ni persistencia de datos de usuario.
---
Task ID: 2-a
Agent: full-stack-developer
Task: Herramientas de archivo — compress/convert imagen + merge/split PDF + APIs

Work Log:
- Creado `src/lib/processors/image.ts` (sharp, en memoria): `compressImage` (format="keep" respeta jpeg/png/webp, otros->jpeg; jpeg con mozjpeg+flatten blanco, webp con quality, png compressionLevel 9), `convertImage` (png/jpeg/webp con quality opcional), `imageExtension`/`imageMimeType`. Entrada validada con `sharp().metadata()` (jpeg, png, webp, gif, tiff, avif) y errores en español.
- Creado `src/lib/processors/pdf.ts` (pdf-lib + jszip, en memoria): `mergePdfs` (create + load con ignoreEncryption + copyPages, error por archivo con su nombre), `parsePageRanges` ("1-3,5,8-" 1-based inclusivo, abierto hasta el final, dedup y errores claros tipo "El documento solo tiene N páginas"), `splitPdfByRanges` (un PDF con las páginas pedidas) y `splitPdfAllPages` (un PDF por página en ZIP "pagina-N.pdf").
- Creadas 4 API routes (`runtime = "nodejs"`, FormData -> Buffer -> binario, sin disco): `compress-image`, `convert-image`, `merge-pdf`, `split-pdf`. Todas: límite 20 MB (413), 400 con JSON `{ error }` en español, respuesta con `Content-Type`, `Content-Disposition` (attachment + filename*=UTF-8''), `X-Original-Size`, `X-Result-Size`; extras: `X-File-Count` (merge) y `X-Page-Count` (split). Nombres de salida: `base-comprimido.ext`, `base.ext` (conversión), `combinado.pdf`, `base-paginas.pdf`, `base-paginas.zip`.
- Sobrescritos los 4 stubs frontend (`export default`, raíz `<ToolShell>`, UI 100% español): compress-image (slider calidad + select formato, preview original vs resultado con revocación de object URLs, badge de % ahorrado con emerald/ámbar, botón "Procesar otra imagen"), convert-image (segmented control de destino, slider solo para jpeg/webp), merge-pdf (dropzone múltiple reorderable max 15, contador "N / 15", texto de orden, valida .pdf en cliente), split-pdf (Tabs "Extraer rango" con Input "Ej: 1-3, 5, 8-" y "Separar todas las páginas" con explicación del ZIP). Todos usan FileDropzone + processFiles + DownloadButton + formatBytes, toasts sonner, Loader2 en botones, estados loading/éxito/error.
- Verificado con ESLint (0 errores, 0 warnings en los 10 archivos), `tsc --noEmit` limpio para mis archivos y pruebas reales con curl contra el dev server: compresión PNG 2476B->837B, conversión png->jpeg (filename correcto), merge de 2 PDFs (10+1 páginas), split ranges "1-3, 5, 8-" = 7 páginas exactas, ZIP con pagina-1..10.pdf, y errores validados (calidad fuera de rango, <2 PDFs, PDF corrupto, rangos fuera de límites/formato inválido).

Stage Summary:
- 4 herramientas de archivo completas (frontend + API), cumpliendo el contrato de APIs fijado: binario con X-Original-Size/X-Result-Size y errores 4xx JSON en español. Procesamiento 100% en memoria con sharp/pdf-lib/jszip, sin paquetes nuevos y sin tocar page.tsx, registro ni componentes compartidos.
- Decisiones: entrada de imágenes ampliada a gif/tiff/avif (sharp los lee; en compress "keep" cae a jpeg según contrato); JPEG siempre con flatten blanco para evitar fondos negros con alfa; extras de cabecera X-File-Count/X-Page-Count usados por la UI (aditivos, no rompen el contrato). Riesgo menor: PNG sobre comprimido puede pesar igual o más que el original (sin pérdida); la UI lo comunica honestamente con badge ámbar.
---
Task ID: 2-c
Agent: full-stack-developer
Task: Conversor de unidades, calculadora de fechas y generador de facturas con PDF

Work Log:
- Leí worklog.md y los componentes compartidos (ToolShell, CopyButton, formatDate) antes de empezar. Hallazgo clave: los intentos anteriores cancelados SÍ dejaron implementaciones completas en los 3 archivos (no stubs), así que en vez de reescribir desde cero se auditó línea por línea contra la especificación y se corrigieron las desviaciones (más rápido y sin riesgo).
- unit-converter.tsx (verificado, sin cambios): Tabs de 8 categorías (Longitud, Masa, Temperatura, Volumen, Área, Velocidad, Almacenamiento, Tiempo) con factores a base; temperatura con conversión afín real C/F/K (toCelsius/fromCelsius); input numérico default 1, Select "De"/"A" con etiquetas "Kilómetro (km)", botón swap ArrowUpDown, resultado en card grande con formato inteligente (hasta 6 decimales, coma decimal es-ES, exponencial solo en extremos), lista "Equivalencias" scrollable (max-h-96) a todas las demás unidades, conversión instantánea con useMemo, CopyButton del resultado.
- date-calculator.tsx (verificado, sin cambios): Tab "Diferencia entre fechas" (defaults hoy y hoy+30) con desglose años/meses/días (algoritmo propio con préstamo de días del mes anterior), total días (differenceInCalendarDays), días hábiles (differenceInBusinessDays), semanas + resto; fechas con format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es }); maneja fechas invertidas (valor absoluto con aviso). Tab "Sumar o restar": ToggleGroup Sumar/Restar, cantidad default 30, Select Días/Semanas/Meses/Años con add/sub de date-fns; resultado con fecha larga + día de semana + diferencia en días desde hoy. Validación con isValid + mensajes ámbar. CopyButton del desglose.
- invoice-generator.tsx (auditado y corregido para cumplir la spec al pie de la letra): (1) IVA global cambiado de Select con presets a Input number 0-100 (aria-describedby con hint); (2) forma de plantillas en localStorage ajustada a { id, nombre, datos } (era { id, name, savedAt, ... }) con normalización defensiva al cargar (normalizeParty/normalizeLine/normalizeConfig + isValidTemplate); (3) "Nueva factura" ahora resetea directamente + toast.success (antes pedía confirmación); (4) encabezado de la tabla del PDF "Cantidad" (era "Cant."); (5) eliminados cn() triviales e import sobrante.
- Flujo de plantillas: lectura perezosa useState(readTemplates) al montar (el componente se carga con dynamic ssr:false, así que solo corre en cliente; el intento con useEffect + setState directo fue rechazado por la regla react-hooks/set-state-in-effect), guardado con try/catch + toast.error, sobrescribe por nombre duplicado, Select + Cargar/Eliminar con estados deshabilitados y validaciones con toast.
- PDF jsPDF: A4 vertical mm monocromático; "FACTURA" + número grandes, emisor (izq) / cliente (der) con splitTextToSize para textos largos, tabla autoTable (Descripción/Cantidad/Precio unit./Impuesto/Importe, overflow linebreak, saltos de página automáticos), totales a la derecha (subtotal, descuento condicional, impuestos, TOTAL destacado), notas con wrap, footer en todas las páginas "Generado con OSK APPS — Herramientas online gratis" + fecha + paginado; doc.save("factura-<numero>.pdf") con sanitización del número. Validación previa: nombre emisor, nombre cliente y ≥1 línea con descripción; faltantes listados en toast.error.
- Resumen con useMemo y redondeo round2: subtotal por línea, descuento global % sobre subtotal (impuestos escalados proporcionalmente), Intl.NumberFormat("es", { style: "currency", currency }) memoizado por moneda.
- Calidad: bunx eslint sobre los 3 archivos → 0 errores/0 warnings; tsc --noEmit sin errores en ellos; dev.log sin errores de compilación (GET / 200). UI 100% en español, sin emojis, sin azul/indigo (acentos teal/violet/rose/emerald/amber).

Stage Summary:
- 3 herramientas cliente completas y operativas: unit-converter (8 categorías, conversión instantánea), date-calculator (2 pestañas con date-fns + locale es) e invoice-generator (módulo con estado del MVP: PDF pro con autoTable, plantillas en localStorage "osk-invoice-templates" como { id, nombre, datos }, monedas COP/USD/EUR/MXN/PEN/ARS, IVA por línea + descuento global).
- Decisiones: conservé y audité las implementaciones existentes de los intentos cancelados en vez de reescribir (menor riesgo, mismos archivos permitidos); IVA global como Input number y plantillas { id, nombre, datos } estrictamente según spec; plantillas leídas con inicializador perezoso de useState porque la regla react-hooks/set-state-in-effect prohíbe setState síncrono en useEffect (equivalente funcional al montar, ssr:false).
- Archivos producidos (los 3 únicos permitidos): src/components/tools/unit-converter.tsx, src/components/tools/date-calculator.tsx, src/components/tools/invoice-generator.tsx. Sin dependencias nuevas (jspdf + jspdf-autotable + date-fns ya instaladas), sin secciones SEO/FAQ (las añade el layout), sin tocar page.tsx ni componentes compartidos.
- Riesgos menores: descuento global reparte proporcionalmente el impuesto por línea (criterio documentado en el PDF como "Total impuestos"); plantillas antiguas con la forma previa (name/savedAt) se descartan silenciosamente por isValidTemplate (no hay datos de usuarios reales aún); crypto.randomUUID tiene fallback para entornos sin soporte.
---
Task ID: 3
Agent: main (orquestador)
Task: Widget de donación PayPal + SEO pre-deploy + integración final Fase 1

Work Log:
- Donación: creado src/components/shared/donate-widget.tsx (FAB rose bottom-right + panel flotante con formulario oficial PayPal hosted_button_id NKKNKSZS9PHTE, cierre por Escape/click-fuera/X, target _blank); store con donateOpen; accesos desde header (botón corazón) y footer; Toaster movido a top-center para no chocar con el FAB.
- SEO punto 1: layout.tsx con metadataBase (NEXT_PUBLIC_SITE_URL con fallback osk-apps.vercel.app), canonical /, robots index/follow, OG/Twitter completos; ToolView aplica metadata dinámica por herramienta (document.title = "<Tool> gratis online | OSK APPS" + meta description) — la app es SPA de ruta única por requisito del sandbox, así que la metadata por tool es client-side.
- SEO punto 2: src/lib/seo-content.ts (intro + 3 FAQ para las 14 tools), src/components/shared/tool-seo-content.tsx (párrafo + FAQ visible + JSON-LD FAQPage) renderizado bajo la UI de cada tool desde tool-view.tsx SIN tocar los componentes de las tools.
- SEO punto 3: src/app/sitemap.ts dinámico desde AVAILABLE_TOOLS del registro (home + #/tool/<id> de las 14), verificado con curl: incluye todas.
- SEO punto 4: src/app/robots.ts (allow all + sitemap); eliminado public/robots.txt estático que causaba conflicto 500 "conflicting public file and page file".
- SEO punto 5: auditados los IDs de las rutas-hash (merge-pdf, compress-image...); se informan al usuario antes de renombrar (ver reporte).
- JSON-LD adicional en landing: WebSite + WebApplication con featureList de tools disponibles.
- Task 2-c completado en 3er intento de agente: unit-converter, date-calculator e invoice-generator (facturas con jsPDF+autotable, plantillas localStorage, IVA/descuento) auditados y corregidos por el agente.
- README.md completo: stack, arquitectura, Fase 1 ✓, Roadmaps Fases 2/3/4, variables de entorno, deploy Vercel.
- Lint global 0 errores; dev.log limpio; /sitemap.xml y /robots.txt verificados con curl.

Stage Summary:
- Fase 1 al 100%: 14 herramientas funcionales + acortador con DB + donaciones PayPal + SEO pre-deploy completo.
- Limitación conocida documentada: URLs de herramientas son fragmentos hash (#/tool/<id>) por arquitectura SPA del sandbox; migración a rutas reales /tools/... propuesta para post-deploy.
---
Task ID: 3-c
Agent: general-purpose
Task: Redactar README.md completo en español

Work Log:
- Leí worklog.md para contexto y luego package.json (scripts dev/build/lint/db:push/db:generate/db:migrate/db:reset), prisma/schema.prisma (modelos ShortLink y Click con onDelete Cascade e @@index), src/lib/tools-registry.ts completo (53 tools, 14 available, 7 categorías, campo slug + getToolUrl → /tools/<categoría>/<slug>), seo-content.ts (50 líneas, estructura intro+FAQ para JSON-LD FAQPage), src/app/sitemap.ts, robots.ts y layout.tsx (NEXT_PUBLIC_SITE_URL con fallback osk-apps.vercel.app, metadataBase, canonical, OG/Twitter, lang es).
- Verifiqué que src/app/tools/[category]/[tool]/page.tsx NO existe todavía (glob en src/app); el sitemap.ts actual aún genera URLs #/tool/<id> y tools-registry.ts aparece modificado en git (migración de rutas en curso por agente paralelo). Documenté el README según la especificación de rutas /tools/<categoría>/<slug> (formato pedido explícitamente y soportado por el registro), dejando la discrepancia como advertencia.
- Confirmé db/custom.db (DATABASE_URL en .env) y que no existe archivo LICENSE (la sección de licencia MIT es declarativa).
- Conté herramientas disponibles por categoría desde el registro para la tabla de conteo: pdf 2/16, imagen 2/9, video 0/7, texto 2/6, dev 6/7, calculadoras 2/4, ia 0/4 = 14/53.
- Escribí /home/z/my-project/README.md en español con: encabezado + tagline + badges shields.io (Next.js 16, TypeScript 5, MIT); ✨ Características (stateless en memoria 20MB, módulos con estado: facturas con PDF y acortador con analytics, dark/light, buscador, responsive, widget PayPal); 🧰 Catálogo (tabla 7 categorías X/Y, badge "Próximamente", tabla de las 14 tools con ruta /tools/<categoría>/<slug>); 🚀 Puesta en marcha (Node 20+/Bun, clone, bun install, bun run db:push → db/custom.db, bun run dev → :3000, tabla de scripts extra); 🔍 SEO (rutas en español, generateMetadata "[Nombre] gratis online | OSK APPS", OG, sitemap dinámico sin URLs hardcodeadas, robots.txt, FAQ JSON-LD, NEXT_PUBLIC_SITE_URL); 🗄️ Base de datos (Prisma+SQLite db/custom.db, modelos, privacidad de archivos); ▲ Deploy Vercel (4 pasos + aviso serverless + migración SQLite→Postgres con snippet prisma, Neon/Supabase/Railway, npx prisma db push, @prisma/adapter-pg si aplica); 🗺️ Roadmap Fases 2/3/4; 🤝 Donaciones; 📄 Licencia MIT.
- No toqué ningún archivo de src/, prisma/ ni configuración: solo README.md y worklog.md.

Stage Summary:
- README.md completo, profesional y en español (9 secciones H2 + encabezado con badges) con datos reales verificados del proyecto: 53/14/39 herramientas, conteos por categoría, las 14 URLs con slugs españoles del registro, scripts de bun, esquema Prisma y variables de entorno.
- Advertencias heredadas al orquestador: (1) el README documenta rutas /tools/<categoría>/<slug> y generateMetadata según la spec de Fase 1, pero al momento de escribirlo src/app/tools/[category]/[tool]/page.tsx no existía y sitemap.ts aún apunta a #/tool/<id> — la tarea paralela de migración de rutas debe completarse (y actualizar sitemap.ts a getToolUrl) para que el README sea 100 % exacto; (2) no hay archivo LICENSE en el repo, solo la mención MIT en el README.


---
Task ID: 3-b
Agent: orchestrator (Z.ai Code)
Task: Implementar prompt SEO pre-deploy — migración a rutas reales en español + metadata por página + sitemap/robots + verificación E2E y push a GitHub

Work Log:
- Agregado campo `slug` en español a los 53 tools de tools-registry.ts + helpers getToolBySlug/getToolUrl
- Creada ruta real src/app/tools/[category]/[tool]/page.tsx: generateStaticParams (53 páginas), dynamicParams=false, generateMetadata (title "[Nombre] gratis online | OSK APPS", description ~150 chars, canonical, OG locale es), JSON-LD SoftwareApplication, breadcrumb
- Creado ComingSoonView: páginas reales para las 39 herramientas "próximamente" con contenido textual + links internos
- Creado LegacyHashRedirect: compatibilidad #/tool/<id> → /tools/<categoría>/<slug>
- Migrada navegación a Links reales: tool-card, hero (populares), site-header (/#catalogo)
- Refactor: header/footer/donate-widget movidos a layout.tsx (comunes a todas las páginas); store.ts simplificado (solo searchQuery + donateOpen); ToolView simplificado (metadata ahora es server-side)
- sitemap.ts: URLs reales /tools/<cat>/<slug> para TODAS las herramientas (54 URLs, prioridad 0.9/0.6)
- robots.ts: Allow / + Disallow /api/ + sitemap
- README.md por subagente (Task 3-c) + LICENSE MIT agregada
- E2E con agent-browser: home, navegación card→/tools/pdf/unir-pdf, merge de 2 PDFs vía UI (POST 200, PDF válido), legacy redirect, página próximamente, widget PayPal, buscador, móvil 390px, footer sticky, 0 errores de consola

Stage Summary:
- SEO prompt 100% implementado: metadata por página ✓, contenido+FAQ sin tocar UI de tools ✓, sitemap dinámico completo (54 URLs) ✓, robots ✓, rutas descriptivas en español ✓
- Push checkpoint (pre-SEO) y push final a github.com/rafaelg0315g-lab/Osk-apps rama main

---
Task ID: 4
Agent: orchestrator (Z.ai Code)
Task: Sección PROFESIONAL — punto 0: estructura, login ligero NextAuth, modelo User/Project y sistema de proyectos (esqueleto sin editores)

Work Log:
- Confirmado el patrón "IA controla operaciones ya construidas" (JSON de operaciones; único generativo: inpainting) y el orden de construcción acordado
- Agregados modelos User + Project a prisma/schema.prisma (data como String: SQLite no soporta Json de Prisma) y aplicado con db:push
- Instalado bcryptjs (next-auth v4 ya estaba en el proyecto); .env con NEXTAUTH_SECRET y NEXTAUTH_URL
- Login ligero: lib/auth.ts (Credentials + JWT + bcrypt), /api/auth/[...nextauth], /api/auth/register, types/next-auth.d.ts
- APIs de proyectos: /api/projects (GET lista con ?type, POST crea) y /api/projects/[id] (GET/PATCH/DELETE) con sesión obligatoria y ownership (proyecto ajeno → 404); límites de tamaño en data/thumbnail
- UI: AuthDialog global (login/registro con pestañas), UserMenu en header (avatar + Mis proyectos + Cerrar sesión), nav "PROFESIONAL" con acento ámbar
- Rutas: /pro (landing 3 cards + cómo funciona), /pro/[type] (Mis proyectos, guard de sesión → /pro?login=1), /pro/[type]/[projectId] (esqueleto del editor con nombre editable y autoguardado)
- Componentes: providers.tsx (SessionProvider), pro-cards, projects-view (crear/eliminar con AlertDialog), editor-shell (debounce 700ms + blur, indicador Guardando/Guardado)
- README actualizado (sección OSK PROFESIONAL + env vars)

Stage Summary:
- E2E verificado con agent-browser: registro auto-login, guard 307 anónimo, crear proyecto (UUID), renombrar con autoguardado persistido en DB, listar, eliminar con confirmación, menú usuario, 404 tipo inválido, 401 APIs sin sesión, lint limpio, sin errores en dev.log
- Listo para Fase 1 del prompt PRO: editor de imagen (Konva) sobre este esqueleto
