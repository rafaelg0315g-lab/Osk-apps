"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiJson } from "@/lib/pro-client";
import { useAppStore } from "@/lib/store";

type Mode = "login" | "register";

/**
 * Diálogo global de inicio de sesión / registro para la sección PROFESIONAL.
 * Se abre desde el header, las cards de /pro o cuando una página requiere cuenta.
 */
export function AuthDialog() {
  const open = useAppStore((s) => s.authOpen);
  const setOpen = useAppStore((s) => s.setAuthOpen);
  const { update } = useSession();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetError() {
    setError(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    resetError();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    if (mode === "register") {
      const res = await apiJson<{ ok: boolean }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        setError(res.error ?? "No pudimos crear tu cuenta.");
        setSubmitting(false);
        return;
      }
    }

    const signInRes = await signIn("credentials", { email, password, redirect: false });
    if (!signInRes || signInRes.error) {
      setError(
        mode === "register"
          ? "Tu cuenta quedó creada, pero no pudimos iniciar sesión automáticamente. Prueba en la pestaña 'Iniciar sesión'."
          : "Correo o contraseña incorrectos.",
      );
      setSubmitting(false);
      return;
    }

    await update();
    toast.success(mode === "login" ? "Sesión iniciada. ¡Bienvenido!" : "Cuenta creada. ¡Bienvenido a PROFESIONAL!");
    setOpen(false);
    setSubmitting(false);
    setPassword("");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetError();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "login" ? (
              <LogIn className="size-4.5 text-amber-600 dark:text-amber-400" aria-hidden />
            ) : (
              <UserPlus className="size-4.5 text-amber-600 dark:text-amber-400" aria-hidden />
            )}
            {mode === "login" ? "Inicia sesión" : "Crea tu cuenta gratis"}
          </DialogTitle>
          <DialogDescription>
            Los proyectos de la suite PROFESIONAL se guardan en tu cuenta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Modo de acceso">
          <Button
            type="button"
            variant={mode === "login" ? "default" : "ghost"}
            size="sm"
            onClick={() => switchMode("login")}
          >
            Iniciar sesión
          </Button>
          <Button
            type="button"
            variant={mode === "register" ? "default" : "ghost"}
            size="sm"
            onClick={() => switchMode("register")}
          >
            Crear cuenta
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">Nombre (opcional)</Label>
              <Input
                id="auth-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Correo electrónico</Label>
            <Input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Contraseña</Label>
            <Input
              id="auth-password"
              type="password"
              required
              minLength={mode === "register" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "Mínimo 8 caracteres" : "••••••••"}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {mode === "login" ? "Iniciar sesión" : "Crear cuenta e iniciar sesión"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Gratis. Tus proyectos quedan guardados en tu cuenta y puedes retomarlos cuando quieras.
        </p>
      </DialogContent>
    </Dialog>
  );
}
