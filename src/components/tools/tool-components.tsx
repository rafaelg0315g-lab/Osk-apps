"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComponentType } from "react";

function ToolLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

/**
 * Mapa de herramientas → componentes, con carga perezosa (code-splitting).
 * Cada herramienta vive en su propio chunk y solo se descarga al abrirla.
 */
export const TOOL_COMPONENTS: Record<string, ComponentType> = {
  "merge-pdf": dynamic(() => import("@/components/tools/merge-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "split-pdf": dynamic(() => import("@/components/tools/split-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "compress-image": dynamic(() => import("@/components/tools/compress-image"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "convert-image": dynamic(() => import("@/components/tools/convert-image"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "word-counter": dynamic(() => import("@/components/tools/word-counter"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "qr-generator": dynamic(() => import("@/components/tools/qr-generator"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "password-generator": dynamic(() => import("@/components/tools/password-generator"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "json-formatter": dynamic(() => import("@/components/tools/json-formatter"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "base64-converter": dynamic(() => import("@/components/tools/base64-converter"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "hash-generator": dynamic(() => import("@/components/tools/hash-generator"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "unit-converter": dynamic(() => import("@/components/tools/unit-converter"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "date-calculator": dynamic(() => import("@/components/tools/date-calculator"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "invoice-generator": dynamic(() => import("@/components/tools/invoice-generator"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "link-shortener": dynamic(() => import("@/components/tools/link-shortener"), {
    ssr: false,
    loading: ToolLoading,
  }),
};

export function ToolComponent({ id }: { id: string }) {
  const Component = TOOL_COMPONENTS[id];
  if (!Component) {
    return (
      <div className="mx-auto max-w-4xl rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Esta herramienta estará disponible próximamente.
      </div>
    );
  }
  return <Component />;
}
