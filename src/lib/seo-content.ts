/**
 * Contenido SEO por herramienta: párrafo introductorio + preguntas frecuentes.
 * Se muestra bajo la UI funcional de cada herramienta y alimenta el JSON-LD
 * de tipo FAQPage para resultados enriquecidos en Google.
 */

export interface ToolFaqItem {
  q: string;
  a: string;
}

export interface ToolSeoContent {
  /** Párrafo corto: qué hace la herramienta y para quién sirve. */
  intro: string;
  faq: ToolFaqItem[];
}

export const TOOL_SEO: Record<string, ToolSeoContent> = {
  "merge-pdf": {
    intro:
      "Con Combinar PDF puedes unir varios documentos PDF en un solo archivo, en el orden que tú decidas. Es ideal para consolidar reportes, contratos, facturas o escaneos sueltos en un documento único y ordenado, sin instalar ningún programa.",
    faq: [
      {
        q: "¿Cuántos PDF puedo combinar a la vez?",
        a: "Hasta 15 archivos por operación, con un máximo de 20 MB por archivo. Puedes reordenarlos antes de combinar arrastrándolos o usando las flechas de la lista.",
      },
      {
        q: "¿Se pierde calidad al unir los PDF?",
        a: "No. Las páginas se copian tal cual al documento final, conservando texto, imágenes y formatos originales.",
      },
      {
        q: "¿Mis documentos se guardan en algún servidor?",
        a: "No. El procesamiento ocurre en memoria y el archivo se elimina al instante; nunca almacenamos tus PDF.",
      },
    ],
  },
  "split-pdf": {
    intro:
      "Con Dividir PDF puedes extraer las páginas que te interesan o separar un documento completo en archivos individuales por página. Perfecto cuando te envían un PDF enorme y solo necesitas unas páginas, o para repartir secciones entre varias personas.",
    faq: [
      {
        q: "¿Cómo indico qué páginas extraer?",
        a: "Escribe un rango como en este ejemplo: 1-3, 5, 8- (la página 8 hasta el final). Separa cada rango con comas y el resultado será un único PDF con esas páginas.",
      },
      {
        q: "¿Qué obtengo al separar todas las páginas?",
        a: "Un archivo ZIP que contiene un PDF independiente por cada página del documento original (pagina-1.pdf, pagina-2.pdf, etc.).",
      },
      {
        q: "¿El PDF dividido conserva la calidad original?",
        a: "Sí, las páginas se extraen sin recodificar, por lo que mantienen exactamente la misma calidad.",
      },
    ],
  },
  "compress-image": {
    intro:
      "Comprimir imagen reduce el peso de tus fotos en JPG, PNG y WebP con un control de calidad ajustable. Es la herramienta ideal para optimizar imágenes antes de subirlas a tu web, enviarlas por correo o publicarlas en redes sociales sin sacrificar demasiado la calidad.",
    faq: [
      {
        q: "¿Cuánto reduce el peso de una imagen?",
        a: "Depende del formato y el nivel de calidad elegido: en JPG y WebP suele reducirse entre 40% y 80%. En PNG, al ser un formato sin pérdida, la reducción puede ser menor.",
      },
      {
        q: "¿La imagen se verá borrosa después de comprimirla?",
        a: "Tú controlas la calidad con el slider. Con valores de 70 a 85 la diferencia visual es casi imperceptible y el ahorro de peso es significativo.",
      },
      {
        q: "¿Qué formatos acepta?",
        a: "JPG, PNG y WebP como salida, y además puedes comprimir imágenes GIF, TIFF y AVIF (se convertirán a JPEG).",
      },
    ],
  },
  "convert-image": {
    intro:
      "Convertir imagen cambia el formato de tus fotos entre PNG, JPG y WebP en segundos. Úsala para hacer compatibles tus imágenes con cualquier plataforma, reducir peso pasando a WebP o generar JPGs para formularios y trámites que no aceptan otros formatos.",
    faq: [
      {
        q: "¿Por qué debería usar WebP?",
        a: "WebP ofrece la mejor relación calidad-peso actual: suele pesar entre 25% y 50% menos que JPG con la misma calidad visual, ideal para webs rápidas.",
      },
      {
        q: "¿Qué pasa con la transparencia al convertir a JPG?",
        a: "JPG no soporta transparencia, así que las zonas transparentes se rellenan con fondo blanco. Si necesitas conservarla, convierte a PNG o WebP.",
      },
      {
        q: "¿Hay límite de tamaño?",
        a: "Sí, 20 MB por imagen, más que suficiente para la gran mayoría de fotos y capturas de pantalla.",
      },
    ],
  },
  "word-counter": {
    intro:
      "El Contador de palabras analiza tu texto en tiempo real: palabras, caracteres, oraciones, párrafos y tiempo de lectura estimado. Es la herramienta perfecta para estudiantes, redactores, community managers y cualquiera que escriba con límites de caracteres o plazos de lectura.",
    faq: [
      {
        q: "¿El conteo se actualiza mientras escribo?",
        a: "Sí, todas las estadísticas se calculan al instante con cada tecla que pulsas, sin necesidad de botones.",
      },
      {
        q: "¿Cómo se calcula el tiempo de lectura?",
        a: "Con una velocidad promedio de 200 palabras por minuto, el estándar más usado para contenido en español.",
      },
      {
        q: "¿Mi texto se envía a algún servidor?",
        a: "No. Todo se calcula localmente en tu navegador; tu texto nunca sale de tu dispositivo.",
      },
    ],
  },
  "qr-generator": {
    intro:
      "El Generador de QR crea códigos QR personalizados con tus colores y tamaño preferido, listos para descargar en PNG. Úsalo para compartir enlaces, menús de restaurante, redes sociales o información de contacto con un diseño que combine con tu marca.",
    faq: [
      {
        q: "¿Los códigos QR que genero expiran?",
        a: "No. El QR codifica directamente tu texto o enlace, así que funciona para siempre y no depende de nuestro servicio.",
      },
      {
        q: "¿Puedo personalizar los colores?",
        a: "Sí, puedes elegir el color del código y del fondo. Para que los lectores lo detecten bien, mantén un contraste alto (código oscuro sobre fondo claro).",
      },
      {
        q: "¿En qué formato se descarga?",
        a: "En PNG de alta resolución (hasta 1024 px), listo para imprimir o usar en pantalla.",
      },
    ],
  },
  "password-generator": {
    intro:
      "El Generador de contraseñas crea claves seguras y aleatorias con la longitud y los caracteres que elijas, e incluye un validador que evalúa la fortaleza de tus contraseñas actuales. Todo se genera localmente con criptografía segura del navegador.",
    faq: [
      {
        q: "¿Es seguro generar contraseñas aquí?",
        a: "Sí. Usamos la API criptográfica del navegador (crypto.getRandomValues) y las contraseñas nunca se envían ni se guardan en ningún servidor.",
      },
      {
        q: "¿Qué longitud recomiendan?",
        a: "Mínimo 16 caracteres con mayúsculas, minúsculas, números y símbolos para cuentas importantes. Nuestro medidor de entropía te indica la fortaleza en vivo.",
      },
      {
        q: "¿Puedo evaluar una contraseña que ya uso?",
        a: "Sí, en la pestaña Validador. El análisis es 100% local: la contraseña no sale de tu navegador.",
      },
    ],
  },
  "json-formatter": {
    intro:
      "El Formateador JSON ordena, embellece y valida tus datos JSON con detección de errores línea por línea, y también permite minificarlos para producción. Una herramienta diaria para desarrolladores que depuran APIs, configuraciones o respuestas de servicios.",
    faq: [
      {
        q: "¿Puedo procesar JSON grandes?",
        a: "Sí, el procesamiento ocurre en tu navegador, así que la velocidad depende de tu equipo y no hay límite artificial de tamaño.",
      },
      {
        q: "¿Qué significa el error de línea y columna?",
        a: "Cuando el JSON es inválido, te mostramos exactamente en qué línea y columna se encontró el problema para que lo corrijas rápido.",
      },
      {
        q: "¿Puedo ordenar las claves alfabéticamente?",
        a: "Sí, activa la opción Ordenar claves y se aplicará de forma recursiva a todos los niveles del objeto, incluso al minificar.",
      },
    ],
  },
  "base64-converter": {
    intro:
      "El Convertidor Base64 codifica y decodifica texto en Base64 con soporte completo de UTF-8 (acentos, ñ y emojis) y modo URL-safe para usarlo en enlaces. Esencial para desarrolladores que trabajan con tokens, data URIs o APIs que transmiten datos binarios como texto.",
    faq: [
      {
        q: "¿Base64 es una forma de cifrado?",
        a: "No. Base64 es una codificación reversible, no un cifrado: cualquiera puede decodificarla. Nunca la uses para proteger información sensible.",
      },
      {
        q: "¿Funciona con acentos y emojis?",
        a: "Sí, usamos UTF-8 real, así que puedes codificar texto en español con tildes, eñes y emojis sin problemas.",
      },
      {
        q: "¿Qué es el modo URL-safe?",
        a: "Sustituye los caracteres + y / por - y _ para que el resultado pueda usarse dentro de URLs sin escaparse.",
      },
    ],
  },
  "hash-generator": {
    intro:
      "El Generador de hash calcula las huellas MD5, SHA-1, SHA-256 y SHA-512 de cualquier texto al instante. Útil para verificar la integridad de datos, crear checksums o comparar contenido sin exponerlo, todo calculado localmente en tu navegador.",
    faq: [
      {
        q: "¿Para qué sirve un hash?",
        a: "Un hash es una huella digital única de un texto: se usa para verificar que un archivo o mensaje no fue alterado, y para comparar datos sin revelarlos.",
      },
      {
        q: "¿Se puede revertir un hash?",
        a: "No, los hashes son de sentido único. Cuál algoritmo usar: SHA-256 o superior para seguridad; MD5 solo para checksums básicos, no para contraseñas.",
      },
      {
        q: "¿Mi texto viaja a algún servidor?",
        a: "No. El hash se calcula localmente en tu navegador; tu texto nunca sale del dispositivo.",
      },
    ],
  },
  "link-shortener": {
    intro:
      "El Acortador de links convierte URLs largas en enlaces cortos y fáciles de compartir, con un panel de estadísticas que registra clics, dispositivos, navegadores y procedencia de cada visita. Ideal para campañas, redes sociales y medir el interés real en tus enlaces.",
    faq: [
      {
        q: "¿Los links cortos expiran?",
        a: "No, los enlaces creados funcionan de forma indefinida y puedes eliminarlos cuando quieras desde el panel.",
      },
      {
        q: "¿Qué estadísticas puedo ver?",
        a: "Para cada link: total de clics, gráfico de los últimos 14 días, dispositivos (móvil, tablet, escritorio), navegadores más usados y procedencia (referrer) de las visitas.",
      },
      {
        q: "¿Necesito crear una cuenta?",
        a: "No, en esta versión el panel es de acceso libre sin registro, pensado para uso rápido y compartido.",
      },
    ],
  },
  "invoice-generator": {
    intro:
      "El Generador de facturas crea documentos profesionales con cálculo automático de subtotal, impuestos y total, exportación a PDF y plantillas reutilizables. Pensado para freelancers, emprendedores y pequeños negocios que necesitan facturar en minutos sin programas contables.",
    faq: [
      {
        q: "¿Sirve para mi país?",
        a: "Sí: soporta monedas COP, USD, EUR, MXN, PEN y ARS, y el porcentaje de IVA/impuesto es configurable por línea o global, así que se adapta a cualquier régimen tributario.",
      },
      {
        q: "¿Mis facturas se guardan en la nube?",
        a: "No. Las plantillas se guardan únicamente en tu navegador (localStorage) y las facturas se generan como PDF que descargas al instante.",
      },
      {
        q: "¿Puedo reutilizar mis datos de emisor y cliente?",
        a: "Sí, guarda la factura como plantilla con un nombre y cárgala cuando la necesites: conservará emisor, cliente, líneas y configuración.",
      },
    ],
  },
  "unit-converter": {
    intro:
      "El Conversor de unidades transforma medidas entre 8 categorías: longitud, masa, temperatura, volumen, área, velocidad, almacenamiento y tiempo. Una calculadora universal para estudiantes, cocineros, ingenieros y cualquier persona que necesite una conversión exacta al momento.",
    faq: [
      {
        q: "¿Cómo convierte la temperatura?",
        a: "Con fórmulas reales (Celsius, Fahrenheit y Kelvin), no con factores simples, para que los resultados sean exactos en cualquier dirección.",
      },
      {
        q: "¿Qué tan precisos son los resultados?",
        a: "Mostramos hasta 6 decimales significativos sin ceros innecesarios, usando los factores oficiales de cada unidad.",
      },
      {
        q: "¿Necesito internet para convertir?",
        a: "Solo para cargar la página la primera vez; los cálculos se hacen localmente en tu navegador.",
      },
    ],
  },
  "date-calculator": {
    intro:
      "La Calculadora de fechas calcula la diferencia exacta entre dos fechas (años, meses, días, semanas y días hábiles) y permite sumar o restar días, semanas, meses o años a cualquier fecha. Perfecta para vencimientos, plazos contractuales, ediciones y planificación.",
    faq: [
      {
        q: "¿Qué son los días hábiles?",
        a: "Son los días de lunes a viernes, excluyendo sábados y domingos. Útil para plazos legales y laborales.",
      },
      {
        q: "¿Tiene en cuenta los años bisiestos?",
        a: "Sí, el cálculo usa el calendario real, por lo que los 29 de febrero y las duraciones variables de los meses se manejan correctamente.",
      },
      {
        q: "¿Puedo sumar meses y años, no solo días?",
        a: "Sí, puedes sumar o restar en días, semanas, meses o años, y verás la fecha resultante con su día de la semana.",
      },
    ],
  },
};
