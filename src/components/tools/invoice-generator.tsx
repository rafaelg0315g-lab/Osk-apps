"use client";

import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  FileDown,
  FilePlus2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/shared/copy-button";
import { ToolShell } from "@/components/shared/tool-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate } from "@/lib/utils";

type CurrencyCode = "COP" | "USD" | "EUR" | "MXN" | "PEN" | "ARS";

interface InvoiceParty {
  name: string;
  docId: string;
  address: string;
  email: string;
  phone: string;
}

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

interface InvoiceConfig {
  number: string;
  issueDate: string;
  dueDate: string;
  currency: CurrencyCode;
  taxRate: number;
  discountRate: number;
  notes: string;
}

interface InvoiceTemplate {
  id: string;
  name: string;
  savedAt: string;
  emisor: InvoiceParty;
  cliente: InvoiceParty;
  config: InvoiceConfig;
  lines: InvoiceLine[];
}

interface Totals {
  items: { amount: number; tax: number }[];
  subtotal: number;
  discount: number;
  taxes: number;
  total: number;
}

const TEMPLATES_KEY = "osk-invoice-templates";

const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "COP", label: "Peso colombiano (COP)" },
  { code: "USD", label: "Dólar estadounidense (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "MXN", label: "Peso mexicano (MXN)" },
  { code: "PEN", label: "Sol peruano (PEN)" },
  { code: "ARS", label: "Peso argentino (ARS)" },
];

const TAX_OPTIONS = [0, 5, 12, 16, 19, 21];

const EMPTY_PARTY: InvoiceParty = {
  name: "",
  docId: "",
  address: "",
  email: "",
  phone: "",
};

/** Genera identificadores únicos (crypto.randomUUID con reserva segura). */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parsea "yyyy-MM-dd" como fecha local; null si es inválida o está vacía. */
function parseDateInput(iso: string): Date | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function numOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampNum(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number): string {
  return `${String(numOr(value, 0)).replace(".", ",")} %`;
}

function defaultConfig(): InvoiceConfig {
  return {
    number: "FAC-001",
    issueDate: toISODate(new Date()),
    dueDate: "",
    currency: "COP",
    taxRate: 0,
    discountRate: 0,
    notes: "",
  };
}

function defaultLine(taxRate: number): InvoiceLine {
  return {
    id: generateId(),
    description: "",
    quantity: 1,
    unitPrice: 0,
    taxRate,
  };
}

function normalizeParty(raw: unknown): InvoiceParty {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    name: typeof obj.name === "string" ? obj.name : "",
    docId: typeof obj.docId === "string" ? obj.docId : "",
    address: typeof obj.address === "string" ? obj.address : "",
    email: typeof obj.email === "string" ? obj.email : "",
    phone: typeof obj.phone === "string" ? obj.phone : "",
  };
}

function normalizeLine(raw: unknown): InvoiceLine {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : generateId(),
    description: typeof obj.description === "string" ? obj.description : "",
    quantity: clampNum(Number(obj.quantity), 1, 1000000000, 1),
    unitPrice: clampNum(Number(obj.unitPrice), 0, 1000000000000, 0),
    taxRate: clampNum(Number(obj.taxRate), 0, 100, 0),
  };
}

function normalizeConfig(raw: unknown): InvoiceConfig {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const currency = CURRENCIES.find((c) => c.code === obj.currency)?.code ?? "COP";
  return {
    number: typeof obj.number === "string" && obj.number ? obj.number : "FAC-001",
    issueDate:
      typeof obj.issueDate === "string" && parseDateInput(obj.issueDate)
        ? obj.issueDate
        : toISODate(new Date()),
    dueDate:
      typeof obj.dueDate === "string" && parseDateInput(obj.dueDate) ? obj.dueDate : "",
    currency,
    taxRate: clampNum(Number(obj.taxRate), 0, 100, 0),
    discountRate: clampNum(Number(obj.discountRate), 0, 100, 0),
    notes: typeof obj.notes === "string" ? obj.notes : "",
  };
}

function isValidTemplate(value: unknown): value is InvoiceTemplate {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    Array.isArray(obj.lines) &&
    typeof obj.emisor === "object" &&
    typeof obj.cliente === "object" &&
    typeof obj.config === "object"
  );
}

/** Lee las plantillas guardadas al cargar la página (el componente es solo cliente). */
function readTemplates(): InvoiceTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTemplate);
  } catch {
    return [];
  }
}

interface PartyCardProps {
  title: string;
  description: string;
  idPrefix: string;
  party: InvoiceParty;
  onChange: (patch: Partial<InvoiceParty>) => void;
  showPhone?: boolean;
}

function PartyCard({
  title,
  description,
  idPrefix,
  party,
  onChange,
  showPhone = false,
}: PartyCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title} <span className="text-rose-600">*</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-name`}>Nombre o razón social</Label>
          <Input
            id={`${idPrefix}-name`}
            value={party.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ej. Comercializadora Andina S. A. S."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-doc`}>Documento fiscal (NIT/RFC/CUIT)</Label>
          <Input
            id={`${idPrefix}-doc`}
            value={party.docId}
            onChange={(e) => onChange({ docId: e.target.value })}
            placeholder="Ej. 900.123.456-7"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-email`}>Correo electrónico</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={party.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="contacto@empresa.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-address`}>Dirección</Label>
          <Input
            id={`${idPrefix}-address`}
            value={party.address}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder="Calle 123 # 45-67, Bogotá"
          />
        </div>
        {showPhone && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-phone`}>Teléfono</Label>
            <Input
              id={`${idPrefix}-phone`}
              type="tel"
              value={party.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              placeholder="+57 300 000 0000"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function InvoiceGeneratorTool() {
  const [emisor, setEmisor] = useState<InvoiceParty>(EMPTY_PARTY);
  const [cliente, setCliente] = useState<InvoiceParty>(EMPTY_PARTY);
  const [config, setConfig] = useState<InvoiceConfig>(defaultConfig);
  const [lines, setLines] = useState<InvoiceLine[]>(() => [defaultLine(0)]);

  const [templates, setTemplates] = useState<InvoiceTemplate[]>(readTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Carga inicial de plantillas desde localStorage (ver readTemplates)
  const moneyFormatter = useMemo(
    () => new Intl.NumberFormat("es", { style: "currency", currency: config.currency }),
    [config.currency],
  );

  const formatMoney = (value: number): string => moneyFormatter.format(numOr(value, 0));

  const totals = useMemo<Totals>(() => {
    const items = lines.map((line) => {
      const amount = round2(numOr(line.quantity, 0) * numOr(line.unitPrice, 0));
      const tax = round2((amount * numOr(line.taxRate, 0)) / 100);
      return { amount, tax };
    });
    const subtotal = round2(items.reduce((acc, it) => acc + it.amount, 0));
    const discountRate = clampNum(config.discountRate, 0, 100, 0);
    const discount = round2((subtotal * discountRate) / 100);
    const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 1;
    const taxes = round2(items.reduce((acc, it) => acc + it.tax, 0) * factor);
    const total = round2(subtotal - discount + taxes);
    return { items, subtotal, discount, taxes, total };
  }, [lines, config.discountRate]);

  const updateEmisor = (patch: Partial<InvoiceParty>) =>
    setEmisor((prev) => ({ ...prev, ...patch }));

  const updateCliente = (patch: Partial<InvoiceParty>) =>
    setCliente((prev) => ({ ...prev, ...patch }));

  const updateConfig = (patch: Partial<InvoiceConfig>) =>
    setConfig((prev) => ({ ...prev, ...patch }));

  const updateLine = (id: string, patch: Partial<InvoiceLine>) =>
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );

  const addLine = () =>
    setLines((prev) => [...prev, defaultLine(config.taxRate)]);

  const removeLine = (id: string) => {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((line) => line.id !== id);
    });
  };

  /** El IVA global define el valor por defecto de las líneas nuevas y actualiza las que conservan el valor anterior. */
  const handleGlobalTaxChange = (rate: number) => {
    const previous = config.taxRate;
    updateConfig({ taxRate: rate });
    setLines((prev) =>
      prev.map((line) => (line.taxRate === previous ? { ...line, taxRate: rate } : line)),
    );
  };

  const persistTemplates = (next: InvoiceTemplate[]) => {
    setTemplates(next);
    try {
      window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    } catch {
      toast.error("No se pudo guardar la plantilla en este navegador");
    }
  };

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) {
      toast.error("Escribe un nombre para la plantilla");
      return;
    }
    const existing = templates.find(
      (t) => t.name.trim().toLowerCase() === name.toLowerCase(),
    );
    const template: InvoiceTemplate = {
      id: existing ? existing.id : generateId(),
      name,
      savedAt: new Date().toISOString(),
      emisor,
      cliente,
      config,
      lines,
    };
    const next = existing
      ? templates.map((t) => (t.id === existing.id ? template : t))
      : [...templates, template];
    persistTemplates(next);
    setSelectedTemplateId(template.id);
    setSaveDialogOpen(false);
    setTemplateName("");
    toast.success(existing ? `Plantilla "${name}" actualizada` : `Plantilla "${name}" guardada`);
  };

  const loadTemplate = () => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) {
      toast.error("Selecciona una plantilla para cargar");
      return;
    }
    setEmisor(normalizeParty(template.emisor));
    setCliente(normalizeParty(template.cliente));
    setConfig(normalizeConfig(template.config));
    setLines(
      template.lines.length > 0 ? template.lines.map(normalizeLine) : [defaultLine(0)],
    );
    setSelectedTemplateId("");
    toast.success(`Plantilla "${template.name}" cargada`);
  };

  const deleteTemplate = () => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) {
      toast.error("Selecciona la plantilla que quieres eliminar");
      return;
    }
    persistTemplates(templates.filter((t) => t.id !== template.id));
    setSelectedTemplateId("");
    toast.success(`Plantilla "${template.name}" eliminada`);
  };

  const resetInvoice = () => {
    setEmisor({ ...EMPTY_PARTY });
    setCliente({ ...EMPTY_PARTY });
    setConfig(defaultConfig());
    setLines([defaultLine(0)]);
    setSelectedTemplateId("");
    toast.success("Se creó una factura en blanco");
  };

  const newInvoice = () => {
    toast("Se creará una factura en blanco. Los datos no guardados se perderán.", {
      action: { label: "Confirmar", onClick: resetInvoice },
      duration: 8000,
    });
  };

  const validateForPdf = (): string[] => {
    const problems: string[] = [];
    if (!emisor.name.trim()) problems.push("el nombre del emisor");
    if (!cliente.name.trim()) problems.push("el nombre del cliente");
    if (!lines.some((line) => line.description.trim())) {
      problems.push("al menos una línea con descripción");
    }
    return problems;
  };

  const exportPdf = () => {
    const problems = validateForPdf();
    if (problems.length > 0) {
      toast.error(`No se puede exportar el PDF: faltan ${problems.join(", ")}.`);
      return;
    }
    try {
      buildInvoicePdf({ emisor, cliente, config, lines, totals, formatMoney });
      toast.success("Factura exportada como PDF");
    } catch {
      toast.error("No se pudo generar el PDF. Inténtalo de nuevo.");
    }
  };

  return (
    <ToolShell>
      {/* Plantillas guardadas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plantillas guardadas</CardTitle>
          <CardDescription>
            {templates.length === 0
              ? "Aún no tienes plantillas guardadas en este navegador."
              : templates.length === 1
                ? "Tienes 1 plantilla guardada en este navegador."
                : `Tienes ${templates.length} plantillas guardadas en este navegador.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="invoice-template">Selecciona una plantilla</Label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
              disabled={templates.length === 0}
            >
              <SelectTrigger id="invoice-template" className="w-full">
                <SelectValue placeholder="Sin selección" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name} ({formatDate(template.savedAt)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={loadTemplate}
              disabled={templates.length === 0 || !selectedTemplateId}
            >
              Cargar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={deleteTemplate}
              disabled={templates.length === 0 || !selectedTemplateId}
              className="text-rose-600 hover:text-rose-700"
            >
              <Trash2 className="size-4" aria-hidden />
              Eliminar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Emisor y cliente */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PartyCard
          title="Datos del emisor"
          description="Quien emite la factura. Requerido para exportar el PDF."
          idPrefix="emisor"
          party={emisor}
          onChange={updateEmisor}
          showPhone
        />
        <PartyCard
          title="Datos del cliente"
          description="Receptor de la factura. Requerido para exportar el PDF."
          idPrefix="cliente"
          party={cliente}
          onChange={updateCliente}
        />
      </div>

      {/* Detalles de la factura */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalles de la factura</CardTitle>
          <CardDescription>
            Numeración, fechas, moneda e impuestos globales. El descuento se aplica al subtotal.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-number">Número de factura</Label>
            <Input
              id="inv-number"
              value={config.number}
              onChange={(e) => updateConfig({ number: e.target.value })}
              placeholder="FAC-001"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-currency">Moneda</Label>
            <Select
              value={config.currency}
              onValueChange={(value) => updateConfig({ currency: value as CurrencyCode })}
            >
              <SelectTrigger id="inv-currency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-issue-date">Fecha de emisión</Label>
            <Input
              id="inv-issue-date"
              type="date"
              value={config.issueDate}
              onChange={(e) => updateConfig({ issueDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-due-date">Fecha de vencimiento (opcional)</Label>
            <Input
              id="inv-due-date"
              type="date"
              value={config.dueDate}
              onChange={(e) => updateConfig({ dueDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-tax">Impuesto global por línea</Label>
            <Select
              value={String(config.taxRate)}
              onValueChange={(value) => handleGlobalTaxChange(Number(value))}
            >
              <SelectTrigger id="inv-tax" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAX_OPTIONS.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {formatPercent(rate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Valor por defecto de las líneas nuevas; cada línea puede ajustarse.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-discount">Descuento global (%)</Label>
            <Input
              id="inv-discount"
              type="number"
              min={0}
              max={100}
              step="any"
              value={config.discountRate}
              onChange={(e) =>
                updateConfig({ discountRate: clampNum(e.target.valueAsNumber, 0, 100, 0) })
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="inv-notes">Notas (opcional)</Label>
            <Textarea
              id="inv-notes"
              rows={3}
              value={config.notes}
              onChange={(e) => updateConfig({ notes: e.target.value })}
              placeholder="Ej. Pago por transferencia a 30 días. Gracias por su compra."
            />
          </div>
        </CardContent>
      </Card>

      {/* Líneas + resumen */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Productos y servicios</CardTitle>
            <CardDescription>
              Agrega los conceptos facturados. La factura debe conservar al menos una línea.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="-mx-1 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
              <table className="w-full min-w-[620px] text-sm">
                <caption className="sr-only">
                  Líneas de la factura: descripción, cantidad, precio unitario, impuesto e importe
                </caption>
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-2 font-medium">Descripción</th>
                    <th scope="col" className="w-24 px-2 py-2 font-medium">Cantidad</th>
                    <th scope="col" className="w-32 px-2 py-2 font-medium">Precio unit.</th>
                    <th scope="col" className="w-24 px-2 py-2 font-medium">Impuesto</th>
                    <th scope="col" className="w-32 px-2 py-2 text-right font-medium">Importe</th>
                    <th scope="col" className="w-10 py-2 pl-2">
                      <span className="sr-only">Eliminar línea</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.id} className="border-b align-middle last:border-b-0">
                      <td className="py-2 pr-2">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          placeholder={`Concepto ${index + 1}`}
                          aria-label={`Descripción de la línea ${index + 1}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min={1}
                          step="any"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.id, {
                              quantity: clampNum(e.target.valueAsNumber, 1, 1000000000, 1),
                            })
                          }
                          aria-label={`Cantidad de la línea ${index + 1}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(line.id, {
                              unitPrice: clampNum(e.target.valueAsNumber, 0, 1000000000000, 0),
                            })
                          }
                          aria-label={`Precio unitario de la línea ${index + 1}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          value={line.taxRate}
                          onChange={(e) =>
                            updateLine(line.id, {
                              taxRate: clampNum(e.target.valueAsNumber, 0, 100, 0),
                            })
                          }
                          aria-label={`Porcentaje de impuesto de la línea ${index + 1}`}
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {formatMoney(totals.items[index]?.amount ?? 0)}
                      </td>
                      <td className="py-2 pl-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.id)}
                          disabled={lines.length <= 1}
                          aria-label={`Eliminar la línea ${index + 1}`}
                          title={
                            lines.length <= 1
                              ? "La factura debe conservar al menos una línea"
                              : "Eliminar línea"
                          }
                        >
                          <Trash2 className="size-4 text-rose-600" aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="size-4" aria-hidden />
              Agregar línea
            </Button>
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
            <CardDescription>Cálculo automático con redondeo a 2 decimales.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{formatMoney(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">
                  Descuento ({formatPercent(config.discountRate)})
                </span>
                <span className="font-medium tabular-nums text-rose-600">
                  - {formatMoney(totals.discount)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Total impuestos</span>
              <span className="font-medium tabular-nums">{formatMoney(totals.taxes)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold">TOTAL</span>
              <span className="break-all text-right text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatMoney(totals.total)}
              </span>
            </div>
            <CopyButton
              value={formatMoney(totals.total)}
              label="Copiar total"
              size="sm"
              className="w-full"
            />
          </CardContent>
        </Card>
      </div>

      {/* Acciones */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={exportPdf} className="gap-2">
          <FileDown className="size-4" aria-hidden />
          Exportar PDF
        </Button>
        <Button
          type="button"
          onClick={() => setSaveDialogOpen(true)}
          variant="outline"
          className={cn("gap-2")}
        >
          <Save className="size-4" aria-hidden />
          Guardar plantilla
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={newInvoice}
          className={cn("gap-2", "text-rose-600 hover:text-rose-700")}
        >
          <FilePlus2 className="size-4" aria-hidden />
          Nueva factura
        </Button>
      </div>

      {/* Diálogo para guardar plantilla */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar plantilla</DialogTitle>
            <DialogDescription>
              Se guardarán los datos del emisor, del cliente, la configuración y todas las líneas
              de la factura actual en este navegador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Nombre de la plantilla</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Ej. Servicios mensuales"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveTemplate();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveTemplate} className="gap-2">
              <Save className="size-4" aria-hidden />
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolShell>
  );
}

/* ---------- Generación del PDF (jsPDF + autoTable) ---------- */

interface PdfPayload {
  emisor: InvoiceParty;
  cliente: InvoiceParty;
  config: InvoiceConfig;
  lines: InvoiceLine[];
  totals: Totals;
  formatMoney: (value: number) => string;
}

function buildInvoicePdf(payload: PdfPayload): void {
  const { emisor, cliente, config, lines, totals, formatMoney } = payload;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const docWithTable = doc as unknown as { lastAutoTable?: { finalY: number } };

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const columnWidth = (pageWidth - margin * 2 - 10) / 2;

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(20, 20, 20);
  doc.text("FACTURA", margin, 24);
  doc.setFontSize(13);
  doc.setTextColor(100, 100, 100);
  doc.text(`N.º ${config.number.trim() || "FAC-001"}`, margin, 31);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const rightX = pageWidth - margin;
  const issue = parseDateInput(config.issueDate);
  const due = parseDateInput(config.dueDate);
  let headerY = 22;
  doc.text(`Fecha de emisión: ${issue ? formatDate(issue) : "—"}`, rightX, headerY, {
    align: "right",
  });
  headerY += 5;
  if (due) {
    doc.text(`Fecha de vencimiento: ${formatDate(due)}`, rightX, headerY, { align: "right" });
    headerY += 5;
  }
  doc.text(`Moneda: ${config.currency}`, rightX, headerY, { align: "right" });

  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.5);
  doc.line(margin, 37, pageWidth - margin, 37);

  // Bloques de emisor y cliente
  const drawParty = (
    x: number,
    title: string,
    party: InvoiceParty,
    includePhone: boolean,
  ): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(title.toUpperCase(), x, 45);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    const nameLines = doc.splitTextToSize(party.name.trim(), columnWidth).slice(0, 2);
    doc.text(nameLines, x, 51);
    let y = 51 + nameLines.length * 5 + 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    const details: string[] = [];
    if (party.docId.trim()) details.push(`Documento: ${party.docId.trim()}`);
    if (party.address.trim()) details.push(`Dirección: ${party.address.trim()}`);
    if (party.email.trim()) details.push(`Correo: ${party.email.trim()}`);
    if (includePhone && party.phone.trim()) details.push(`Teléfono: ${party.phone.trim()}`);
    const detailLines = details.length > 0 ? doc.splitTextToSize(details.join("\n"), columnWidth) : [];
    doc.text(detailLines, x, y);
    y += detailLines.length * 4.2;
    return y;
  };

  const emisorBottom = drawParty(margin, "Emisor", emisor, true);
  const clienteBottom = drawParty(margin + columnWidth + 10, "Cliente", cliente, false);

  // Tabla de líneas
  const tableStartY = Math.max(70, Math.max(emisorBottom, clienteBottom) + 10);
  autoTable(doc, {
    startY: tableStartY,
    head: [["Descripción", "Cant.", "Precio unit.", "Impuesto", "Importe"]],
    body: lines.map((line, index) => [
      line.description.trim(),
      String(numOr(line.quantity, 0)),
      formatMoney(numOr(line.unitPrice, 0)),
      formatPercent(line.taxRate),
      formatMoney(totals.items[index]?.amount ?? 0),
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.5,
      lineColor: [210, 210, 210],
      lineWidth: 0.15,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [238, 238, 238],
      textColor: [20, 20, 20],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: "wrap", halign: "left" },
      1: { cellWidth: 16, halign: "right" },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 32, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  let y = docWithTable.lastAutoTable?.finalY ?? tableStartY;
  if (y > pageHeight - 70) {
    doc.addPage();
    y = margin;
  }

  // Bloque de totales alineado a la derecha
  y += 8;
  const labelX = pageWidth - margin - 62;
  const valueX = pageWidth - margin;
  const drawTotalRow = (label: string, value: string, bold = false, size = 9.5) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(bold ? 20 : 70, bold ? 20 : 70, bold ? 20 : 70);
    doc.text(label, labelX, y);
    doc.text(value, valueX, y, { align: "right" });
    y += size > 10 ? 8 : 5.6;
  };

  drawTotalRow("Subtotal", formatMoney(totals.subtotal));
  if (totals.discount > 0) {
    drawTotalRow(
      `Descuento (${formatPercent(config.discountRate)})`,
      `- ${formatMoney(totals.discount)}`,
    );
  }
  drawTotalRow("Total impuestos", formatMoney(totals.taxes));
  y += 1;
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.3);
  doc.line(labelX, y, valueX, y);
  y += 7;
  drawTotalRow("TOTAL", formatMoney(totals.total), true, 13);

  // Notas
  if (config.notes.trim()) {
    if (y > pageHeight - 45) {
      doc.addPage();
      y = margin;
    }
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("NOTAS", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);
    const noteLines = doc.splitTextToSize(config.notes.trim(), pageWidth - margin * 2);
    doc.text(noteLines, margin, y + 5);
    y += 5 + noteLines.length * 4.2;
  }

  // Pie de página en todas las páginas
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text("Generado con OSK APPS — Herramientas online gratis", margin, pageHeight - 8);
    doc.text(
      `Fecha de generación: ${formatDate(new Date())} · Página ${page} de ${pageCount}`,
      rightX,
      pageHeight - 8,
      { align: "right" },
    );
  }

  const safeNumber =
    (config.number.trim() || "FAC-001").replace(/[\\/:*?"<>|\s]+/g, "-") || "FAC-001";
  doc.save(`factura-${safeNumber}.pdf`);
}
