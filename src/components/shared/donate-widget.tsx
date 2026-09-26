"use client";

import { useEffect } from "react";
import { Heart, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Widget flotante de donaciones (PayPal).
 * - Botón flotante (FAB) en la esquina inferior derecha.
 * - Panel flotante no modal con el formulario oficial de PayPal.
 * Se puede abrir desde el FAB, el header o el footer (estado global en zustand).
 */
export function DonateWidget() {
  const open = useAppStore((s) => s.donateOpen);
  const setOpen = useAppStore((s) => s.setDonateOpen);

  // Cierra con la tecla Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <>
      {/* Overlay invisible para cerrar al hacer clic fuera (no bloquea el scroll) */}
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel flotante */}
      {open && (
        <section
          role="dialog"
          aria-label="Ventana de donación con PayPal"
          className={cn(
            "fixed bottom-[4.75rem] right-4 z-50 w-[calc(100vw-2rem)] max-w-sm",
            "origin-bottom-right rounded-2xl border bg-popover text-popover-foreground shadow-xl",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200",
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Heart className="size-4.5 fill-current" aria-hidden />
              </span>
              <div>
                <h2 className="text-sm font-semibold leading-tight">Apoya OSK APPS</h2>
                <p className="text-xs text-muted-foreground">Tu aporte mantiene todo gratis</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Cerrar ventana de donación"
              onClick={() => setOpen(false)}
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </header>

          <div className="space-y-4 px-4 py-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              OSK APPS es y seguirá siendo <span className="font-medium text-foreground">100% gratis</span>.
              Con tu donación ayudas a cubrir los servidores y a construir nuevas herramientas.
              ¡Cada aporte suma!
            </p>

            {/* Formulario oficial de donación de PayPal */}
            <div className="flex justify-center rounded-xl border bg-background px-4 py-5">
              <form action="https://www.paypal.com/donate" method="post" target="_blank">
                <input type="hidden" name="hosted_button_id" value="NKKNKSZS9PHTE" />
                <input
                  type="image"
                  src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif"
                  name="submit"
                  title="PayPal - The safer, easier way to pay online!"
                  alt="Donar con el botón de PayPal"
                  className="cursor-pointer transition-transform hover:scale-[1.03] active:scale-95"
                />
                {/* Pixel de tracking de PayPal */}
                <img
                  alt=""
                  src="https://www.paypal.com/en_CO/i/scr/pixel.gif"
                  width={1}
                  height={1}
                  className="hidden"
                />
              </form>
            </div>

            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden />
              Pago 100% seguro procesado por PayPal
            </p>
          </div>
        </section>
      )}

      {/* Botón flotante */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={open ? "Cerrar donación" : "Donar a OSK APPS"}
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-5 right-4 z-50 flex h-12 items-center gap-2 rounded-full px-4",
          "text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          open ? "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600" : "bg-rose-500 hover:bg-rose-600",
        )}
      >
        {open ? (
          <X className="size-4.5" aria-hidden />
        ) : (
          <Heart className="size-4.5 fill-current" aria-hidden />
        )}
        <span>{open ? "Cerrar" : "Donar"}</span>
      </button>
    </>
  );
}
