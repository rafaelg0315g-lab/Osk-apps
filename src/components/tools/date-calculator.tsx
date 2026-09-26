"use client";

import { useMemo, useState } from "react";
import {
  add,
  differenceInBusinessDays,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  startOfDay,
  sub,
  type Duration,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarRange, CalendarPlus, Copy } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { ToolShell } from "@/components/shared/tool-shell";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

type Operation = "add" | "sub";

interface DateDiffResult {
  start: Date;
  end: Date;
  swapped: boolean;
  years: number;
  months: number;
  days: number;
  totalDays: number;
  businessDays: number;
  weeks: number;
  remainingDays: number;
}

function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Parsea un input "yyyy-MM-dd" a Date local a medianoche; devuelve null si es inválido. */
function parseDateInput(iso: string): Date | null {
  if (!iso) return null;
  const parsed = parseISO(iso);
  return isValid(parsed) ? startOfDay(parsed) : null;
}

function formatLong(date: Date): string {
  return format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
}

function formatWeekday(date: Date): string {
  const weekday = format(date, "EEEE", { locale: es });
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

/** Resta componentes y ajusta préstamos para obtener el desglose años/meses/días. */
function breakdownYMD(start: Date, end: Date): { years: number; months: number; days: number } {
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  if (days < 0) {
    months -= 1;
    // Días del mes anterior a la fecha final (préstamo)
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

function composeDuration(unitId: string, quantity: number): Duration {
  switch (unitId) {
    case "weeks":
      return { weeks: quantity };
    case "months":
      return { months: quantity };
    case "years":
      return { years: quantity };
    default:
      return { days: quantity };
  }
}

const DURATION_UNITS = [
  { id: "days", label: "Días", singular: "día", plural: "días" },
  { id: "weeks", label: "Semanas", singular: "semana", plural: "semanas" },
  { id: "months", label: "Meses", singular: "mes", plural: "meses" },
  { id: "years", label: "Años", singular: "año", plural: "años" },
];

function findDurationUnit(unitId: string) {
  return DURATION_UNITS.find((u) => u.id === unitId) ?? DURATION_UNITS[0];
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function StatBlock({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border p-4", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function DateCalculatorTool() {
  const today = useMemo(() => startOfDay(new Date()), []);

  // Pestaña 1: diferencia entre fechas
  const [startDate, setStartDate] = useState(() => toISODate(today));
  const [endDate, setEndDate] = useState(() => toISODate(add(today, { days: 30 })));

  // Pestaña 2: sumar o restar
  const [baseDate, setBaseDate] = useState(() => toISODate(today));
  const [operation, setOperation] = useState<Operation>("add");
  const [amountInput, setAmountInput] = useState("30");
  const [unitId, setUnitId] = useState("days");

  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);

  const diff = useMemo<DateDiffResult | null>(() => {
    const s = parseDateInput(startDate);
    const e = parseDateInput(endDate);
    if (!s || !e) return null;
    const swapped = e < s;
    const from = swapped ? e : s;
    const to = swapped ? s : e;
    const totalDays = differenceInCalendarDays(to, from);
    const ymd = breakdownYMD(from, to);
    return {
      start: s,
      end: e,
      swapped,
      years: ymd.years,
      months: ymd.months,
      days: ymd.days,
      totalDays,
      businessDays: differenceInBusinessDays(to, from),
      weeks: Math.floor(totalDays / 7),
      remainingDays: totalDays % 7,
    };
  }, [startDate, endDate]);

  const amount = Number(amountInput.replace(",", "."));
  const amountValid = Number.isFinite(amount) && amount >= 1;

  const operationResult = useMemo(() => {
    const base = parseDateInput(baseDate);
    if (!base || !amountValid) return null;
    const duration = composeDuration(unitId, amount);
    return operation === "add" ? add(base, duration) : sub(base, duration);
  }, [baseDate, unitId, amount, amountValid, operation]);

  const daysFromToday = useMemo(() => {
    if (!operationResult) return null;
    return differenceInCalendarDays(startOfDay(operationResult), today);
  }, [operationResult, today]);

  const diffSummary = diff
    ? [
        `Desde: ${formatLong(diff.start)}`,
        `Hasta: ${formatLong(diff.end)}`,
        `Duración: ${diff.years} ${pluralize(diff.years, "año", "años")}, ${diff.months} ${pluralize(diff.months, "mes", "meses")}, ${diff.days} ${pluralize(diff.days, "día", "días")}`,
        `Total de días: ${diff.totalDays}`,
        `Días hábiles: ${diff.businessDays}`,
        `Semanas: ${diff.weeks} ${pluralize(diff.weeks, "semana", "semanas")} y ${diff.remainingDays} ${pluralize(diff.remainingDays, "día", "días")}`,
      ].join("\n")
    : "";

  return (
    <ToolShell>
      <Tabs defaultValue="diff">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="diff" className="gap-1.5 text-xs sm:text-sm">
            <CalendarRange className="size-4" aria-hidden />
            Diferencia entre fechas
          </TabsTrigger>
          <TabsTrigger value="offset" className="gap-1.5 text-xs sm:text-sm">
            <CalendarPlus className="size-4" aria-hidden />
            Sumar o restar
          </TabsTrigger>
        </TabsList>

        {/* Pestaña: diferencia entre fechas */}
        <TabsContent value="diff" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selecciona las fechas</CardTitle>
              <CardDescription>
                Calcula el tiempo transcurrido entre dos fechas, incluyendo días hábiles.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="diff-start">Fecha inicial</Label>
                <Input
                  id="diff-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="diff-end">Fecha final</Label>
                <Input
                  id="diff-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              {!start && startDate && (
                <p className="text-sm text-amber-600 sm:col-span-2" role="alert">
                  La fecha inicial no es válida.
                </p>
              )}
              {!end && endDate && (
                <p className="text-sm text-amber-600 sm:col-span-2" role="alert">
                  La fecha final no es válida.
                </p>
              )}
            </CardContent>
          </Card>

          {diff && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resultado</CardTitle>
                <CardDescription>
                  De {formatLong(diff.start)} a {formatLong(diff.end)}
                  {diff.swapped
                    ? ". Las fechas estaban invertidas: se muestra la diferencia en valor absoluto."
                    : "."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/40 p-4 text-center">
                  <p className="text-xl font-bold sm:text-2xl">
                    {diff.years} {pluralize(diff.years, "año", "años")},{" "}
                    {diff.months} {pluralize(diff.months, "mes", "meses")},{" "}
                    {diff.days} {pluralize(diff.days, "día", "días")}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <StatBlock
                    label="Total de días"
                    value={`${diff.totalDays} ${pluralize(diff.totalDays, "día", "días")}`}
                    hint="Incluye fines de semana"
                  />
                  <StatBlock
                    label="Días hábiles"
                    value={`${diff.businessDays} ${pluralize(diff.businessDays, "día hábil", "días hábiles")}`}
                    hint="De lunes a viernes"
                  />
                  <StatBlock
                    label="Semanas"
                    value={`${diff.weeks} ${pluralize(diff.weeks, "semana", "semanas")} y ${diff.remainingDays} ${pluralize(diff.remainingDays, "día", "días")}`}
                    hint={`${diff.weeks} × 7 + ${diff.remainingDays} = ${diff.totalDays}`}
                    className="sm:col-span-2"
                  />
                </div>
                <CopyButton value={diffSummary} label="Copiar desglose" size="sm" />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Pestaña: sumar o restar */}
        <TabsContent value="offset" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configura la operación</CardTitle>
              <CardDescription>
                Suma o resta días, semanas, meses o años a una fecha inicial.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="offset-base">Fecha inicial</Label>
                <Input
                  id="offset-base"
                  type="date"
                  value={baseDate}
                  onChange={(e) => setBaseDate(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Operación</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={operation}
                    onValueChange={(next) => {
                      if (next === "add" || next === "sub") setOperation(next);
                    }}
                    className="w-full"
                  >
                    <ToggleGroupItem value="add" className="flex-1" aria-label="Sumar">
                      Sumar
                    </ToggleGroupItem>
                    <ToggleGroupItem value="sub" className="flex-1" aria-label="Restar">
                      Restar
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="offset-amount">Cantidad</Label>
                  <Input
                    id="offset-amount"
                    type="number"
                    min={1}
                    step="1"
                    inputMode="numeric"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="offset-unit">Unidad</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger id="offset-unit" className="w-full">
                    <SelectValue placeholder="Elige una unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_UNITS.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {baseDate && !parseDateInput(baseDate) && (
                <p className="text-sm text-amber-600" role="alert">
                  La fecha inicial no es válida.
                </p>
              )}
              {amountInput.trim() !== "" && !amountValid && (
                <p className="text-sm text-amber-600" role="alert">
                  Introduce una cantidad mayor o igual que 1.
                </p>
              )}
            </CardContent>
          </Card>

          {operationResult ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Copy className="size-4 text-violet-600" aria-hidden />
                  Fecha resultante
                </CardTitle>
                <CardDescription>
                  {operation === "add" ? "Sumando" : "Restando"} {amountInput}{" "}
                  {amount === 1
                    ? findDurationUnit(unitId).singular
                    : findDurationUnit(unitId).plural}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-violet-600/30 bg-violet-600/5 p-4 text-center">
                  <p className="text-xl font-bold sm:text-2xl">{formatLong(operationResult)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatWeekday(operationResult)}
                  </p>
                </div>
                <StatBlock
                  label="Diferencia con hoy"
                  value={`${daysFromToday !== null && daysFromToday < 0 ? "" : "+"}${daysFromToday ?? 0} ${pluralize(Math.abs(daysFromToday ?? 0), "día", "días")}`}
                  hint={
                    daysFromToday !== null && daysFromToday < 0
                      ? "Valor negativo: la fecha resultante es anterior a hoy"
                      : "Días entre hoy y la fecha resultante"
                  }
                />
                <CopyButton
                  value={formatLong(operationResult)}
                  label="Copiar fecha resultante"
                  size="sm"
                />
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </ToolShell>
  );
}
