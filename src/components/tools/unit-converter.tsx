"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Ruler } from "lucide-react";

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
import { cn } from "@/lib/utils";

/**
 * Definición de una unidad dentro de una categoría.
 * `factor` expresa cuántas unidades base equivale una unidad
 * (ej. 1 km = 1000 m, por lo tanto factor = 1000).
 */
interface Unit {
  id: string;
  name: string;
  symbol: string;
  factor: number;
}

interface Category {
  id: string;
  label: string;
  units: Unit[];
  convert: (value: number, fromId: string, toId: string) => number;
}

const LENGTH_UNITS: Unit[] = [
  { id: "km", name: "Kilómetro", symbol: "km", factor: 1000 },
  { id: "m", name: "Metro", symbol: "m", factor: 1 },
  { id: "cm", name: "Centímetro", symbol: "cm", factor: 0.01 },
  { id: "mm", name: "Milímetro", symbol: "mm", factor: 0.001 },
  { id: "um", name: "Micrómetro", symbol: "μm", factor: 0.000001 },
  { id: "mi", name: "Milla", symbol: "mi", factor: 1609.344 },
  { id: "yd", name: "Yarda", symbol: "yd", factor: 0.9144 },
  { id: "ft", name: "Pie", symbol: "ft", factor: 0.3048 },
  { id: "in", name: "Pulgada", symbol: "in", factor: 0.0254 },
  { id: "nmi", name: "Milla náutica", symbol: "nmi", factor: 1852 },
];

const MASS_UNITS: Unit[] = [
  { id: "t", name: "Tonelada", symbol: "t", factor: 1000 },
  { id: "kg", name: "Kilogramo", symbol: "kg", factor: 1 },
  { id: "g", name: "Gramo", symbol: "g", factor: 0.001 },
  { id: "mg", name: "Miligramo", symbol: "mg", factor: 0.000001 },
  { id: "lb", name: "Libra", symbol: "lb", factor: 0.45359237 },
  { id: "oz", name: "Onza", symbol: "oz", factor: 0.028349523125 },
  { id: "st", name: "Piedra", symbol: "st", factor: 6.35029318 },
];

const TEMPERATURE_UNITS: Unit[] = [
  { id: "c", name: "Grado Celsius", symbol: "°C", factor: 1 },
  { id: "f", name: "Grado Fahrenheit", symbol: "°F", factor: 1 },
  { id: "k", name: "Kelvin", symbol: "K", factor: 1 },
];

const VOLUME_UNITS: Unit[] = [
  { id: "l", name: "Litro", symbol: "L", factor: 1 },
  { id: "ml", name: "Mililitro", symbol: "mL", factor: 0.001 },
  { id: "m3", name: "Metro cúbico", symbol: "m³", factor: 1000 },
  { id: "cm3", name: "Centímetro cúbico", symbol: "cm³", factor: 0.001 },
  { id: "galus", name: "Galón (EE. UU.)", symbol: "gal US", factor: 3.785411784 },
  { id: "galuk", name: "Galón (R. Unido)", symbol: "gal UK", factor: 4.54609 },
  { id: "pt", name: "Pinta (EE. UU.)", symbol: "pt", factor: 0.473176473 },
  { id: "cup", name: "Taza (EE. UU.)", symbol: "cup", factor: 0.2365882365 },
  { id: "floz", name: "Onza líquida (EE. UU.)", symbol: "fl oz", factor: 0.0295735295625 },
  { id: "tbsp", name: "Cucharada", symbol: "tbsp", factor: 0.01478676478125 },
];

const AREA_UNITS: Unit[] = [
  { id: "km2", name: "Kilómetro cuadrado", symbol: "km²", factor: 1000000 },
  { id: "ha", name: "Hectárea", symbol: "ha", factor: 10000 },
  { id: "m2", name: "Metro cuadrado", symbol: "m²", factor: 1 },
  { id: "cm2", name: "Centímetro cuadrado", symbol: "cm²", factor: 0.0001 },
  { id: "mm2", name: "Milímetro cuadrado", symbol: "mm²", factor: 0.000001 },
  { id: "mi2", name: "Milla cuadrada", symbol: "mi²", factor: 2589988.110336 },
  { id: "acre", name: "Acre", symbol: "acre", factor: 4046.8564224 },
  { id: "yd2", name: "Yarda cuadrada", symbol: "yd²", factor: 0.83612736 },
  { id: "ft2", name: "Pie cuadrado", symbol: "ft²", factor: 0.09290304 },
  { id: "in2", name: "Pulgada cuadrada", symbol: "in²", factor: 0.00064516 },
];

const SPEED_UNITS: Unit[] = [
  { id: "kmh", name: "Kilómetro por hora", symbol: "km/h", factor: 0.2777777777777778 },
  { id: "ms", name: "Metro por segundo", symbol: "m/s", factor: 1 },
  { id: "mph", name: "Milla por hora", symbol: "mph", factor: 0.44704 },
  { id: "fts", name: "Pie por segundo", symbol: "ft/s", factor: 0.3048 },
  { id: "kn", name: "Nudo", symbol: "kn", factor: 0.5144444444444445 },
];

const STORAGE_UNITS: Unit[] = [
  { id: "bit", name: "Bit", symbol: "bit", factor: 0.125 },
  { id: "b", name: "Byte", symbol: "B", factor: 1 },
  { id: "kb", name: "Kilobyte (decimal)", symbol: "KB", factor: 1000 },
  { id: "mb", name: "Megabyte (decimal)", symbol: "MB", factor: 1000000 },
  { id: "gb", name: "Gigabyte (decimal)", symbol: "GB", factor: 1000000000 },
  { id: "tb", name: "Terabyte (decimal)", symbol: "TB", factor: 1000000000000 },
  { id: "kib", name: "Kibibyte (binario)", symbol: "KiB", factor: 1024 },
  { id: "mib", name: "Mebibyte (binario)", symbol: "MiB", factor: 1048576 },
  { id: "gib", name: "Gibibyte (binario)", symbol: "GiB", factor: 1073741824 },
  { id: "tib", name: "Tebibyte (binario)", symbol: "TiB", factor: 1099511627776 },
];

const TIME_UNITS: Unit[] = [
  { id: "ms", name: "Milisegundo", symbol: "ms", factor: 0.001 },
  { id: "s", name: "Segundo", symbol: "s", factor: 1 },
  { id: "min", name: "Minuto", symbol: "min", factor: 60 },
  { id: "h", name: "Hora", symbol: "h", factor: 3600 },
  { id: "d", name: "Día", symbol: "d", factor: 86400 },
  { id: "wk", name: "Semana", symbol: "sem", factor: 604800 },
  { id: "mo", name: "Mes (30 días)", symbol: "mes", factor: 2592000 },
  { id: "yr", name: "Año (365 días)", symbol: "año", factor: 31536000 },
];

/** Crea una función de conversión lineal a partir de los factores de cada unidad. */
function linearConvert(units: Unit[]) {
  return (value: number, fromId: string, toId: string): number => {
    const from = units.find((u) => u.id === fromId);
    const to = units.find((u) => u.id === toId);
    if (!from || !to) return NaN;
    return (value * from.factor) / to.factor;
  };
}

/** Convierte cualquier unidad de temperatura a Celsius. */
function toCelsius(value: number, unitId: string): number {
  if (unitId === "f") return ((value - 32) * 5) / 9;
  if (unitId === "k") return value - 273.15;
  return value;
}

/** Convierte desde Celsius a la unidad de temperatura indicada. */
function fromCelsius(celsius: number, unitId: string): number {
  if (unitId === "f") return (celsius * 9) / 5 + 32;
  if (unitId === "k") return celsius + 273.15;
  return celsius;
}

const CATEGORIES: Category[] = [
  { id: "longitud", label: "Longitud", units: LENGTH_UNITS, convert: linearConvert(LENGTH_UNITS) },
  { id: "masa", label: "Masa", units: MASS_UNITS, convert: linearConvert(MASS_UNITS) },
  {
    id: "temperatura",
    label: "Temperatura",
    units: TEMPERATURE_UNITS,
    convert: (value, fromId, toId) => fromCelsius(toCelsius(value, fromId), toId),
  },
  { id: "volumen", label: "Volumen", units: VOLUME_UNITS, convert: linearConvert(VOLUME_UNITS) },
  { id: "area", label: "Área", units: AREA_UNITS, convert: linearConvert(AREA_UNITS) },
  { id: "velocidad", label: "Velocidad", units: SPEED_UNITS, convert: linearConvert(SPEED_UNITS) },
  {
    id: "almacenamiento",
    label: "Almacenamiento",
    units: STORAGE_UNITS,
    convert: linearConvert(STORAGE_UNITS),
  },
  { id: "tiempo", label: "Tiempo", units: TIME_UNITS, convert: linearConvert(TIME_UNITS) },
];

/**
 * Formato inteligente: hasta 6 decimales, sin ceros sobrantes,
 * con separadores en formato español y notación exponencial solo en extremos.
 */
function formatSmart(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e15 || abs < 1e-9) return value.toExponential(4);
  const numeric = abs < 0.001 ? Number(value.toPrecision(6)) : Number(value.toFixed(6));
  const fixed = numeric.toString();
  if (fixed.includes("e")) return fixed.replace(".", ",");
  const [intPart, decPart] = fixed.split(".");
  const intFormatted = Number(intPart).toLocaleString("es");
  return decPart ? `${intFormatted},${decPart}` : intFormatted;
}

function findUnit(category: Category, unitId: string): Unit {
  return category.units.find((u) => u.id === unitId) ?? category.units[0];
}

const SCROLLBAR_CLASS =
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent";

export default function UnitConverterTool() {
  const [categoryId, setCategoryId] = useState<string>(CATEGORIES[0].id);
  const [valueInput, setValueInput] = useState("1");
  const [fromId, setFromId] = useState(CATEGORIES[0].units[0].id);
  const [toId, setToId] = useState(CATEGORIES[0].units[1].id);

  const category = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0];

  const handleCategoryChange = (nextId: string) => {
    const next = CATEGORIES.find((c) => c.id === nextId);
    if (!next) return;
    setCategoryId(next.id);
    setFromId(next.units[0].id);
    setToId(next.units[1].id);
  };

  const parsedValue = Number(valueInput.replace(",", "."));
  const hasValue = valueInput.trim() !== "" && Number.isFinite(parsedValue);
  const value = hasValue ? parsedValue : 0;

  const fromUnit = findUnit(category, fromId);
  const toUnit = findUnit(category, toId);

  const result = useMemo(
    () => (hasValue ? category.convert(value, fromUnit.id, toUnit.id) : NaN),
    [category, fromUnit, toUnit, value, hasValue],
  );

  const equivalences = useMemo(() => {
    if (!hasValue) return [];
    return category.units
      .filter((u) => u.id !== fromUnit.id)
      .map((u) => ({ unit: u, value: category.convert(value, fromUnit.id, u.id) }));
  }, [category, fromUnit, value, hasValue]);

  const swapUnits = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const resultText = `${formatSmart(result)} ${toUnit.symbol}`;

  return (
    <ToolShell>
      <Tabs value={categoryId} onValueChange={handleCategoryChange}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className="px-2.5 text-xs sm:text-sm">
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={categoryId} className="mt-6 space-y-6">
          {/* Entrada */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Ruler className="size-4 text-teal-600" aria-hidden />
                Conversión en {category.label.toLowerCase()}
              </CardTitle>
              <CardDescription>
                El resultado se calcula automáticamente al escribir.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="unit-value">Valor</Label>
                <Input
                  id="unit-value"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  placeholder="Introduce un valor numérico"
                  className="text-base"
                />
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="unit-from">De</Label>
                  <Select value={fromUnit.id} onValueChange={setFromId}>
                    <SelectTrigger id="unit-from" className="w-full">
                      <SelectValue placeholder="Unidad de origen" />
                    </SelectTrigger>
                    <SelectContent>
                      {category.units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={swapUnits}
                  aria-label="Invertir unidades"
                  title="Invertir unidades"
                  className="mb-0.5"
                >
                  <ArrowUpDown className="size-4" aria-hidden />
                </Button>

                <div className="space-y-1.5">
                  <Label htmlFor="unit-to">A</Label>
                  <Select value={toUnit.id} onValueChange={setToId}>
                    <SelectTrigger id="unit-to" className="w-full">
                      <SelectValue placeholder="Unidad de destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {category.units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!hasValue && (
                <p className="text-sm text-amber-600" role="alert">
                  Introduce un valor numérico para ver la conversión.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Resultado */}
          <Card className="border-teal-600/30">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Resultado
              </p>
              {hasValue ? (
                <>
                  <p className="break-all text-3xl font-bold tabular-nums sm:text-4xl">
                    {formatSmart(result)}{" "}
                    <span className="text-xl font-semibold text-muted-foreground sm:text-2xl">
                      {toUnit.symbol}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatSmart(value)} {fromUnit.symbol} ({fromUnit.name}) equivalen a{" "}
                    {toUnit.name.toLowerCase()}
                  </p>
                  <CopyButton value={resultText} label="Copiar resultado" size="sm" />
                </>
              ) : (
                <p className="text-2xl font-semibold text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>

          {/* Equivalencias */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Equivalencias de {formatSmart(value)} {fromUnit.symbol}
              </CardTitle>
              <CardDescription>
                El mismo valor convertido a todas las unidades de {category.label.toLowerCase()}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "max-h-96 space-y-1 overflow-y-auto pr-1",
                  SCROLLBAR_CLASS,
                )}
              >
                {equivalences.map(({ unit, value: equivalent }) => (
                  <div
                    key={unit.id}
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-lg border px-3 py-2 text-sm",
                      unit.id === toUnit.id && "border-teal-600/40 bg-teal-600/5",
                    )}
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      {unit.name} ({unit.symbol})
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatSmart(equivalent)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </ToolShell>
  );
}
