"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Bot,
  CalendarClock,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/shared/copy-button";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────────────────────

interface LinkItem {
  id: string;
  slug: string;
  url: string;
  title: string | null;
  createdAt: string;
  totalClicks: number;
  lastClickAt: string | null;
}

interface CreatedLink {
  slug: string;
  path: string;
  shortUrl: string;
  url: string;
  title: string | null;
  createdAt: string;
}

interface StatClick {
  id: string;
  createdAt: string;
  referrer: string | null;
  device: string | null;
  browser: string | null;
}

interface LinkStats {
  link: {
    id: string;
    slug: string;
    url: string;
    title: string | null;
    createdAt: string;
  };
  totalClicks: number;
  clicksByDay: { date: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  devices: { device: string; count: number }[];
  browsers: { browser: string; count: number }[];
  recentClicks: StatClick[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Fecha relativa en español ("hace 5 minutos", "hace 2 días"...). */
function formatRelativeTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return "hace instantes";
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (diffMinutes < 60) return rtf.format(-diffMinutes, "minute");
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return rtf.format(-diffHours, "hour");
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return rtf.format(-diffDays, "day");
  return formatDate(date);
}

/** "2025-05-12" → "12 may" (etiqueta abreviada para el eje del gráfico). */
function formatDayShort(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}

/** Extrae el hostname de un referrer; fallback al valor crudo recortado. */
function hostnameOf(referrer: string): string {
  try {
    return new URL(referrer).hostname || referrer;
  } catch {
    return referrer.slice(0, 60);
  }
}

function pluralClicks(count: number): string {
  return count === 1 ? "clic" : "clics";
}

const DEVICE_META: Record<string, { label: string; icon: LucideIcon }> = {
  mobile: { label: "Móvil", icon: Smartphone },
  tablet: { label: "Tableta", icon: Tablet },
  desktop: { label: "Escritorio", icon: Monitor },
  bot: { label: "Bot", icon: Bot },
};

const LIST_SCROLL_CLASSNAMES =
  "max-h-96 space-y-3 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border";

// ─── Gráfico de barras (solo divs) ────────────────────────────────────────

function ClicksChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = useMemo(
    () => data.reduce((max, day) => Math.max(max, day.count), 0),
    [data]
  );
  const totalInRange = useMemo(
    () => data.reduce((sum, day) => sum + day.count, 0),
    [data]
  );

  return (
    <div>
      <div className="flex h-32 items-end gap-1 sm:gap-1.5" role="img" aria-label="Gráfico de clics por día, últimos 14 días">
        {data.map((day) => {
          const height = maxCount > 0 ? Math.max((day.count / maxCount) * 100, day.count > 0 ? 8 : 3) : 3;
          const label = formatDayShort(day.date);
          return (
            <div
              key={day.date}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${day.count} ${pluralClicks(day.count)} — ${label}`}
            >
              <div
                className={cn(
                  "w-full rounded-t-[3px] transition-colors",
                  day.count > 0 ? "bg-primary hover:bg-primary/80" : "bg-muted"
                )}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-1.5">
        {data.map((day, index) => (
          <span
            key={day.date}
            aria-hidden
            className="flex-1 text-center text-[10px] leading-tight text-muted-foreground"
          >
            {index % 3 === 0 || index === data.length - 1 ? day.date.split("-")[2]?.replace(/^0/, "") : ""}
          </span>
        ))}
      </div>
      {totalInRange === 0 && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Sin clics en los últimos 14 días
        </p>
      )}
    </div>
  );
}

// ─── Sección de estadísticas dentro del Sheet ─────────────────────────────

function StatsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function StatsBody({ stats }: { stats: LinkStats }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Clics totales</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{stats.totalClicks}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Creado el {formatDate(stats.link.createdAt)}
        </p>
      </div>

      <StatsSection title="Clics por día (últimos 14 días)">
        <ClicksChart data={stats.clicksByDay} />
      </StatsSection>

      <StatsSection title="Dispositivos">
        {stats.devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos todavía</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {stats.devices.map((item) => {
              const meta = DEVICE_META[item.device];
              const Icon = meta?.icon ?? Monitor;
              return (
                <div key={item.device} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate text-sm">{meta?.label ?? item.device}</span>
                  <span className="ml-auto font-semibold tabular-nums">{item.count}</span>
                </div>
              );
            })}
          </div>
        )}
      </StatsSection>

      <StatsSection title="Referentes principales">
        {stats.topReferrers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos todavía</p>
        ) : (
          <ul className="space-y-1.5">
            {stats.topReferrers.map((item) => (
              <li key={item.referrer} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{item.referrer}</span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                  {item.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </StatsSection>

      <StatsSection title="Navegadores">
        {stats.browsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos todavía</p>
        ) : (
          <ul className="space-y-1.5">
            {stats.browsers.map((item) => (
              <li key={item.browser} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{item.browser}</span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                  {item.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </StatsSection>

      <StatsSection title="Últimos clics">
        {stats.recentClicks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin clics todavía</p>
        ) : (
          <ul className="space-y-2">
            {stats.recentClicks.map((click) => {
              const device = click.device ?? "unknown";
              const meta = DEVICE_META[device];
              const DeviceIcon = meta?.icon ?? Monitor;
              return (
                <li key={click.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm">{formatRelativeTime(click.createdAt)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {click.referrer ? hostnameOf(click.referrer) : "Directo"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline" className="max-w-28 gap-1 font-normal">
                      <DeviceIcon className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{meta?.label ?? device}</span>
                    </Badge>
                    <span className="text-xs text-muted-foreground">{click.browser ?? "Otro"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </StatsSection>
    </div>
  );
}

// ─── Herramienta principal ────────────────────────────────────────────────

export default function LinkShortenerTool() {
  // Formulario
  const [url, setUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreatedLink | null>(null);

  // Lista
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Eliminación
  const [deleteTarget, setDeleteTarget] = useState<LinkItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Estadísticas (Sheet)
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsSlug, setStatsSlug] = useState<string | null>(null);
  const [stats, setStats] = useState<LinkStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsReload, setStatsReload] = useState(0);

  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/links", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar los links");
      setLinks(data.links ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error de red al cargar los links");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Carga las estadísticas cuando se abre el Sheet (o al reintentar).
  useEffect(() => {
    if (!statsOpen || !statsSlug) return;
    let cancelled = false;

    const load = async () => {
      setStatsLoading(true);
      setStatsError(null);
      setStats(null);
      try {
        const res = await fetch(`/api/links/${encodeURIComponent(statsSlug)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las estadísticas");
        if (!cancelled) setStats(data as LinkStats);
      } catch (error) {
        if (!cancelled) {
          setStatsError(error instanceof Error ? error.message : "Error de red al cargar las estadísticas");
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [statsOpen, statsSlug, statsReload]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error("Ingresa una URL para acortar");
      return;
    }
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      toast.error("Ingresa una URL válida (debe comenzar con http:// o https://)");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmedUrl,
          customSlug: customSlug.trim() || undefined,
          title: title.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el link corto");

      setResult(data as CreatedLink);
      toast.success("Link corto creado");
      setUrl("");
      setCustomSlug("");
      setTitle("");
      void refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error de red al crear el link");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(deleteTarget.slug)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar el link");
      toast.success("Link eliminado");
      if (result?.slug === deleteTarget.slug) setResult(null);
      setDeleteTarget(null);
      void refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error de red al eliminar el link");
    } finally {
      setDeleting(false);
    }
  };

  const openStats = (slug: string) => {
    setStats(null);
    setStatsError(null);
    setStatsSlug(slug);
    setStatsOpen(true);
  };

  return (
    <ToolShell>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Acortador de links</h2>
        <p className="text-sm text-muted-foreground">
          Acorta URLs con slug personalizado y consulta clics, dispositivos y referentes.
        </p>
      </header>

      {/* Crear link corto */}
      <Card>
        <CardHeader>
          <CardTitle>Crear link corto</CardTitle>
          <CardDescription>Pega una URL larga y obtén un link corto con estadísticas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCreate} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="shortener-url">URL original</Label>
              <Input
                id="shortener-url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://ejemplo.com/mi-link-largo..."
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="shortener-slug">Slug personalizado (opcional)</Label>
                <div className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted-foreground"
                  >
                    /api/s/
                  </span>
                  <Input
                    id="shortener-slug"
                    autoComplete="off"
                    className="pl-[64px]"
                    maxLength={30}
                    placeholder="mi-campania"
                    value={customSlug}
                    onChange={(event) =>
                      setCustomSlug(
                        event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shortener-title">Título (opcional)</Label>
                <Input
                  id="shortener-title"
                  autoComplete="off"
                  maxLength={100}
                  placeholder="Mi campaña de lanzamiento"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={creating || !url.trim()} className="w-full sm:w-auto">
              {creating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="size-4" aria-hidden />
              )}
              {creating ? "Acortando..." : "Acortar"}
            </Button>
          </form>

          {result && (
            <div
              role="status"
              className="rounded-xl border border-emerald-500/40 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-transparent bg-emerald-600 text-white">
                  Link creado
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock className="size-3" aria-hidden />
                  {formatDate(result.createdAt)}
                </span>
              </div>
              <p className="mt-3 break-all font-mono text-base font-medium">{result.shortUrl}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{result.url}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CopyButton value={result.shortUrl} label="Copiar" size="sm" />
                <Button asChild variant="outline" size="sm">
                  <a href={result.path} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" aria-hidden />
                    Abrir
                  </a>
                </Button>
                <Button variant="outline" size="sm" onClick={() => openStats(result.slug)}>
                  <BarChart3 className="size-3.5" aria-hidden />
                  Ver estadísticas
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de links */}
      <Card>
        <CardHeader>
          <CardTitle>Tus links</CardTitle>
          <CardDescription>
            {links.length} {links.length === 1 ? "link acortado" : "links acortados"}
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loadingList}
            >
              <RefreshCw className={cn("size-3.5", loadingList && "animate-spin")} aria-hidden />
              Actualizar
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <div className="space-y-3" aria-label="Cargando links">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-lg border p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2.5 h-3.5 w-1/2" />
                  <Skeleton className="mt-2.5 h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
              <Link2 className="size-8 text-muted-foreground" aria-hidden />
              <div className="space-y-1">
                <p className="text-sm font-medium">Aún no has acortado ningún link</p>
                <p className="text-xs text-muted-foreground">
                  Crea tu primer link corto con el formulario de arriba.
                </p>
              </div>
            </div>
          ) : (
            <div className={LIST_SCROLL_CLASSNAMES}>
              {links.map((link) => {
                const linkShortUrl = origin ? `${origin}/api/s/${link.slug}` : `/api/s/${link.slug}`;
                return (
                  <div
                    key={link.id}
                    className="rounded-lg border p-4 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium" title={link.title ?? link.url}>
                          {link.title || link.url}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <span className="break-all font-mono text-xs text-foreground">
                            /api/s/{link.slug}
                          </span>
                          <CopyButton value={linkShortUrl} size="icon" className="size-6" />
                        </p>
                        <p className="truncate text-xs text-muted-foreground" title={link.url}>
                          {link.url}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Creado el {formatDate(link.createdAt)}
                          {link.lastClickAt
                            ? ` · Último clic ${formatRelativeTime(link.lastClickAt)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                        <Badge variant="secondary" className="gap-1">
                          <Eye className="size-3" aria-hidden />
                          {link.totalClicks} {pluralClicks(link.totalClicks)}
                        </Badge>
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => openStats(link.slug)}>
                            <BarChart3 className="size-3.5" aria-hidden />
                            Estadísticas
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                            aria-label={`Eliminar el link ${link.slug}`}
                            onClick={() => setDeleteTarget(link)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmación de eliminación */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este link?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                Se eliminará el link{" "}
                <span className="break-all font-mono">/api/s/{deleteTarget?.slug}</span> y todas sus
                estadísticas de clics. Esta acción no se puede deshacer.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500/40"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sheet de estadísticas */}
      {statsSlug && (
        <Sheet
          open={statsOpen}
          onOpenChange={(open) => {
            setStatsOpen(open);
          }}
        >
          <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
            <SheetHeader className="border-b p-4 pb-4 text-left">
              <SheetTitle>Estadísticas del link</SheetTitle>
              <SheetDescription className="break-all font-mono text-xs">
                /api/s/{statsSlug}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4">
              {statsLoading ? (
                <div className="space-y-4" aria-label="Cargando estadísticas">
                  <Skeleton className="h-24 w-full rounded-xl" />
                  <Skeleton className="h-32 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-40 w-full rounded-xl" />
                </div>
              ) : statsError ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center">
                  <AlertCircle className="size-6 text-rose-500" aria-hidden />
                  <p className="text-sm text-muted-foreground">{statsError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStatsReload((value) => value + 1)}
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Reintentar
                  </Button>
                </div>
              ) : stats ? (
                <StatsBody stats={stats} />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </ToolShell>
  );
}
