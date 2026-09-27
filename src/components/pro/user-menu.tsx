"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { AudioLines, Film, ImagePlus, LogOut, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRO_TOOLS, type ProToolType } from "@/lib/pro-tools";
import { useAppStore } from "@/lib/store";

const PRO_ICONS: Record<ProToolType, typeof ImagePlus> = {
  image: ImagePlus,
  video: Film,
  audio: AudioLines,
};

/** Menú de usuario del header: acceso a Mis proyectos y cierre de sesión. */
export function UserMenu() {
  const { data: session, status } = useSession();
  const setAuthOpen = useAppStore((s) => s.setAuthOpen);

  if (status === "loading") {
    return <div className="size-8 animate-pulse rounded-full bg-muted" aria-hidden />;
  }

  if (status === "unauthenticated" || !session?.user) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAuthOpen(true)} className="gap-1.5">
        <UserRound className="size-4" aria-hidden />
        <span className="hidden sm:inline">Iniciar sesión</span>
      </Button>
    );
  }

  const user = session.user;
  const initials = (user.name || user.email || "?").slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Menú de usuario"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-amber-500/15 text-xs font-bold text-amber-700 dark:text-amber-400">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="truncate text-sm font-semibold">{user.name || "Mi cuenta"}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(["image", "video", "audio"] as const).map((t) => {
          const tool = PRO_TOOLS[t];
          const Icon = PRO_ICONS[t];
          return (
            <DropdownMenuItem key={t} asChild>
              <Link href={tool.hrefBase} className="gap-2">
                <Icon className="size-4" aria-hidden />
                Mis proyectos · {tool.name.replace("Editor de ", "")}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => signOut({ callbackUrl: "/" })}
          className="gap-2 text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
        >
          <LogOut className="size-4" aria-hidden />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
