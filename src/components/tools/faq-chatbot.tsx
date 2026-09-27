"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  MessagesSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "osk-faq-chatbot";
const LOCAL_MATCH_THRESHOLD = 0.5;

const TONES: { value: string; label: string }[] = [
  { value: "profesional", label: "Profesional" },
  { value: "cercano", label: "Cercano" },
  { value: "joven", label: "Joven" },
  { value: "formal", label: "Formal" },
];

interface Faq {
  id: string;
  question: string;
  answer: string;
  topic: string;
}

interface BotConfig {
  business: string;
  industry: string;
  tone: string;
  info: string;
  faqs: Faq[];
}

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  content: string;
  source?: "faq" | "ia";
}

/** Helper local: llama al endpoint de IA y lanza Error con el mensaje del servidor si falla. */
async function callAi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok || !payload || typeof payload !== "object") {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "El servicio de IA no está disponible en este momento. Intenta de nuevo en unos segundos.";
    throw new Error(message);
  }
  return payload as Record<string, unknown>;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readConfig(): BotConfig {
  const empty: BotConfig = { business: "", industry: "", tone: "cercano", info: "", faqs: [] };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty;
    const obj = parsed as Partial<BotConfig>;
    const toneOk = TONES.some((t) => t.value === obj.tone);
    return {
      business: typeof obj.business === "string" ? obj.business : "",
      industry: typeof obj.industry === "string" ? obj.industry : "",
      tone: toneOk && typeof obj.tone === "string" ? obj.tone : "cercano",
      info: typeof obj.info === "string" ? obj.info : "",
      faqs: Array.isArray(obj.faqs)
        ? obj.faqs
            .filter(
              (f): f is Faq =>
                !!f &&
                typeof f === "object" &&
                typeof f.question === "string" &&
                typeof f.answer === "string",
            )
            .map((f) => ({
              id: typeof f.id === "string" ? f.id : makeId(),
              question: f.question,
              answer: f.answer,
              topic: typeof f.topic === "string" ? f.topic : "",
            }))
        : [],
    };
  } catch {
    return empty;
  }
}

/** Palabras vacías comunes (ya sin tildes) que no cuentan para el matching local. */
const STOPWORDS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "u", "que",
  "a", "al", "en", "del", "se", "su", "sus", "lo", "por", "para", "es", "son", "ser",
  "esta", "estan", "este", "esto", "estos", "estas", "hay", "ha", "han", "me", "te",
  "le", "les", "nos", "mi", "tu", "yo", "usted", "ustedes", "como", "cuando", "cual",
  "cuales", "cuanto", "cuanta", "donde", "quien", "quienes", "si", "no", "mas", "pero",
  "the", "of", "to", "and", "is", "it", "in", "for", "on", "do", "does", "how", "what",
  "hola", "gracias", "favor", "buenas", "dias", "tardes", "noches", "hace", "hacen",
  "tengo", "tiene", "tienen", "puedo", "puede", "pueden", "quiero", "quieres", "saber",
  "soy", "eres", "somos", "muy", "aqui", "alli",
]);

/** Normaliza y tokeniza: minúsculas, sin tildes, sin puntuación, sin stopwords, singular simple. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/** Matching local: fracción de palabras clave del usuario presentes en la FAQ. */
function findLocalAnswer(question: string, faqs: Faq[]): Faq | null {
  const tokens = tokenize(question);
  if (tokens.length === 0) return null;
  const userSet = new Set(tokens);
  let best: Faq | null = null;
  let bestScore = 0;
  for (const faq of faqs) {
    const faqSet = new Set([...tokenize(faq.question), ...tokenize(faq.topic)]);
    let matches = 0;
    for (const t of userSet) {
      if (faqSet.has(t)) matches++;
    }
    const score = matches / userSet.size;
    if (score > bestScore) {
      bestScore = score;
      best = faq;
    }
  }
  return bestScore >= LOCAL_MATCH_THRESHOLD ? best : null;
}

function parseGeneratedFaqs(data: unknown): Faq[] {
  if (!data || typeof data !== "object") {
    throw new Error("La IA devolvió una respuesta inesperada. Intenta de nuevo.");
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.faqs)) {
    throw new Error("La IA no devolvió FAQs válidas. Intenta de nuevo.");
  }
  return obj.faqs
    .filter(
      (f): f is Record<string, unknown> =>
        !!f &&
        typeof f === "object" &&
        typeof (f as Record<string, unknown>).question === "string" &&
        typeof (f as Record<string, unknown>).answer === "string",
    )
    .map((f) => ({
      id: makeId(),
      question: (f.question as string).trim(),
      answer: (f.answer as string).trim(),
      topic: typeof f.topic === "string" ? f.topic.trim() : "",
    }))
    .filter((f) => f.question && f.answer)
    .slice(0, 24);
}

export default function FaqChatbot() {
  const [initial] = useState(readConfig);
  const [tab, setTab] = useState("configurar");
  const [business, setBusiness] = useState(initial.business);
  const [industry, setIndustry] = useState(initial.industry);
  const [tone, setTone] = useState(initial.tone);
  const [info, setInfo] = useState(initial.info);
  const [existingFaqs, setExistingFaqs] = useState("");
  const [faqs, setFaqs] = useState<Faq[]>(initial.faqs);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toneLabel = TONES.find((t) => t.value === tone)?.label ?? tone;

  // Persistencia de configuración y FAQs (solo escritura, sin setState en el efecto).
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ business, industry, tone, info, faqs }),
      );
    } catch {
      // Almacenamiento no disponible: la configuración solo vive en memoria.
    }
  }, [business, industry, tone, info, faqs]);

  // Auto-scroll del chat al último mensaje.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const updateFaq = (id: string, patch: Partial<Pick<Faq, "question" | "answer" | "topic">>) => {
    setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFaq = (id: string) => {
    setFaqs((prev) => prev.filter((f) => f.id !== id));
  };

  const addFaq = () => {
    setFaqs((prev) => [...prev, { id: makeId(), question: "", answer: "", topic: "" }]);
  };

  const generateFaqs = async () => {
    if (!business.trim() && !industry.trim()) {
      toast.error("Indica al menos el nombre del negocio o su rubro.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const parts = [
        `Nombre del negocio: ${business.trim() || "(sin nombre)"}`,
        `Rubro o actividad: ${industry.trim() || "(sin especificar)"}`,
        `Tono de las respuestas: ${toneLabel}`,
      ];
      if (info.trim()) parts.push(`Información clave del negocio:\n${info.trim()}`);
      if (existingFaqs.trim()) {
        parts.push(`FAQs propias del negocio (inclúyelas mejoradas):\n${existingFaqs.trim()}`);
      }
      const payload = await callAi({
        json: true,
        system: `Generas FAQs para el chatbot de un negocio. Devuelve JSON: {"faqs": [{"question": "pregunta probable de un cliente", "answer": "respuesta breve y útil en el tono pedido", "topic": "categoría corta"}]}. Entre 8 y 12 FAQs. Si el usuario dio FAQs propias, inclúyelas mejoradas y añade las faltantes típicas (horarios, precios, envíos, contacto, garantías). No inventes datos que contradigan la información dada.`,
        messages: [{ role: "user", content: parts.join("\n\n") }],
      });
      const generated = parseGeneratedFaqs(payload.data);
      if (generated.length === 0) {
        throw new Error("La IA no devolvió FAQs válidas. Intenta de nuevo.");
      }
      setFaqs(generated);
      toast.success(`Se generaron ${generated.length} FAQs. Revísalas y edítalas a gusto.`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "El servicio de IA no está disponible en este momento. Intenta de nuevo en unos segundos.";
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const send = async () => {
    const question = input.trim();
    if (!question || thinking) return;

    const userMsg: ChatMessage = { id: makeId(), role: "user", content: question };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setChatError(null);

    // 1) Coincidencia local con las FAQs (sin gastar límite de IA).
    const local = findLocalAnswer(question, faqs);
    if (local) {
      setMessages([
        ...next,
        { id: makeId(), role: "bot", content: local.answer, source: "faq" },
      ]);
      return;
    }

    // 2) Sin coincidencia: pasa por la IA con las FAQs como contexto.
    setThinking(true);
    try {
      const history = next.slice(-6).map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));
      const payload = await callAi({
        system: `Eres el chatbot de ${business.trim() || "este negocio"}. Responde SOLO en base a estas FAQs, en el tono ${toneLabel.toLowerCase()}, máximo 3 frases. Si no sabes la respuesta di amablemente que contacte al negocio.\nFAQs:\n${JSON.stringify(faqs.map(({ question: q, answer: a, topic: t }) => ({ question: q, answer: a, topic: t })))}`,
        messages: history,
      });
      const content = typeof payload.content === "string" ? payload.content.trim() : "";
      if (!content) {
        throw new Error("La IA no devolvió respuesta. Intenta de nuevo.");
      }
      setMessages((prev) => [...prev, { id: makeId(), role: "bot", content, source: "ia" }]);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "El servicio de IA no está disponible en este momento. Intenta de nuevo en unos segundos.";
      setChatError(message);
      toast.error(message);
    } finally {
      setThinking(false);
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setChatError(null);
    setInput("");
    toast.success("Conversación reiniciada.");
  };

  return (
    <ToolShell>
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="configurar">1. Configurar</TabsTrigger>
          <TabsTrigger value="probar">2. Probar chatbot</TabsTrigger>
        </TabsList>

        <TabsContent value="configurar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessagesSquare className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
                Información del negocio
              </CardTitle>
              <CardDescription>
                Con estos datos la IA genera las preguntas frecuentes y el bot sabe cómo
                responder.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="business-name">Nombre del negocio</Label>
                  <Input
                    id="business-name"
                    value={business}
                    onChange={(e) => setBusiness(e.target.value)}
                    placeholder="Ej: Panadería La Espiga"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-industry">Rubro o actividad</Label>
                  <Input
                    id="business-industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="Ej: Panadería y repostería artesanal"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-tone">Tono de las respuestas</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger id="business-tone" className="w-full sm:w-64">
                    <SelectValue placeholder="Elige el tono" />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-info">Información clave</Label>
                <Textarea
                  id="business-info"
                  value={info}
                  onChange={(e) => setInfo(e.target.value)}
                  placeholder={
                    "Horarios, dirección, teléfono, políticas, precios, envíos…\nEj: Abrimos de lunes a sábado de 8:00 a 19:00. Hacemos envíos en la ciudad desde $10.000."
                  }
                  className="min-h-28"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-faqs">FAQs existentes (opcional)</Label>
                <Textarea
                  id="business-faqs"
                  value={existingFaqs}
                  onChange={(e) => setExistingFaqs(e.target.value)}
                  placeholder={"P: ¿Hacen envíos?\nR: Sí, enviamos a toda la ciudad en 24 horas.\n\nP: ¿Qué formas de pago aceptan?\nR: Tarjeta, transferencia y efectivo."}
                  className="min-h-28 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Una pregunta por línea con el formato &quot;P: …&quot; y su respuesta en la línea
                  siguiente con &quot;R: …&quot;. La IA las mejorará y completará las que falten.
                </p>
              </div>

              <Button
                type="button"
                onClick={generateFaqs}
                disabled={generating}
                className="w-full gap-2 sm:w-auto"
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                {generating ? "Generando…" : "Generar FAQs con IA"}
              </Button>

              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>No se pudieron generar las FAQs</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Preguntas frecuentes ({faqs.length})</CardTitle>
                  <CardDescription>
                    Edita las respuestas: el bot las usará tal cual durante el chat.
                  </CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addFaq} className="gap-1.5">
                  <Plus className="size-3.5" aria-hidden />
                  Añadir FAQ
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {faqs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay preguntas frecuentes. Genera FAQs con IA a partir de la información
                  de tu negocio, o añádelas manualmente con el botón &quot;Añadir FAQ&quot;.
                </p>
              ) : (
                <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
                  {faqs.map((faq) => (
                    <li key={faq.id}>
                      <Card className="p-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          {faq.topic ? (
                            <Badge variant="secondary" className="max-w-40 truncate text-[11px]">
                              {faq.topic}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin categoría</span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Eliminar la pregunta "${faq.question || "sin título"}"`}
                            onClick={() => removeFaq(faq.id)}
                            className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <Input
                            value={faq.question}
                            onChange={(e) => updateFaq(faq.id, { question: e.target.value })}
                            placeholder="Pregunta probable del cliente"
                            aria-label="Pregunta frecuente"
                          />
                          <Textarea
                            value={faq.answer}
                            onChange={(e) => updateFaq(faq.id, { answer: e.target.value })}
                            placeholder="Respuesta breve y útil"
                            aria-label="Respuesta de la pregunta frecuente"
                            rows={2}
                          />
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="probar" className="space-y-4">
          {faqs.length === 0 && (
            <Alert>
              <AlertTitle>Configura tus FAQs primero</AlertTitle>
              <AlertDescription>
                No hay preguntas frecuentes todavía: el bot solo podrá responder de forma
                genérica. Vuelve al paso 1 para generarlas.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
                    {business.trim() || "Chatbot"} · Probador
                  </CardTitle>
                  <CardDescription>
                    Tono {toneLabel.toLowerCase()} · {faqs.length} FAQ
                    {faqs.length === 1 ? "" : "s"} configuradas
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetConversation}
                  disabled={thinking}
                  className="gap-1.5"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Reiniciar conversación
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                ref={scrollRef}
                className="max-h-96 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-4"
                aria-label="Conversación con el chatbot"
                aria-live="polite"
              >
                {messages.length === 0 && !thinking && (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                    <Bot className="size-8 text-muted-foreground" aria-hidden />
                    <p className="text-sm font-medium">Escribe una pregunta para empezar</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      El bot responde primero buscando en tus FAQs; si no hay coincidencia,
                      consulta a la IA con ese contexto.
                    </p>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex items-end gap-2",
                      msg.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    {msg.role === "bot" && (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Bot className="size-4 text-muted-foreground" aria-hidden />
                      </span>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap sm:max-w-[75%]",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {msg.content}
                      {msg.role === "bot" && msg.source && (
                        <span
                          className={cn(
                            "mt-1 block text-[10px] uppercase tracking-wide",
                            msg.role === "bot" && msg.source === "faq"
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {msg.source === "faq" ? "Respuesta de tus FAQ" : "Respuesta con IA"}
                        </span>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <User className="size-4 text-primary" aria-hidden />
                      </span>
                    )}
                  </div>
                ))}

                {thinking && (
                  <div className="flex items-end gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Bot className="size-4 text-muted-foreground" aria-hidden />
                    </span>
                    <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      Escribiendo…
                    </div>
                  </div>
                )}
              </div>

              {chatError && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{chatError}</AlertDescription>
                </Alert>
              )}

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe tu pregunta…"
                  aria-label="Mensaje para el chatbot"
                  disabled={thinking}
                />
                <Button type="submit" disabled={thinking || !input.trim()} className="gap-2">
                  {thinking ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="size-4" aria-hidden />
                  )}
                  <span className="sr-only sm:not-sr-only">Enviar</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-center text-xs text-muted-foreground">
        Función con IA · límite diario de uso · tu texto se envía a nuestro servicio de IA
      </p>
    </ToolShell>
  );
}
