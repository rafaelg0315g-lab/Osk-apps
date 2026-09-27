"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Download,
  FileDown,
  Loader2,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ToolShell } from "@/components/shared/tool-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface CvPersonal {
  nombre: string;
  titulo: string;
  email: string;
  telefono: string;
  ciudad: string;
  linkedin: string;
  web: string;
}

interface CvExperience {
  id: string;
  puesto: string;
  empresa: string;
  periodo: string;
  logros: string;
}

interface CvEducation {
  id: string;
  titulo: string;
  institucion: string;
  anio: string;
}

interface CvLanguage {
  id: string;
  idioma: string;
  nivel: string;
}

type CvTemplate = "clasica" | "moderna";
type CvAccent = "teal" | "violet";

interface CvData {
  personal: CvPersonal;
  resumen: string;
  experiencia: CvExperience[];
  educacion: CvEducation[];
  habilidades: string[];
  idiomas: CvLanguage[];
  plantilla: CvTemplate;
  acento: CvAccent;
}

const DRAFT_KEY = "osk-cv-draft";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "Nativo"] as const;

/*
 * Colores SIEMPRE en hexadecimal: el nodo que se captura con html2canvas no
 * puede depender de clases de color de Tailwind 4 (oklch), que html2canvas no
 * interpreta. Las clases de Tailwind dentro del documento solo son de layout.
 */
const INK = "#18181b";
const BODY = "#3f3f46";
const MUTED = "#71717a";
const FAINT = "#a1a1aa";
const LINE = "#e4e4e7";
const PAPER = "#fafafa";
const ACCENTS: Record<CvAccent, { main: string; soft: string }> = {
  teal: { main: "#0f766e", soft: "#ccfbf1" },
  violet: { main: "#6d28d9", soft: "#ede9fe" },
};
const SERIF_FONT = "Georgia, 'Times New Roman', serif";
const SANS_FONT = "'Segoe UI', system-ui, -apple-system, Arial, sans-serif";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function EMPTY_CV(): CvData {
  return {
    personal: {
      nombre: "",
      titulo: "",
      email: "",
      telefono: "",
      ciudad: "",
      linkedin: "",
      web: "",
    },
    resumen: "",
    experiencia: [],
    educacion: [],
    habilidades: [],
    idiomas: [],
    plantilla: "moderna",
    acento: "teal",
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeExperience(raw: unknown): CvExperience | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : generateId(),
    puesto: asString(obj.puesto),
    empresa: asString(obj.empresa),
    periodo: asString(obj.periodo),
    logros: asString(obj.logros),
  };
}

function normalizeEducation(raw: unknown): CvEducation | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : generateId(),
    titulo: asString(obj.titulo),
    institucion: asString(obj.institucion),
    anio: asString(obj.anio),
  };
}

function normalizeLanguage(raw: unknown): CvLanguage | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const nivel = asString(obj.nivel);
  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : generateId(),
    idioma: asString(obj.idioma),
    nivel: (LEVELS as readonly string[]).includes(nivel) ? nivel : "B1",
  };
}

function normalizeCv(raw: unknown): CvData {
  const base = EMPTY_CV();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const personalRaw = (obj.personal ?? {}) as Record<string, unknown>;
  return {
    personal: {
      nombre: asString(personalRaw.nombre),
      titulo: asString(personalRaw.titulo),
      email: asString(personalRaw.email),
      telefono: asString(personalRaw.telefono),
      ciudad: asString(personalRaw.ciudad),
      linkedin: asString(personalRaw.linkedin),
      web: asString(personalRaw.web),
    },
    resumen: asString(obj.resumen),
    experiencia: Array.isArray(obj.experiencia)
      ? obj.experiencia
          .map(normalizeExperience)
          .filter((item): item is CvExperience => item !== null)
      : [],
    educacion: Array.isArray(obj.educacion)
      ? obj.educacion
          .map(normalizeEducation)
          .filter((item): item is CvEducation => item !== null)
      : [],
    habilidades: Array.isArray(obj.habilidades)
      ? obj.habilidades.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
      : [],
    idiomas: Array.isArray(obj.idiomas)
      ? obj.idiomas
          .map(normalizeLanguage)
          .filter((item): item is CvLanguage => item !== null)
      : [],
    plantilla: obj.plantilla === "clasica" ? "clasica" : "moderna",
    acento: obj.acento === "violet" ? "violet" : "teal",
  };
}

function readDraft(): CvData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return normalizeCv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function hasContent(data: CvData): boolean {
  const p = data.personal;
  const personalFilled = [p.nombre, p.titulo, p.email, p.telefono, p.ciudad, p.linkedin, p.web].some(
    (value) => value.trim().length > 0,
  );
  return (
    personalFilled ||
    data.resumen.trim().length > 0 ||
    data.experiencia.length > 0 ||
    data.educacion.length > 0 ||
    data.habilidades.length > 0 ||
    data.idiomas.length > 0
  );
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function slugify(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CvSectionProps {
  id: string;
  title: string;
  description: string;
  openSections: Record<string, boolean>;
  onToggle: (id: string, open: boolean) => void;
  children: React.ReactNode;
}

function CvSection({ id, title, description, openSections, onToggle, children }: CvSectionProps) {
  const open = openSections[id] ?? false;
  return (
    <Collapsible open={open} onOpenChange={(next) => onToggle(id, next)}>
      <div className="rounded-xl border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/40"
          >
            <span>
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-xs text-muted-foreground">{description}</span>
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t px-4 py-4">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/** Título de sección del CV: variantes clásica/moderna (estilos en línea para html2canvas). */
function SectionTitle({
  children,
  variant,
  accentMain,
}: {
  children: string;
  variant: "clasica" | "moderna";
  accentMain: string;
}) {
  if (variant === "clasica") {
    return (
      <h2
        style={{
          margin: "0 0 10px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: INK,
          borderBottom: `1px solid ${LINE}`,
          paddingBottom: 5,
        }}
      >
        {children}
      </h2>
    );
  }
  return (
    <h2
      style={{
        margin: "0 0 10px",
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: accentMain,
        borderBottom: `2px solid ${accentMain}`,
        paddingBottom: 4,
      }}
    >
      {children}
    </h2>
  );
}

/** Documento del CV: solo estilos en línea con colores hexadecimales (compatible html2canvas). */
function CvDocument({ data }: { data: CvData }) {
  const {
    personal,
    resumen,
    experiencia,
    educacion,
    habilidades,
    idiomas,
    plantilla,
    acento,
  } = data;
  const isClassic = plantilla === "clasica";
  const accent = ACCENTS[acento];
  const font = isClassic ? SERIF_FONT : SANS_FONT;
  const contacts = [
    personal.email,
    personal.telefono,
    personal.ciudad,
    personal.linkedin,
    personal.web,
  ].filter((value) => value.trim().length > 0);

  return (
    <div style={{ fontFamily: font }}>
      <header
        style={
          isClassic
            ? {
                padding: "24px 22px 16px",
                borderBottom: `2px solid ${INK}`,
                textAlign: "center",
              }
            : {
                padding: "24px 22px 18px",
                backgroundColor: accent.main,
                color: "#ffffff",
              }
        }
      >
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: isClassic ? 2 : 0.5,
            textTransform: isClassic ? "uppercase" : "none",
            color: isClassic ? INK : "#ffffff",
            lineHeight: 1.2,
          }}
        >
          {personal.nombre.trim() || "Tu nombre"}
        </h1>
        {personal.titulo.trim() && (
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              fontStyle: isClassic ? "italic" : "normal",
              color: isClassic ? MUTED : "rgba(255,255,255,0.92)",
            }}
          >
            {personal.titulo}
          </p>
        )}
        {contacts.length > 0 && (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 11,
              color: isClassic ? BODY : "rgba(255,255,255,0.85)",
            }}
          >
            {contacts.join("  ·  ")}
          </p>
        )}
      </header>

      <div style={{ padding: "20px 22px 26px" }}>
        {resumen.trim() && (
          <section style={{ marginBottom: 18 }}>
            <SectionTitle variant={plantilla} accentMain={accent.main}>Resumen profesional</SectionTitle>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: BODY, whiteSpace: "pre-wrap" }}>
              {resumen}
            </p>
          </section>
        )}

        {experiencia.length > 0 && (
          <section style={{ marginBottom: 18 }}>
            <SectionTitle variant={plantilla} accentMain={accent.main}>Experiencia</SectionTitle>
            {experiencia.map((exp) => (
              <article key={exp.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: INK }}>
                    {exp.puesto.trim() || "Puesto"}
                  </h3>
                  {exp.periodo.trim() && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: isClassic ? MUTED : accent.main,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {exp.periodo}
                    </span>
                  )}
                </div>
                {exp.empresa.trim() && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: MUTED }}>{exp.empresa}</p>
                )}
                {exp.logros.trim() && (
                  <div
                    style={{
                      margin: "4px 0 0",
                      fontSize: 11.5,
                      lineHeight: 1.55,
                      color: BODY,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {exp.logros}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}

        {educacion.length > 0 && (
          <section style={{ marginBottom: 18 }}>
            <SectionTitle variant={plantilla} accentMain={accent.main}>Educación</SectionTitle>
            {educacion.map((edu) => (
              <article key={edu.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK }}>
                    {edu.titulo.trim() || "Título"}
                  </h3>
                  {edu.anio.trim() && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: isClassic ? MUTED : accent.main }}>
                      {edu.anio}
                    </span>
                  )}
                </div>
                {edu.institucion.trim() && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: MUTED }}>{edu.institucion}</p>
                )}
              </article>
            ))}
          </section>
        )}

        {habilidades.length > 0 && (
          <section style={{ marginBottom: 18 }}>
            <SectionTitle variant={plantilla} accentMain={accent.main}>Habilidades</SectionTitle>
            {isClassic ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {habilidades.map((skill) => (
                  <span
                    key={skill}
                    style={{
                      border: `1px solid ${LINE}`,
                      borderRadius: 999,
                      backgroundColor: PAPER,
                      padding: "3px 10px",
                      fontSize: 11,
                      color: BODY,
                    }}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 14px" }}>
                {habilidades.map((skill) => (
                  <span key={skill} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: BODY }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        backgroundColor: accent.main,
                        flexShrink: 0,
                      }}
                    />
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {idiomas.length > 0 && (
          <section>
            <SectionTitle variant={plantilla} accentMain={accent.main}>Idiomas</SectionTitle>
            {idiomas.map((lang) => (
              <p key={lang.id} style={{ margin: "0 0 5px", fontSize: 12, color: BODY }}>
                <span style={{ fontWeight: 700, color: INK }}>{lang.idioma.trim() || "Idioma"}</span>
                {` — ${lang.nivel}`}
              </p>
            ))}
          </section>
        )}

        {!resumen.trim() &&
          experiencia.length === 0 &&
          educacion.length === 0 &&
          habilidades.length === 0 &&
          idiomas.length === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: FAINT, textAlign: "center" }}>
              Completa el formulario para ver tu currículum aquí.
            </p>
          )}
      </div>
    </div>
  );
}

export default function CvBuilder() {
  const [data, setData] = useState<CvData>(() => readDraft() ?? EMPTY_CV());
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    datos: true,
  });
  const [skillInput, setSkillInput] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const cvRef = useRef<HTMLDivElement>(null);
  const firstSaveRef = useRef(true);

  // Autoguardado del borrador con debounce de 800 ms.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasContent(data)) return;
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
        if (firstSaveRef.current) {
          firstSaveRef.current = false;
          toast("Borrador guardado automáticamente", {
            description: "Tus datos solo se conservan en este navegador.",
          });
        }
      } catch {
        // Almacenamiento no disponible o lleno: se ignora silenciosamente.
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [data]);

  const setPersonal = (patch: Partial<CvPersonal>) =>
    setData((prev) => ({ ...prev, personal: { ...prev.personal, ...patch } }));

  const update = <K extends keyof CvData>(key: K, value: CvData[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const onToggle = (id: string, open: boolean) =>
    setOpenSections((prev) => ({ ...prev, [id]: open }));

  const addExperience = () =>
    setData((prev) => ({
      ...prev,
      experiencia: [
        ...prev.experiencia,
        { id: generateId(), puesto: "", empresa: "", periodo: "", logros: "" },
      ],
    }));

  const updateExperience = (id: string, patch: Partial<CvExperience>) =>
    setData((prev) => ({
      ...prev,
      experiencia: prev.experiencia.map((exp) =>
        exp.id === id ? { ...exp, ...patch } : exp,
      ),
    }));

  const addEducation = () =>
    setData((prev) => ({
      ...prev,
      educacion: [...prev.educacion, { id: generateId(), titulo: "", institucion: "", anio: "" }],
    }));

  const updateEducation = (id: string, patch: Partial<CvEducation>) =>
    setData((prev) => ({
      ...prev,
      educacion: prev.educacion.map((edu) => (edu.id === id ? { ...edu, ...patch } : edu)),
    }));

  const addLanguage = () =>
    setData((prev) => ({
      ...prev,
      idiomas: [...prev.idiomas, { id: generateId(), idioma: "", nivel: "B1" }],
    }));

  const updateLanguage = (id: string, patch: Partial<CvLanguage>) =>
    setData((prev) => ({
      ...prev,
      idiomas: prev.idiomas.map((lang) => (lang.id === id ? { ...lang, ...patch } : lang)),
    }));

  const addSkill = () => {
    const value = skillInput.trim();
    if (!value) return;
    if (data.habilidades.some((s) => s.toLowerCase() === value.toLowerCase())) {
      toast.error("Esa habilidad ya está en la lista");
      return;
    }
    setData((prev) => ({ ...prev, habilidades: [...prev.habilidades, value] }));
    setSkillInput("");
  };

  const clearAll = () => {
    setData(EMPTY_CV());
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Almacenamiento no disponible: se ignora.
    }
    toast.success("Se vació el currículum");
  };

  const generatePdf = async () => {
    const node = cvRef.current;
    if (!node) {
      toast.error("No hay vista previa para exportar");
      return;
    }
    setPdfLoading(true);
    try {
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 0;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const contentHeight = pageHeight - margin * 2;
      if (!Number.isFinite(imgHeight) || imgHeight < 2) {
        throw new Error("Documento vacío");
      }
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      let offset = 0;
      let page = 0;
      while (offset < imgHeight - 0.5) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", margin, margin - offset, imgWidth, imgHeight);
        offset += contentHeight;
        page += 1;
      }
      pdf.save(`cv-${slugify(data.personal.nombre) || "curriculum"}.pdf`);
      toast.success("CV descargado en PDF");
    } catch {
      toast.error("No se pudo generar el PDF. Inténtalo de nuevo.");
    } finally {
      setPdfLoading(false);
    }
  };

  const templateDescription = useMemo(
    () =>
      data.plantilla === "clasica"
        ? "Tipografía serif, una columna, sobrio y atemporal."
        : "Tipografía sans, banda de color y habilidades en dos columnas.",
    [data.plantilla],
  );

  return (
    <ToolShell>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)]">
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4 text-violet-600" aria-hidden />
                Diseño
              </CardTitle>
              <CardDescription>{templateDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cv-tpl">Plantilla</Label>
                <Select
                  value={data.plantilla}
                  onValueChange={(value) => update("plantilla", value as CvTemplate)}
                >
                  <SelectTrigger id="cv-tpl" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clasica">Clásica</SelectItem>
                    <SelectItem value="moderna">Moderna</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {data.plantilla === "moderna" && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">Color de la banda</span>
                  <button
                    type="button"
                    aria-label="Acento verde azulado"
                    onClick={() => update("acento", "teal")}
                    className={cn(
                      "size-6 rounded-full bg-teal-700 ring-offset-2 transition-shadow",
                      data.acento === "teal" && "ring-2 ring-teal-700",
                    )}
                  />
                  <button
                    type="button"
                    aria-label="Acento violeta"
                    onClick={() => update("acento", "violet")}
                    className={cn(
                      "size-6 rounded-full bg-violet-700 ring-offset-2 transition-shadow",
                      data.acento === "violet" && "ring-2 ring-violet-700",
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <CvSection
            id="datos"
            title="Datos personales"
            description="Nombre, contacto y enlaces profesionales."
            openSections={openSections}
            onToggle={onToggle}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cv-nombre">Nombre completo</Label>
                <Input
                  id="cv-nombre"
                  value={data.personal.nombre}
                  onChange={(e) => setPersonal({ nombre: e.target.value })}
                  placeholder="Ej.: Ana Martínez"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cv-titulo">Título profesional</Label>
                <Input
                  id="cv-titulo"
                  value={data.personal.titulo}
                  onChange={(e) => setPersonal({ titulo: e.target.value })}
                  placeholder="Ej.: Desarrolladora front-end"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cv-email">Correo electrónico</Label>
                <Input
                  id="cv-email"
                  type="email"
                  value={data.personal.email}
                  onChange={(e) => setPersonal({ email: e.target.value })}
                  placeholder="ana@ejemplo.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cv-telefono">Teléfono</Label>
                <Input
                  id="cv-telefono"
                  value={data.personal.telefono}
                  onChange={(e) => setPersonal({ telefono: e.target.value })}
                  placeholder="+34 600 000 000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cv-ciudad">Ciudad</Label>
                <Input
                  id="cv-ciudad"
                  value={data.personal.ciudad}
                  onChange={(e) => setPersonal({ ciudad: e.target.value })}
                  placeholder="Ej.: Madrid"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cv-linkedin">LinkedIn (usuario o URL)</Label>
                <Input
                  id="cv-linkedin"
                  value={data.personal.linkedin}
                  onChange={(e) => setPersonal({ linkedin: e.target.value })}
                  placeholder="linkedin.com/in/ana"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cv-web">Sitio web o portafolio</Label>
                <Input
                  id="cv-web"
                  value={data.personal.web}
                  onChange={(e) => setPersonal({ web: e.target.value })}
                  placeholder="https://ana.ejemplo.com"
                />
              </div>
            </div>
          </CvSection>

          <CvSection
            id="resumen"
            title="Resumen profesional"
            description="Dos o tres frases que resuman tu perfil."
            openSections={openSections}
            onToggle={onToggle}
          >
            <Textarea
              rows={4}
              value={data.resumen}
              onChange={(e) => update("resumen", e.target.value)}
              placeholder="Profesional con 5 años de experiencia en… Especializada en…"
              aria-label="Resumen profesional"
            />
          </CvSection>

          <CvSection
            id="experiencia"
            title="Experiencia"
            description="Puestos, empresas y logros principales."
            openSections={openSections}
            onToggle={onToggle}
          >
            {data.experiencia.map((exp, index) => (
              <div key={exp.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Experiencia {index + 1}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Subir experiencia"
                      disabled={index === 0}
                      onClick={() =>
                        update("experiencia", moveItem(data.experiencia, index, index - 1))
                      }
                      className="size-7 text-muted-foreground"
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Bajar experiencia"
                      disabled={index === data.experiencia.length - 1}
                      onClick={() =>
                        update("experiencia", moveItem(data.experiencia, index, index + 1))
                      }
                      className="size-7 text-muted-foreground"
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Quitar experiencia"
                      onClick={() =>
                        update(
                          "experiencia",
                          data.experiencia.filter((item) => item.id !== exp.id),
                        )
                      }
                      className="size-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <Input
                  value={exp.puesto}
                  onChange={(e) => updateExperience(exp.id, { puesto: e.target.value })}
                  placeholder="Puesto o cargo"
                  aria-label={`Puesto de la experiencia ${index + 1}`}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={exp.empresa}
                    onChange={(e) => updateExperience(exp.id, { empresa: e.target.value })}
                    placeholder="Empresa"
                    aria-label={`Empresa de la experiencia ${index + 1}`}
                  />
                  <Input
                    value={exp.periodo}
                    onChange={(e) => updateExperience(exp.id, { periodo: e.target.value })}
                    placeholder="Período: Ene 2022 – Actualidad"
                    aria-label={`Período de la experiencia ${index + 1}`}
                  />
                </div>
                <Textarea
                  rows={2}
                  value={exp.logros}
                  onChange={(e) => updateExperience(exp.id, { logros: e.target.value })}
                  placeholder={"Logros y responsabilidades, uno por línea"}
                  aria-label={`Logros de la experiencia ${index + 1}`}
                />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addExperience} className="gap-2">
              <Plus className="size-4" aria-hidden />
              Añadir experiencia
            </Button>
          </CvSection>

          <CvSection
            id="educacion"
            title="Educación"
            description="Títulos e instituciones."
            openSections={openSections}
            onToggle={onToggle}
          >
            {data.educacion.map((edu, index) => (
              <div key={edu.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Estudio {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar estudio"
                    onClick={() =>
                      update(
                        "educacion",
                        data.educacion.filter((item) => item.id !== edu.id),
                      )
                    }
                    className="size-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <Input
                  value={edu.titulo}
                  onChange={(e) => updateEducation(edu.id, { titulo: e.target.value })}
                  placeholder="Título obtenido"
                  aria-label={`Título del estudio ${index + 1}`}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={edu.institucion}
                    onChange={(e) => updateEducation(edu.id, { institucion: e.target.value })}
                    placeholder="Institución"
                    aria-label={`Institución del estudio ${index + 1}`}
                  />
                  <Input
                    value={edu.anio}
                    onChange={(e) => updateEducation(edu.id, { anio: e.target.value })}
                    placeholder="Año: 2018 – 2023"
                    aria-label={`Año del estudio ${index + 1}`}
                  />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addEducation} className="gap-2">
              <Plus className="size-4" aria-hidden />
              Añadir estudio
            </Button>
          </CvSection>

          <CvSection
            id="habilidades"
            title="Habilidades"
            description="Técnicas y blandas, separadas una a una."
            openSections={openSections}
            onToggle={onToggle}
          >
            <div className="flex gap-2">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                placeholder="Escribe una habilidad y pulsa Enter"
                aria-label="Nueva habilidad"
              />
              <Button type="button" variant="outline" onClick={addSkill} className="gap-2">
                <Plus className="size-4" aria-hidden />
                Añadir
              </Button>
            </div>
            {data.habilidades.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Habilidades añadidas">
                {data.habilidades.map((skill) => (
                  <li
                    key={skill}
                    className="flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-3 pr-1.5 text-xs"
                  >
                    {skill}
                    <button
                      type="button"
                      aria-label={`Quitar la habilidad ${skill}`}
                      onClick={() =>
                        update(
                          "habilidades",
                          data.habilidades.filter((item) => item !== skill),
                        )
                      }
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CvSection>

          <CvSection
            id="idiomas"
            title="Idiomas"
            description="Nivel según el Marco Común Europeo."
            openSections={openSections}
            onToggle={onToggle}
          >
            {data.idiomas.map((lang, index) => (
              <div key={lang.id} className="flex items-center gap-2">
                <Input
                  value={lang.idioma}
                  onChange={(e) => updateLanguage(lang.id, { idioma: e.target.value })}
                  placeholder={`Idioma ${index + 1}`}
                  aria-label={`Nombre del idioma ${index + 1}`}
                />
                <Select
                  value={lang.nivel}
                  onValueChange={(value) => updateLanguage(lang.id, { nivel: value })}
                >
                  <SelectTrigger className="w-32 shrink-0" aria-label={`Nivel del idioma ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar el idioma ${index + 1}`}
                  onClick={() =>
                    update("idiomas", data.idiomas.filter((item) => item.id !== lang.id))
                  }
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLanguage} className="gap-2">
              <Plus className="size-4" aria-hidden />
              Añadir idioma
            </Button>
          </CvSection>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Vista previa</CardTitle>
              <CardDescription>
                Proporción A4. Se actualiza en vivo mientras escribes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <div
                  ref={cvRef}
                  style={{
                    width: "100%",
                    maxWidth: 430,
                    minHeight: 608,
                    backgroundColor: "#ffffff",
                    color: INK,
                    border: `1px solid ${LINE}`,
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  <CvDocument data={data} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={generatePdf}
                  disabled={pdfLoading}
                  className="gap-2"
                >
                  {pdfLoading ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <FileDown className="size-4" aria-hidden />
                  )}
                  {pdfLoading ? "Generando…" : "Descargar PDF"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Vaciar todo
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Vaciar todo el currículum?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminarán todos los datos del formulario y el borrador
                        guardado en este navegador. Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={clearAll}
                        className="bg-red-600 text-white hover:bg-red-700"
                      >
                        Sí, vaciar todo
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Download className="size-3.5" aria-hidden />
                  Borrador autoguardado
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ToolShell>
  );
}
