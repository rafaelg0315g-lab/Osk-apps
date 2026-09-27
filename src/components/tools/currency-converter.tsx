"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  CircleAlert,
  Coins,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/shared/copy-button";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const CACHE_KEY = "osk-fx-rates";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CurrencyInfo {
  code: string;
  name: string;
}

const CURRENCIES: CurrencyInfo[] = [
  { code: "USD", name: "Dólar estadounidense" },
  { code: "EUR", name: "Euro" },
  { code: "COP", name: "Peso colombiano" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "PEN", name: "Sol peruano" },
  { code: "ARS", name: "Peso argentino" },
  { code: "CLP", name: "Peso chileno" },
  { code: "BRL", name: "Real brasileño" },
  { code: "GBP", name: "Libra esterlina" },
  { code: "JPY", name: "Yen japonés" },
  { code: "CAD", name: "Dólar canadiense" },
  { code: "CHF", name: "Franco suizo" },
];

/** Tasas de respaldo aproximadas (base USD), solo si fallan la API y la caché. */
const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  COP: 3900,
  MXN: 18,
  PEN: 3.75,
  ARS: 1010,
  CLP: 940,
  BRL: 5.4,
  GBP: 0.78,
  JPY: 155,
  CAD: 1.37,
  CHF: 0.88,
};

type RatesSource = "live" | "cache" | "fallback";

interface RatesCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

interface ApiResult {
  result?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
}

function readCache(): RatesCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RatesCache>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.fetchedAt !== "number" ||
      !parsed.rates ||
      typeof parsed.rates !== "object"
    ) {
      return null;
    }
    return { rates: parsed.rates, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function saveCache(cache: RatesCache): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Almacenamiento no disponible: se ignora.
  }
}

async function fetchLiveRates(): Promise<RatesCache | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) return null;
    const data = (await res.json()) as ApiResult;
    if (data.result !== "success" || !data.rates) return null;
    const fetchedAt = data.time_last_update_utc
      ? new Date(data.time_last_update_utc).getTime()
      : Date.now();
    return {
      rates: data.rates,
      fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function formatMoney(code: string, value: number): string {
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency: code }).format(value);
  } catch {
    return new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(value);
  }
}

export default function CurrencyConverter() {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [ratesDate, setRatesDate] = useState<Date | null>(null);
  const [source, setSource] = useState<RatesSource>("cache");
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("COP");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const cached = readCache();
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        if (!cancelled) {
          setRates(cached.rates);
          setRatesDate(new Date(cached.fetchedAt));
          setSource("cache");
          setLoading(false);
        }
        return;
      }
      const fresh = await fetchLiveRates();
      if (cancelled) return;
      if (fresh) {
        saveCache(fresh);
        setRates(fresh.rates);
        setRatesDate(new Date(fresh.fetchedAt));
        setSource("live");
      } else if (cached) {
        setRates(cached.rates);
        setRatesDate(new Date(cached.fetchedAt));
        setSource("cache");
      } else {
        setRates(FALLBACK_RATES);
        setRatesDate(new Date());
        setSource("fallback");
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const amountValue = useMemo(() => {
    const num = Number.parseFloat(amount.replace(",", "."));
    return Number.isFinite(num) && num >= 0 ? num : 0;
  }, [amount]);

  const rate = useMemo(() => {
    if (!rates) return null;
    const fromRate = rates[from];
    const toRate = rates[to];
    if (!fromRate || !toRate) return null;
    return toRate / fromRate;
  }, [rates, from, to]);

  const converted = rate !== null ? amountValue * rate : null;

  const formatRate = useMemo(
    () =>
      new Intl.NumberFormat("es", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
    [],
  );

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const reload = async () => {
    setLoading(true);
    const fresh = await fetchLiveRates();
    if (fresh) {
      saveCache(fresh);
      setRates(fresh.rates);
      setRatesDate(new Date(fresh.fetchedAt));
      setSource("live");
      toast.success("Tasas actualizadas");
    } else {
      toast.error("No se pudieron obtener tasas actualizadas");
    }
    setLoading(false);
  };

  const equivalenceText = useMemo(() => {
    if (!rates || converted === null) return "";
    const lines = [`${formatMoney(from, amountValue)} = ${formatMoney(to, converted)}`];
    for (const info of CURRENCIES) {
      if (info.code === to || !rates[info.code] || !rates[from]) continue;
      const value = (amountValue / rates[from]) * rates[info.code];
      lines.push(`${info.name} (${info.code}): ${formatMoney(info.code, value)}`);
    }
    return lines.join("\n");
  }, [rates, from, to, amountValue, converted]);

  const sourceBadge = {
    live: { label: "Tasas actualizadas", className: "bg-emerald-600 text-white" },
    cache: { label: "Tasas en caché", className: "bg-amber-500 text-white" },
    fallback: { label: "Tasas aproximadas", className: "bg-zinc-500 text-white" },
  }[source];

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="size-4 text-teal-600" aria-hidden />
            Conversor de divisas
          </CardTitle>
          <CardDescription>
            Convierte entre monedas con tasas de cambio actualizadas a diario.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="fx-amount">Monto</Label>
                <Input
                  id="fx-amount"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fx-from">De</Label>
                <Select value={from} onValueChange={setFrom}>
                  <SelectTrigger id="fx-from" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((info) => (
                      <SelectItem key={info.code} value={info.code}>
                        {info.name} ({info.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={swap}
              aria-label="Intercambiar monedas"
              className="mb-1 self-center sm:self-end"
            >
              <ArrowLeftRight className="size-4" aria-hidden />
            </Button>
            <div className="space-y-1.5">
              <Label htmlFor="fx-to">A</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger id="fx-to" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((info) => (
                    <SelectItem key={info.code} value={info.code}>
                      {info.name} ({info.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
              />
              Cargando tasas de cambio…
            </div>
          ) : (
            converted !== null &&
            rate !== null && (
              <div className="space-y-3 rounded-lg border border-teal-600/30 bg-teal-500/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Resultado
                  </p>
                  <Badge variant="secondary" className={sourceBadge.className}>
                    {sourceBadge.label}
                  </Badge>
                </div>
                <p
                  className="text-3xl font-semibold tracking-tight text-teal-700 dark:text-teal-400"
                  aria-live="polite"
                >
                  {formatMoney(to, converted)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(from, amountValue)} equivalen a{" "}
                  <span className="font-medium text-foreground">
                    {formatMoney(to, converted)}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  1 {from} = {formatRate.format(rate)} {to}
                </p>
                {ratesDate && (
                  <p className="text-xs text-muted-foreground">
                    Fecha de la tasa: {formatDate(ratesDate)}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton
                    value={`${formatMoney(from, amountValue)} = ${formatMoney(to, converted)}`}
                    label="Copiar resultado"
                    size="sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={reload}
                    className="gap-2"
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Actualizar tasas
                  </Button>
                </div>
              </div>
            )
          )}

          {source === "fallback" && !loading && (
            <Alert>
              <CircleAlert className="size-4" aria-hidden />
              <AlertDescription>
                No se pudieron obtener tasas actualizadas ni usar la caché. Se
                muestran tasas de referencia aproximadas con fines informativos.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {rates && rate !== null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Equivalencias</CardTitle>
            <CardDescription>
              Tu monto convertido al resto de monedas disponibles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-96 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Moneda</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-right">Equivalencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CURRENCIES.filter((info) => info.code !== to && rates[info.code]).map(
                    (info) => {
                      const value = (amountValue / rates[from]) * rates[info.code];
                      return (
                        <TableRow key={info.code}>
                          <TableCell>{info.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{info.code}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMoney(info.code, value)}
                          </TableCell>
                        </TableRow>
                      );
                    },
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <CopyButton value={equivalenceText} label="Copiar equivalencias" size="sm" />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" aria-hidden />
                Las tasas provienen de open.er-api.com; los cálculos son locales.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
