"use client";

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { FileDown, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { DownloadButton } from "@/components/shared/download-button";
import { ToolShell } from "@/components/shared/tool-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

type TemplateId = "servicios" | "compraventa" | "nda" | "arrendamiento";
type CurrencyCode = "COP" | "USD" | "EUR" | "MXN" | "PEN" | "ARS" | "CLP";
type CountryCode = "CO" | "MX" | "ES" | "PE" | "AR" | "CL" | "EC";

interface TemplateMeta {
  id: TemplateId;
  label: string;
  title: string;
  description: string;
  usesAmount: boolean;
  usesPago: boolean;
  objetoLabel: string;
  objetoPlaceholder: string;
  objetoFallback: string;
  montoLabel: string;
  plazoLabel: string;
  plazoPlaceholder: string;
  pagoPlaceholder: string;
}

interface ContractForm {
  ciudad: string;
  fecha: string;
  parte1Nombre: string;
  parte1Id: string;
  parte2Nombre: string;
  parte2Id: string;
  objeto: string;
  monto: string;
  moneda: CurrencyCode;
  plazo: string;
  pago: string;
  confidencialidad: boolean;
  propiedad: boolean;
  resolucion: boolean;
  jurisdiccion: CountryCode;
  testigos: boolean;
}

const TEMPLATES: TemplateMeta[] = [
  {
    id: "servicios",
    label: "Prestación de servicios",
    title: "Contrato de prestación de servicios",
    description:
      "Acuerdo entre un prestador y un cliente para la realización de trabajos o servicios profesionales.",
    usesAmount: true,
    usesPago: true,
    objetoLabel: "Objeto del servicio",
    objetoPlaceholder:
      "Ej.: Diseño y desarrollo del sitio web institucional, según los alcances del Anexo 1.",
    objetoFallback:
      "la prestación de los servicios descritos por las partes en los anexos del presente contrato.",
    montoLabel: "Monto del servicio (honorarios)",
    plazoLabel: "Plazo / vigencia",
    plazoPlaceholder: "Ej.: Tres (3) meses contados desde la firma",
    pagoPlaceholder: "Ej.: 50 % a la firma y 50 % contra entrega aprobada",
  },
  {
    id: "compraventa",
    label: "Compraventa",
    title: "Contrato de compraventa",
    description:
      "Transferencia de la propiedad de un bien o producto entre vendedor y comprador.",
    usesAmount: true,
    usesPago: true,
    objetoLabel: "Descripción del bien o producto",
    objetoPlaceholder:
      "Ej.: Motocicleta marca XYZ, modelo 2022, placa ABC-123, con 15.000 km.",
    objetoFallback:
      "la venta del bien descrito con detalle en el presente contrato.",
    montoLabel: "Precio de venta",
    plazoLabel: "Plazo de entrega",
    plazoPlaceholder: "Ej.: Dentro de los cinco (5) días hábiles siguientes a la firma",
    pagoPlaceholder: "Ej.: Pago total contra entrega del bien",
  },
  {
    id: "nda",
    label: "Confidencialidad (NDA)",
    title: "Contrato de confidencialidad (NDA)",
    description:
      "Compromiso de no divulgación de información confidencial intercambiada entre las partes.",
    usesAmount: false,
    usesPago: false,
    objetoLabel: "Información confidencial y propósito",
    objetoPlaceholder:
      "Ej.: Documentación técnica, cifras de ventas y listas de clientes, con el fin de evaluar una colaboración comercial.",
    objetoFallback:
      "la protección de la información confidencial intercambiada entre las partes.",
    montoLabel: "Monto",
    plazoLabel: "Vigencia del compromiso",
    plazoPlaceholder: "Ej.: Dos (2) años contados desde la firma",
    pagoPlaceholder: "",
  },
  {
    id: "arrendamiento",
    label: "Arrendamiento simple",
    title: "Contrato de arrendamiento",
    description:
      "Cesión del uso de un inmueble a cambio de un canon periódico, en términos simples.",
    usesAmount: true,
    usesPago: true,
    objetoLabel: "Inmueble arrendado (dirección y descripción)",
    objetoPlaceholder:
      "Ej.: Apartamento 502 del edificio Los Robles, Calle 10 n.º 4-21, de 3 habitaciones.",
    objetoFallback:
      "el arrendamiento del inmueble descrito en el presente contrato.",
    montoLabel: "Canon mensual",
    plazoLabel: "Duración del arrendamiento",
    plazoPlaceholder: "Ej.: Doce (12) meses contados desde la entrega del inmueble",
    pagoPlaceholder: "Ej.: Pago entre los días 1 y 5 de cada mes",
  },
];

const COUNTRIES: { code: CountryCode; name: string }[] = [
  { code: "CO", name: "Colombia" },
  { code: "MX", name: "México" },
  { code: "ES", name: "España" },
  { code: "PE", name: "Perú" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "EC", name: "Ecuador" },
];

const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "COP", label: "Peso colombiano (COP)" },
  { code: "USD", label: "Dólar estadounidense (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "MXN", label: "Peso mexicano (MXN)" },
  { code: "PEN", label: "Sol peruano (PEN)" },
  { code: "ARS", label: "Peso argentino (ARS)" },
  { code: "CLP", label: "Peso chileno (CLP)" },
];

const ORDINALS = [
  "PRIMERA",
  "SEGUNDA",
  "TERCERA",
  "CUARTA",
  "QUINTA",
  "SEXTA",
  "SÉPTIMA",
  "OCTAVA",
  "NOVENA",
  "DÉCIMA",
  "DÉCIMA PRIMERA",
  "DÉCIMA SEGUNDA",
];

const CONFIRMATION_MARKER = "En prueba de conformidad";

const SIGNATURE_LINE = "____________________________";

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(iso: string): Date | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMonto(value: string): number | null {
  const cleaned = value.replace(/[^\d.,-]/g, "").replace(/,/g, ".");
  if (!cleaned) return null;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatMonto(num: number): string {
  return new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(num);
}

function templateById(id: TemplateId): TemplateMeta {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

function initialForm(): ContractForm {
  return {
    ciudad: "",
    fecha: toISODate(new Date()),
    parte1Nombre: "",
    parte1Id: "",
    parte2Nombre: "",
    parte2Id: "",
    objeto: "",
    monto: "",
    moneda: "COP",
    plazo: "",
    pago: "",
    confidencialidad: false,
    propiedad: false,
    resolucion: false,
    jurisdiccion: "CO",
    testigos: false,
  };
}

/** Construye el texto completo del contrato a partir de la plantilla y el formulario. */
function buildContractText(meta: TemplateMeta, form: ContractForm): string {
  const date = parseDateInput(form.fecha);
  const longDate = date
    ? new Intl.DateTimeFormat("es", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date)
    : "____ de ____________ de ______";
  const country = COUNTRIES.find((c) => c.code === form.jurisdiccion)?.name ?? "Colombia";
  const ciudad = form.ciudad.trim() || "____________";

  const parte1 = form.parte1Nombre.trim() || "____________";
  const parte2 = form.parte2Nombre.trim() || "____________";
  const id1 = form.parte1Id.trim();
  const id2 = form.parte2Id.trim();

  const lines: string[] = [];
  lines.push(meta.title.toUpperCase());
  lines.push("");
  lines.push(`En la ciudad de ${ciudad}, a los ${longDate}, entre:`);
  lines.push("");
  lines.push(
    `PARTE 1. ${parte1}${id1 ? `, identificada(o) con ${id1}` : ""}, en adelante "LA PARTE 1"; y`,
  );
  lines.push(
    `PARTE 2. ${parte2}${id2 ? `, identificada(o) con ${id2}` : ""}, en adelante "LA PARTE 2",`,
  );
  lines.push("");
  lines.push(
    "quienes actúan libre y voluntariamente, han acordado celebrar el presente contrato, que se regirá por las siguientes cláusulas:",
  );
  lines.push("");

  const clauses: string[] = [];
  clauses.push(
    `OBJETO. El presente contrato tiene por objeto ${form.objeto.trim() || meta.objetoFallback}`,
  );
  if (meta.usesAmount) {
    const monto = parseMonto(form.monto);
    const montoTxt = monto !== null
      ? `${formatMonto(monto)} ${form.moneda}`
      : "la cantidad acordada por escrito entre las partes";
    const pago = form.pago.trim();
    clauses.push(
      `CONTRAPRESTACIÓN Y FORMA DE PAGO. LA PARTE 2 pagará a LA PARTE 1 la cantidad de ${montoTxt}${
        pago ? `, conforme a las siguientes condiciones: ${pago}.` : ", en la forma y fechas que las partes acuerden por escrito."
      }`,
    );
  }
  if (form.plazo.trim()) {
    clauses.push(`PLAZO Y VIGENCIA. ${form.plazo.trim()}`);
  }
  if (form.confidencialidad) {
    clauses.push(
      "CONFIDENCIALIDAD. Las partes se obligan a mantener estricta confidencialidad sobre la información, los documentos y los datos intercambiados con motivo de este contrato, y a no divulgarlos a terceros sin autorización previa y por escrito de la otra parte, salvo obligación legal. Esta obligación permanece vigente incluso después de la terminación del contrato.",
    );
  }
  if (form.propiedad) {
    clauses.push(
      "PROPIEDAD INTELECTUAL. Los derechos de propiedad intelectual e industrial derivados de los entregables y desarrollos realizados con motivo de este contrato corresponden a LA PARTE 1, salvo pacto escrito en contrario entre las partes.",
    );
  }
  if (form.resolucion) {
    clauses.push(
      "RESOLUCIÓN ANTICIPADA. Cualquiera de las partes podrá dar por terminado este contrato de manera anticipada mediante notificación escrita a la otra parte con un preaviso mínimo de quince (15) días calendario, sin perjuicio de las obligaciones devengadas hasta la fecha efectiva de terminación.",
    );
  }
  clauses.push(
    `JURISDICCIÓN Y LEY APLICABLE. Este contrato se rige por la legislación de ${country}. Para cualquier controversia derivada del mismo, las partes se someten a los jueces y tribunales competentes de ${ciudad}, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.`,
  );

  clauses.forEach((clause, index) => {
    const ordinal = ORDINALS[index] ?? `CLÁUSULA ${index + 1}`;
    lines.push(`${ordinal} – ${clause}`);
    lines.push("");
  });

  lines.push(
    `${CONFIRMATION_MARKER}, las partes firman el presente contrato en dos (2) ejemplares de igual tenor y valor, en la ciudad y fecha indicadas al inicio del documento.`,
  );
  lines.push("");
  lines.push("");
  lines.push(`${SIGNATURE_LINE}                        ${SIGNATURE_LINE}`);
  lines.push(`${(form.parte1Nombre.trim() || "Firma Parte 1").padEnd(36)}${form.parte2Nombre.trim() || "Firma Parte 2"}`);
  lines.push("Parte 1                                  Parte 2");
  if (form.testigos) {
    lines.push("");
    lines.push(`${SIGNATURE_LINE}                        ${SIGNATURE_LINE}`);
    lines.push("Testigo 1                                Testigo 2");
  }
  return lines.join("\n");
}

/** Genera el PDF A4 del contrato con cláusulas numeradas y bloque de firmas a dos columnas. */
function buildContractPdf(meta: TemplateMeta, text: string, form: ContractForm): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  const markerIndex = text.indexOf(CONFIRMATION_MARKER);
  const hasSignatures = markerIndex >= 0;
  const body = hasSignatures ? text.slice(0, markerIndex).trimEnd() : text;

  let y = margin;
  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Título centrado, negrita, 16 pt
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  const titleLines = doc.splitTextToSize(meta.title.toUpperCase(), contentWidth) as string[];
  y += 4;
  ensureSpace(titleLines.length * 7 + 10);
  doc.text(titleLines, pageWidth / 2, y, { align: "center" });
  y += titleLines.length * 7 + 6;

  const clauseRe =
    /^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA|DÉCIMA|PENÚLTIMA|ÚLTIMA|CLÁUSULA)\b/;

  const drawWrapped = (value: string, size: number, bold: boolean) => {
    doc.setFont("times", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(value, contentWidth) as string[];
    for (const line of wrapped) {
      ensureSpace(size * 0.55 + 1);
      doc.text(line, margin, y);
      y += size * 0.55 + 1;
    }
  };

  for (const paragraph of body.split("\n")) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      y += 2.2;
      continue;
    }
    const isClause = clauseRe.test(trimmed);
    if (isClause) {
      const dotIndex = trimmed.indexOf(". ");
      if (dotIndex > 0) {
        drawWrapped(trimmed.slice(0, dotIndex + 1), 11, true);
        drawWrapped(trimmed.slice(dotIndex + 2), 10.5, false);
        y += 2;
        continue;
      }
      drawWrapped(trimmed, 11, true);
      y += 1;
      continue;
    }
    drawWrapped(trimmed, 10.5, false);
  }

  if (hasSignatures) {
    ensureSpace(52);
    y += 16;
    const colWidth = contentWidth / 2;
    const drawSignature = (x: number, name: string, role: string) => {
      doc.setFont("times", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(40, 40, 40);
      doc.text(SIGNATURE_LINE, x + colWidth / 2, y, { align: "center" });
      doc.setFont("times", "bold");
      doc.text(name, x + colWidth / 2, y + 6, { align: "center" });
      doc.setFont("times", "normal");
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      doc.text(role, x + colWidth / 2, y + 10.5, { align: "center" });
    };
    drawSignature(margin, form.parte1Nombre.trim() || "Firma Parte 1", "Parte 1");
    drawSignature(margin + colWidth, form.parte2Nombre.trim() || "Firma Parte 2", "Parte 2");
    y += 18;
    if (form.testigos) {
      ensureSpace(22);
      y += 6;
      drawSignature(margin, "Testigo 1", "Nombre y documento");
      drawSignature(margin + colWidth, "Testigo 2", "Nombre y documento");
      y += 18;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("times", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(130, 130, 130);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth / 2, pageHeight - 10, {
      align: "center",
    });
  }

  doc.save("contrato.pdf");
}

export default function ContractGenerator() {
  const [templateId, setTemplateId] = useState<TemplateId>("servicios");
  const [form, setForm] = useState<ContractForm>(initialForm);
  const [contractText, setContractText] = useState("");
  const [manualEdit, setManualEdit] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const meta = templateById(templateId);

  // Regeneración automática con debounce, salvo que el usuario haya editado el texto.
  useEffect(() => {
    if (manualEdit) return;
    const timer = setTimeout(() => {
      setContractText(buildContractText(meta, form));
    }, 500);
    return () => clearTimeout(timer);
  }, [meta, form, manualEdit]);

  const txtBlob = useMemo(
    () => new Blob([contractText], { type: "text/plain;charset=utf-8" }),
    [contractText],
  );

  const update = <K extends keyof ContractForm>(key: K, value: ContractForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const regenerate = () => {
    setManualEdit(false);
    setContractText(buildContractText(meta, form));
    toast.success("Contrato regenerado");
  };

  const downloadPdf = () => {
    if (!contractText.trim()) {
      toast.error("No hay texto de contrato para exportar");
      return;
    }
    setPdfLoading(true);
    try {
      buildContractPdf(meta, contractText, form);
      toast.success("PDF descargado");
    } catch {
      toast.error("No se pudo generar el PDF. Inténtalo de nuevo.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4 text-teal-600" aria-hidden />
            Plantilla del contrato
          </CardTitle>
          <CardDescription>
            Elige un tipo de contrato y completa los datos: el texto se genera
            automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tpl">Tipo de contrato</Label>
            <Select
              value={templateId}
              onValueChange={(value) => setTemplateId(value as TemplateId)}
            >
              <SelectTrigger id="tpl" className="w-full">
                <SelectValue placeholder="Selecciona una plantilla" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ciudad">Ciudad de firma</Label>
              <Input
                id="ciudad"
                value={form.ciudad}
                onChange={(e) => update("ciudad", e.target.value)}
                placeholder="Ej.: Bogotá"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fecha">Fecha de firma</Label>
              <Input
                id="fecha"
                type="date"
                value={form.fecha}
                onChange={(e) => update("fecha", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Las partes</CardTitle>
          <CardDescription>
            Nombre e identificación de cada una de las partes del contrato.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p1">Parte 1 (nombre o razón social)</Label>
            <Input
              id="p1"
              value={form.parte1Nombre}
              onChange={(e) => update("parte1Nombre", e.target.value)}
              placeholder="Ej.: Servicios Creativos S.A.S."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p1id">Parte 1 (identificación)</Label>
            <Input
              id="p1id"
              value={form.parte1Id}
              onChange={(e) => update("parte1Id", e.target.value)}
              placeholder="Ej.: NIT 900.123.456-7"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p2">Parte 2 (nombre o razón social)</Label>
            <Input
              id="p2"
              value={form.parte2Nombre}
              onChange={(e) => update("parte2Nombre", e.target.value)}
              placeholder="Ej.: Ana Martínez"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p2id">Parte 2 (identificación)</Label>
            <Input
              id="p2id"
              value={form.parte2Id}
              onChange={(e) => update("parte2Id", e.target.value)}
              placeholder="Ej.: CC 1.020.334.556"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalles del contrato</CardTitle>
          <CardDescription>
            Campos específicos de la plantilla «{meta.label}».
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="objeto">{meta.objetoLabel}</Label>
            <Textarea
              id="objeto"
              rows={3}
              value={form.objeto}
              onChange={(e) => update("objeto", e.target.value)}
              placeholder={meta.objetoPlaceholder}
            />
          </div>
          {meta.usesAmount && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="monto">{meta.montoLabel}</Label>
                <Input
                  id="monto"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={form.monto}
                  onChange={(e) => update("monto", e.target.value)}
                  placeholder="Ej.: 3500000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="moneda">Moneda</Label>
                <Select
                  value={form.moneda}
                  onValueChange={(value) => update("moneda", value as CurrencyCode)}
                >
                  <SelectTrigger id="moneda" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="plazo">{meta.plazoLabel}</Label>
            <Input
              id="plazo"
              value={form.plazo}
              onChange={(e) => update("plazo", e.target.value)}
              placeholder={meta.plazoPlaceholder}
            />
          </div>
          {meta.usesPago && (
            <div className="space-y-1.5">
              <Label htmlFor="pago">Condiciones de pago</Label>
              <Input
                id="pago"
                value={form.pago}
                onChange={(e) => update("pago", e.target.value)}
                placeholder={meta.pagoPlaceholder}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cláusulas adicionales</CardTitle>
          <CardDescription>
            Añade cláusulas habituales con un clic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                checked={form.confidencialidad}
                onCheckedChange={(checked) =>
                  update("confidencialidad", checked === true)
                }
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">Confidencialidad</span>
                <span className="block text-xs text-muted-foreground">
                  No divulgación de información intercambiada.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                checked={form.propiedad}
                onCheckedChange={(checked) =>
                  update("propiedad", checked === true)
                }
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">
                  Propiedad intelectual
                </span>
                <span className="block text-xs text-muted-foreground">
                  Derechos sobre los entregables del contrato.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                checked={form.resolucion}
                onCheckedChange={(checked) =>
                  update("resolucion", checked === true)
                }
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">
                  Resolución anticipada
                </span>
                <span className="block text-xs text-muted-foreground">
                  Terminación con preaviso de 15 días.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                checked={form.testigos}
                onCheckedChange={(checked) => update("testigos", checked === true)}
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">
                  Firma de testigos
                </span>
                <span className="block text-xs text-muted-foreground">
                  Dos columnas adicionales para testigos.
                </span>
              </span>
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pais">Ley aplicable</Label>
            <Select
              value={form.jurisdiccion}
              onValueChange={(value) => update("jurisdiccion", value as CountryCode)}
            >
              <SelectTrigger id="pais" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              El contrato se regirá por la legislación de{" "}
              {COUNTRIES.find((c) => c.code === form.jurisdiccion)?.name ??
                "Colombia"}
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            Contrato generado
          </CardTitle>
          <CardDescription>
            Puedes editar el texto libremente: la descarga usa la versión del
            editor. Al cambiar los datos del formulario se regenera
            automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={contractText}
            onChange={(e) => {
              setContractText(e.target.value);
              setManualEdit(true);
            }}
            aria-label="Texto del contrato generado"
            className="min-h-[420px] font-serif text-[13px] leading-relaxed"
          />
          {manualEdit && (
            <p className="text-xs text-amber-600">
              Has editado el texto manualmente. Usa «Regenerar» para volver a
              crearlo con los datos del formulario.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={regenerate}
              className="gap-2"
            >
              <RefreshCw className="size-4" aria-hidden />
              Regenerar
            </Button>
            <Button
              type="button"
              onClick={downloadPdf}
              disabled={pdfLoading || !contractText.trim()}
              className="gap-2"
            >
              <FileDown className="size-4" aria-hidden />
              Descargar PDF
            </Button>
            <DownloadButton
              blob={txtBlob}
              filename="contrato.txt"
              label="Descargar .txt"
              size="default"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Este documento es una guía de apoyo y no constituye asesoría
            jurídica. Revisa siempre el texto final antes de firmar.
          </p>
        </CardContent>
      </Card>
    </ToolShell>
  );
}
