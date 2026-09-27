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
  "compress-pdf": dynamic(() => import("@/components/tools/compress-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "pdf-to-word": dynamic(() => import("@/components/tools/pdf-to-word"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "pdf-to-excel": dynamic(() => import("@/components/tools/pdf-to-excel"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "pdf-to-ppt": dynamic(() => import("@/components/tools/pdf-to-ppt"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "pdf-to-jpg": dynamic(() => import("@/components/tools/pdf-to-jpg"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "jpg-to-pdf": dynamic(() => import("@/components/tools/jpg-to-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "rotate-pdf": dynamic(() => import("@/components/tools/rotate-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "delete-pdf-pages": dynamic(() => import("@/components/tools/delete-pdf-pages"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "protect-pdf": dynamic(() => import("@/components/tools/protect-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "unlock-pdf": dynamic(() => import("@/components/tools/unlock-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "sign-pdf": dynamic(() => import("@/components/tools/sign-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "number-pdf-pages": dynamic(() => import("@/components/tools/number-pdf-pages"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "watermark-pdf": dynamic(() => import("@/components/tools/watermark-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "ocr-pdf": dynamic(() => import("@/components/tools/ocr-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "resize-image": dynamic(() => import("@/components/tools/resize-image"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "crop-image": dynamic(() => import("@/components/tools/crop-image"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "remove-bg": dynamic(() => import("@/components/tools/remove-bg"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "watermark-image": dynamic(() => import("@/components/tools/watermark-image"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "collage": dynamic(() => import("@/components/tools/collage"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "upscale-image": dynamic(() => import("@/components/tools/upscale-image"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "image-editor": dynamic(() => import("@/components/tools/image-editor"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "convert-video": dynamic(() => import("@/components/tools/convert-video"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "compress-video": dynamic(() => import("@/components/tools/compress-video"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "extract-audio": dynamic(() => import("@/components/tools/extract-audio"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "trim-video": dynamic(() => import("@/components/tools/trim-video"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "convert-audio": dynamic(() => import("@/components/tools/convert-audio"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "merge-videos": dynamic(() => import("@/components/tools/merge-videos"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "video-to-gif": dynamic(() => import("@/components/tools/video-to-gif"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "spell-checker": dynamic(() => import("@/components/tools/spell-checker"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "contract-generator": dynamic(() => import("@/components/tools/contract-generator"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "markdown-to-pdf": dynamic(() => import("@/components/tools/markdown-to-pdf"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "cv-builder": dynamic(() => import("@/components/tools/cv-builder"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "text-diff": dynamic(() => import("@/components/tools/text-diff"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "vat-calculator": dynamic(() => import("@/components/tools/vat-calculator"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "currency-converter": dynamic(() => import("@/components/tools/currency-converter"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "ai-summarizer": dynamic(() => import("@/components/tools/ai-summarizer"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "ai-translator": dynamic(() => import("@/components/tools/ai-translator"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "faq-chatbot": dynamic(() => import("@/components/tools/faq-chatbot"), {
    ssr: false,
    loading: ToolLoading,
  }),
  "product-description-gen": dynamic(() => import("@/components/tools/product-description-gen"), {
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
