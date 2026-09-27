"use client";

import { Check, Hammer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { PRO_TOOL_LIST } from "@/lib/pro-tools";
import { cn } from "@/lib/utils";

/**
 * Cards grandes de la landing /pro: Editor de Imagen, Video y Audio.
 * Estado actual: EN DESARROLLO — la suite se publicará más adelante;
 * por ahora las cards muestran lo que incluirá cada editor.
 */
export function ProCards() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {PRO_TOOL_LIST.map((tool) => {
        const Icon = tool.icon;
        return (
          <Card key={tool.type} className="flex flex-col border-2">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-center justify-between">
                <span
                  className={cn("flex size-11 items-center justify-center rounded-xl", tool.chipClass)}
                >
                  <Icon className="size-5.5" aria-hidden />
                </span>
                <Badge className="rounded-full border-transparent bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400">
                  PRO
                </Badge>
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">{tool.name}</h2>
                <p className="text-sm text-muted-foreground">{tool.tagline}</p>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Incluirá
              </p>
              <ul className="space-y-1.5">
                {tool.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-1.5 text-sm text-muted-foreground"
                  >
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-2 pt-0">
              <Button className={cn("w-full gap-2", tool.buttonClass)} disabled>
                <Hammer className="size-4" aria-hidden />
                En desarrollo
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Disponible muy pronto · Gratis y sin registro
              </p>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
