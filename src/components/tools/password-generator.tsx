"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { ToolShell } from "@/components/shared/tool-shell";
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
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const CHARSET_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CHARSET_LOWER = "abcdefghijklmnopqrstuvwxyz";
const CHARSET_DIGITS = "0123456789";
const CHARSET_SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?";
const AMBIGUOUS_CHARS = new Set(["l", "1", "I", "O", "0", "o"]);

const COMMON_SEQUENCES = [
  "qwerty",
  "password",
  "contrasena",
  "contraseña",
  "admin",
  "123456",
  "654321",
  "abcdef",
  "asdfgh",
  "letmein",
];

interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

const DEFAULT_OPTIONS: PasswordOptions = {
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeAmbiguous: false,
};

function buildPool(options: PasswordOptions): string {
  let pool = "";
  if (options.uppercase) pool += CHARSET_UPPER;
  if (options.lowercase) pool += CHARSET_LOWER;
  if (options.numbers) pool += CHARSET_DIGITS;
  if (options.symbols) pool += CHARSET_SYMBOLS;
  if (options.excludeAmbiguous) {
    pool = [...pool].filter((c) => !AMBIGUOUS_CHARS.has(c)).join("");
  }
  return pool;
}

/** Genera una cadena aleatoria criptográficamente segura, sin sesgo de módulo. */
function generateSecureString(pool: string, length: number): string {
  if (!pool || length <= 0) return "";
  const max = pool.length;
  const limit = Math.floor(0x100000000 / max) * max;
  const result: string[] = [];
  const buffer = new Uint32Array(64);
  while (result.length < length) {
    crypto.getRandomValues(buffer);
    for (let i = 0; i < buffer.length && result.length < length; i++) {
      if (buffer[i] < limit) {
        result.push(pool[buffer[i] % max]);
      }
    }
  }
  return result.join("");
}

interface Strength {
  label: string;
  percent: number;
  barClass: string;
  badgeClass: string;
  bold: boolean;
}

function getStrength(entropyBits: number): Strength {
  const percent = Math.min(100, Math.max(0, Math.round(entropyBits)));
  if (entropyBits < 40) {
    return {
      label: "Débil",
      percent,
      barClass: "[&_[data-slot=progress-indicator]]:bg-rose-500",
      badgeClass:
        "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
      bold: false,
    };
  }
  if (entropyBits < 60) {
    return {
      label: "Media",
      percent,
      barClass: "[&_[data-slot=progress-indicator]]:bg-amber-500",
      badgeClass:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
      bold: false,
    };
  }
  if (entropyBits < 90) {
    return {
      label: "Fuerte",
      percent,
      barClass: "[&_[data-slot=progress-indicator]]:bg-emerald-500",
      badgeClass:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
      bold: false,
    };
  }
  return {
    label: "Excelente",
    percent: Math.min(100, percent),
    barClass: "[&_[data-slot=progress-indicator]]:bg-emerald-500",
    badgeClass:
      "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    bold: true,
  };
}

function hasObviousSequence(password: string): boolean {
  const value = password.toLowerCase();
  if (COMMON_SEQUENCES.some((seq) => value.includes(seq))) return true;
  let run = 1;
  for (let i = 1; i < value.length; i++) {
    const diff = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (diff === 1 || diff === -1) {
      run++;
      if (run >= 3) return true;
    } else {
      run = 1;
    }
  }
  return false;
}

function hasExcessRepeats(password: string): boolean {
  if (password.length < 4) return false;
  if (/(.)\1\1/.test(password)) return true;
  const counts = new Map<string, number>();
  for (const ch of password) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  return password.length >= 8 && maxCount / password.length > 0.5;
}

function StrengthMeter({ entropyBits }: { entropyBits: number }) {
  const strength = getStrength(entropyBits);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Fortaleza</span>
        <Badge variant="outline" className={strength.badgeClass}>
          <span className={cn(strength.bold && "font-bold")}>
            {strength.label} · {Math.round(entropyBits)} bits
          </span>
        </Badge>
      </div>
      <Progress
        value={strength.percent}
        aria-label={`Fortaleza: ${strength.label}`}
        className={cn(
          "[&_[data-slot=progress-indicator]]:transition-all",
          strength.barClass
        )}
      />
    </div>
  );
}

export default function PasswordGenerator() {
  const [options, setOptions] = useState<PasswordOptions>(DEFAULT_OPTIONS);
  const [password, setPassword] = useState(() =>
    generateSecureString(buildPool(DEFAULT_OPTIONS), DEFAULT_OPTIONS.length)
  );

  const [passwordToCheck, setPasswordToCheck] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const pool = useMemo(() => buildPool(options), [options]);
  const generatorEntropy = useMemo(
    () => (pool ? options.length * Math.log2(pool.length) : 0),
    [pool, options.length]
  );

  const canGenerate = pool.length > 0;

  const handleGenerate = () => {
    if (!canGenerate) {
      setPassword("");
      return;
    }
    setPassword(generateSecureString(pool, options.length));
  };

  const updateOption = <K extends keyof PasswordOptions>(
    key: K,
    value: PasswordOptions[K]
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const validatorAnalysis = useMemo(() => {
    const value = passwordToCheck;
    let poolSize = 0;
    if (/[a-z]/.test(value)) poolSize += 26;
    if (/[A-Z]/.test(value)) poolSize += 26;
    if (/[0-9]/.test(value)) poolSize += 10;
    if (/[^a-zA-Z0-9]/.test(value)) poolSize += 33;
    const entropyBits =
      value.length > 0 && poolSize > 1
        ? value.length * Math.log2(poolSize)
        : 0;

    const checks = [
      {
        label: "Al menos 12 caracteres",
        passed: value.length >= 12,
      },
      {
        label: "Contiene mayúsculas y minúsculas",
        passed: /[a-z]/.test(value) && /[A-Z]/.test(value),
      },
      {
        label: "Contiene números",
        passed: /[0-9]/.test(value),
      },
      {
        label: "Contiene símbolos",
        passed: /[^a-zA-Z0-9\s]/.test(value),
      },
      {
        label: "Sin secuencias obvias (abc, 123, qwerty, password)",
        passed: value.length > 0 && !hasObviousSequence(value),
      },
      {
        label: "Sin caracteres repetidos en exceso",
        passed: value.length > 0 && !hasExcessRepeats(value),
      },
    ];

    return { entropyBits, checks };
  }, [passwordToCheck]);

  const toggleItems = [
    { key: "uppercase" as const, label: "Mayúsculas", hint: "A-Z" },
    { key: "lowercase" as const, label: "Minúsculas", hint: "a-z" },
    { key: "numbers" as const, label: "Números", hint: "0-9" },
    { key: "symbols" as const, label: "Símbolos", hint: "!@#$%…" },
  ];

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden />
            Contraseñas
          </CardTitle>
          <CardDescription>
            Genera contraseñas seguras y comprueba la fortaleza de las tuyas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="generator">
            <TabsList className="grid w-full grid-cols-2 sm:w-72">
              <TabsTrigger value="generator">Generador</TabsTrigger>
              <TabsTrigger value="validator">Validador</TabsTrigger>
            </TabsList>

            <TabsContent value="generator" className="space-y-6 pt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pw-length">Longitud</Label>
                  <span className="text-sm font-medium tabular-nums">
                    {options.length} caracteres
                  </span>
                </div>
                <Slider
                  id="pw-length"
                  min={8}
                  max={64}
                  step={1}
                  value={[options.length]}
                  onValueChange={(values) => updateOption("length", values[0] ?? 16)}
                  aria-label="Longitud de la contraseña"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {toggleItems.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <Label
                      htmlFor={`pw-${item.key}`}
                      className="flex flex-col gap-0.5"
                    >
                      <span>{item.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.hint}
                      </span>
                    </Label>
                    <Switch
                      id={`pw-${item.key}`}
                      checked={options[item.key]}
                      onCheckedChange={(checked) => updateOption(item.key, checked)}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 sm:col-span-2">
                  <Label htmlFor="pw-ambiguous" className="flex flex-col gap-0.5">
                    <span>Excluir caracteres ambiguos</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      l, 1, I, O, 0, o
                    </span>
                  </Label>
                  <Switch
                    id="pw-ambiguous"
                    checked={options.excludeAmbiguous}
                    onCheckedChange={(checked) =>
                      updateOption("excludeAmbiguous", checked)
                    }
                  />
                </div>
              </div>

              {!canGenerate && (
                <p className="text-sm text-destructive">
                  Selecciona al menos un tipo de carácter para poder generar una
                  contraseña.
                </p>
              )}

              <Button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="gap-2"
              >
                <RefreshCw className="size-4" aria-hidden />
                Generar contraseña
              </Button>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={password}
                    placeholder="Pulsa el botón para generar una contraseña"
                    aria-label="Contraseña generada"
                    className="font-mono text-sm"
                  />
                  <CopyButton value={password} label="Copiar" size="sm" />
                </div>

                <StrengthMeter entropyBits={generatorEntropy} />
              </div>
            </TabsContent>

            <TabsContent value="validator" className="space-y-6 pt-4">
              <div className="space-y-2">
                <Label htmlFor="pw-check">Contraseña a validar</Label>
                <div className="relative">
                  <Input
                    id="pw-check"
                    type={showPassword ? "text" : "password"}
                    value={passwordToCheck}
                    onChange={(e) => setPasswordToCheck(e.target.value)}
                    placeholder="Escribe la contraseña que quieres comprobar"
                    autoComplete="off"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </div>

              {passwordToCheck ? (
                <>
                  <StrengthMeter entropyBits={validatorAnalysis.entropyBits} />

                  <ul className="space-y-2" aria-label="Requisitos de la contraseña">
                    {validatorAnalysis.checks.map((check) => (
                      <li
                        key={check.label}
                        className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm"
                      >
                        {check.passed ? (
                          <Check
                            className="size-4 shrink-0 text-emerald-600"
                            aria-label="Cumple"
                          />
                        ) : (
                          <X
                            className="size-4 shrink-0 text-rose-500"
                            aria-label="No cumple"
                          />
                        )}
                        <span className={cn(!check.passed && "text-muted-foreground")}>
                          {check.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Escribe una contraseña para analizar su entropía y comprobar si
                  cumple las recomendaciones de seguridad.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Todo el cálculo se realiza localmente en tu navegador: la contraseña
          nunca se envía a ningún servidor.
        </p>
      </div>
    </ToolShell>
  );
}
