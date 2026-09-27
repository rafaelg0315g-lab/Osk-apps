"use client";

import { useMemo, useState } from "react";
import { Calculator, Minus, Percent, Plus, ShieldCheck } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Mode = "add" | "extract";
type CurrencyCode = "COP" | "USD" | "EUR" | "MXN" | "PEN" | "ARS" | "CLP";

interface CountryRate {
  code: string;
  label: string;
  rate: number | null;
}

const COUNTRY_RATES: CountryRate[] = [
  { code: "CO", label: "Colombia — IVA 19 %", rate: 19 },
  { code: "MX", label: "México — IVA 16 %", rate: 16 },
  { code: "ES", label: "España — IVA 21 %", rate: 21 },
  { code: "PE", label: "Perú — IGV 18 %", rate: 18 },
  { code: "AR", label: "Argentina — IVA 21 %", rate: 21 },
  { code: "CL", label: "Chile — IVA 19 %", rate: 19 },
  { code: "EC", label: "Ecuador — IVA 15 %", rate: 15 },
  { code: "custom", label: "Tasa personalizada…", rate: null },
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

const CUSTOM_CODE = "custom";

function parseNumber(value: string): number {
  const cleaned = value.replace(",", ".");
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export default function VatCalculator() {
  const [amount, setAmount] = useState("100000");
  const [country, setCountry] = useState("CO");
  const [customRate, setCustomRate] = useState("19");
  const [mode, setMode] = useState<Mode>("add");
  const [currency, setCurrency] = useState<CurrencyCode>("COP");
  const [units, setUnits] = useState("1");

  const rate = useMemo(() => {
    if (country === CUSTOM_CODE) return clampRate(parseNumber(customRate));
    return COUNTRY_RATES.find((item) => item.code === country)?.rate ?? 0;
  }, [country, customRate]);

  const amountValue = useMemo(() => Math.max(0, parseNumber(amount)), [amount]);
  const unitsValue = useMemo(() => {
    const value = Math.floor(parseNumber(units));
    return value > 0 ? value : 1;
  }, [units]);

  const totals = useMemo(() => {
    const base = amountValue;
    if (mode === "add") {
      const iva = (base * rate) / 100;
      return { subtotal: base, iva, total: base + iva };
    }
    const subtotal = base / (1 + rate / 100);
    return { subtotal, iva: base - subtotal, total: base };
  }, [amountValue, mode, rate]);

  const formatMoney = useMemo(
    () =>
      new Intl.NumberFormat("es", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "COP" || currency === "CLP" ? 0 : 2,
        minimumFractionDigits: currency === "COP" || currency === "CLP" ? 0 : 2,
      }),
    [currency],
  );

  const formatPlain = useMemo(
    () => new Intl.NumberFormat("es", { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
    [],
  );

  const breakdown = useMemo(() => {
    const modeLabel = mode === "add" ? "Agregar IVA" : "Desglosar IVA";
    const lines = [
      `Desglose de IVA (OSK APPS)`,
      `Modo: ${modeLabel}`,
      `Tasa: ${formatPlain.format(rate)} %`,
      `Subtotal: ${formatMoney.format(totals.subtotal)}`,
      `IVA (${formatPlain.format(rate)} %): ${formatMoney.format(totals.iva)}`,
      `Total: ${formatMoney.format(totals.total)}`,
    ];
    if (unitsValue > 1) {
      lines.push(`— Por unidad (${unitsValue} unidades) —`);
      lines.push(`Subtotal: ${formatMoney.format(totals.subtotal / unitsValue)}`);
      lines.push(`IVA: ${formatMoney.format(totals.iva / unitsValue)}`);
      lines.push(`Total: ${formatMoney.format(totals.total / unitsValue)}`);
    }
    return lines.join("\n");
  }, [formatMoney, formatPlain, mode, rate, totals, unitsValue]);

  const showUnitsTable = unitsValue > 1 && amountValue > 0;

  const resultCards = [
    {
      label: "Subtotal",
      value: formatMoney.format(totals.subtotal),
      valueClass: "text-zinc-900 dark:text-zinc-100",
      borderClass: "border-t-zinc-400",
    },
    {
      label: `IVA (${formatPlain.format(rate)} %)`,
      value: formatMoney.format(totals.iva),
      valueClass: "text-amber-600",
      borderClass: "border-t-amber-500",
    },
    {
      label: "Total",
      value: formatMoney.format(totals.total),
      valueClass: "text-emerald-600",
      borderClass: "border-t-emerald-500",
    },
  ];

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="size-4 text-amber-600" aria-hidden />
            Datos del cálculo
          </CardTitle>
          <CardDescription>
            Elige si quieres añadir el IVA a una base o desglosarlo desde un
            total con IVA incluido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vat-amount">
                {mode === "add" ? "Monto sin IVA (base)" : "Monto total con IVA"}
              </Label>
              <Input
                id="vat-amount"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vat-units">Cantidad de unidades (opcional)</Label>
              <Input
                id="vat-units"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vat-country">País / tasa de IVA</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="vat-country" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_RATES.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vat-currency">Moneda</Label>
              <Select
                value={currency}
                onValueChange={(value) => setCurrency(value as CurrencyCode)}
              >
                <SelectTrigger id="vat-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {country === CUSTOM_CODE && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="vat-custom" className="flex items-center gap-1.5">
                  <Percent className="size-3.5" aria-hidden />
                  Tasa personalizada (%)
                </Label>
                <Input
                  id="vat-custom"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  inputMode="decimal"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  aria-describedby="vat-custom-hint"
                />
                <p id="vat-custom-hint" className="text-xs text-muted-foreground">
                  Valor entre 0 y 100. Ej.: 19 para un 19 %.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Modo de cálculo</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={mode}
              onValueChange={(value) => {
                if (value === "add" || value === "extract") setMode(value);
              }}
              className="w-full"
            >
              <ToggleGroupItem value="add" className="flex-1 gap-1.5">
                <Plus aria-hidden className="size-3.5" />
                Agregar IVA
              </ToggleGroupItem>
              <ToggleGroupItem value="extract" className="flex-1 gap-1.5">
                <Minus aria-hidden className="size-3.5" />
                Desglosar IVA
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {mode === "add"
                ? "Calcula el IVA sobre la base y muestra el total con impuesto."
                : "Extrae el IVA del total: útil cuando el precio ya incluye impuestos."}
            </p>
          </div>
        </CardContent>
      </Card>

      <section
        aria-label="Resultado del cálculo"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {resultCards.map((card) => (
          <Card key={card.label} className={`border-t-4 p-4 ${card.borderClass}`}>
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <p
              className={`mt-1 truncate text-2xl font-semibold tracking-tight ${card.valueClass}`}
              title={card.value}
            >
              {card.value}
            </p>
          </Card>
        ))}
      </section>

      {showUnitsTable && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Por unidad ({unitsValue} unidades)
            </CardTitle>
            <CardDescription>
              Monto unitario equivalente para cada concepto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Por unidad</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Subtotal</TableCell>
                    <TableCell className="text-right">
                      {formatMoney.format(totals.subtotal / unitsValue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney.format(totals.subtotal)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>IVA ({formatPlain.format(rate)} %)</TableCell>
                    <TableCell className="text-right">
                      {formatMoney.format(totals.iva / unitsValue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney.format(totals.iva)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney.format(totals.total / unitsValue)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney.format(totals.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="size-4 text-muted-foreground" aria-hidden />
            Desglose
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">{formatPlain.format(rate)} % de IVA</Badge>
          <Badge variant="secondary">{currency}</Badge>
          <Badge variant="secondary">
            {unitsValue} {unitsValue === 1 ? "unidad" : "unidades"}
          </Badge>
          <CopyButton value={breakdown} label="Copiar desglose" size="sm" />
        </CardContent>
      </Card>

      <Alert>
        <ShieldCheck className="size-4" aria-hidden />
        <AlertDescription>
          Todos los cálculos se realizan localmente en tu dispositivo: ningún
          dato se envía al servidor. Las tasas por país son las generales y no
          incluyen impuestos locales adicionales.
        </AlertDescription>
      </Alert>
    </ToolShell>
  );
}
