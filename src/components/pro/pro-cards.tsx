"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { PRO_TOOL_LIST, PRO_TOOLS, type ProToolType } from "@/lib/pro-tools";
import { cn } from "@/lib/utils";

/**
 * Cards grandes de la landing /pro: Editor de Imagen, Video y Audio.
 * Sin cuentas: los proyectos se guardan en el dispositivo del usuario.
 */
export function ProCards() {
  const router = useRouter();

  function openEditor(type: ProToolType) {
    router.push(PRO_TOOLS[type].hrefBase);
  }

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {PRO_TOOL_LIST.map((tool) => {
        const Icon = tool.icon;
        return (
          <Card
            key={tool.type}
            className="flex flex-col border-2 transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
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
              <Button className={cn("w-full gap-2", tool.buttonClass)} onClick={() => openEditor(tool.type)}>
                Abrir editor
                <ArrowRight className="size-4" aria-hidden />
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Gratis y sin registro · Guardado en tu dispositivo
              </p>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
