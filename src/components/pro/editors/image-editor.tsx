"use client";

import * as fabric from "fabric";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Brush,
  Circle as CircleIcon,
  Copy,
  Download,
  Eye,
  EyeOff,
  Group as GroupIcon,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Loader2,
  Lock,
  LockOpen,
  Maximize,
  Minus,
  MousePointer2,
  PenTool,
  Redo2,
  RotateCcw,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Square as SquareIcon,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
  Scan,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

// Fabric v7: los filtros viven en el namespace fabric.filters
const {
  Brightness,
  Contrast,
  Saturation,
  Blur,
  Grayscale,
  Sepia,
  Invert,
  Pixelate,
} = fabric.filters;

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProEditorProps } from "@/components/pro/editor-workspace";
import { downloadBlob } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

import { AiImageDialog, AssistantTab } from "./image-editor-ia";
import {
  buildEnvelope,
  clamp,
  dataUrlToBlob,
  DEFAULT_FILTERS,
  DEFAULT_SCENE,
  DEFAULT_SELECTION_PROPS,
  dataUrlToBlob as _dataUrlToBlobAlias,
  isHexColor,
  isTransparentBg,
  MAX_SCENE,
  parseInitialData,
  pickAiSize,
  toHexColor,
  type ChatMsg,
  type FiltersState,
  type ImageAiOp,
  type LayerIconId,
  type LayerRow,
  type LooseFilter,
  type SceneSize,
  type SelectionKind,
  type SelectionProps,
  type ToolId,
} from "./image-editor-types";

// ─── Metadatos de herramientas ───────────────────────────────────────────────

const TOOLS: { id: ToolId; label: string; icon: LucideIcon }[] = [
  { id: "select", label: "Seleccionar y mover", icon: MousePointer2 },
  { id: "brush", label: "Pincel libre", icon: Brush },
  { id: "text", label: "Texto (doble clic para editar)", icon: Type },
  { id: "rect", label: "Rectángulo", icon: SquareIcon },
  { id: "circle", label: "Círculo", icon: CircleIcon },
  { id: "line", label: "Línea", icon: Minus },
];

const LAYER_ICONS: Record<LayerIconId, LucideIcon> = {
  image: ImageIcon,
  text: Type,
  rect: SquareIcon,
  circle: CircleIcon,
  line: Minus,
  path: PenTool,
  group: GroupIcon,
  object: Shapes,
};

type PanelTab = "layers" | "adjust" | "ai";
type ExportFormat = "png" | "jpeg" | "webp";

const HISTORY_LIMIT = 30;

/** Tablero de ajedrez CSS para visualizar la transparencia del lienzo. */
const CHECKER_STYLE: CSSProperties = {
  backgroundImage:
    "conic-gradient(#d4d4d8 0 25%, #fafafa 0 50%, #d4d4d8 0 75%, #fafafa 0)",
  backgroundSize: "16px 16px",
};

// ─── Helpers puros ───────────────────────────────────────────────────────────

function baseInfo(obj: fabric.FabricObject): { base: LayerIconId; label: string } {
  if (obj instanceof fabric.FabricImage) return { base: "image", label: "Imagen" };
  if (obj instanceof fabric.IText) return { base: "text", label: "Texto" };
  if (obj instanceof fabric.Rect) return { base: "rect", label: "Rectángulo" };
  if (obj instanceof fabric.Circle) return { base: "circle", label: "Círculo" };
  if (obj instanceof fabric.Line) return { base: "line", label: "Línea" };
  if (obj instanceof fabric.Path) return { base: "path", label: "Trazo" };
  if (obj instanceof fabric.Group) return { base: "group", label: "Grupo" };
  return { base: "object", label: "Objeto" };
}

function readFiltersState(img: fabric.FabricImage): FiltersState {
  const st: FiltersState = { ...DEFAULT_FILTERS };
  const list = (img.filters ?? []) as unknown as LooseFilter[];
  for (const f of list) {
    if (!f) continue;
    switch (f.type) {
      case "Brightness":
        st.brightness = clamp(Math.round((f.brightness ?? 0) * 100), -100, 100);
        break;
      case "Contrast":
        st.contrast = clamp(Math.round((f.contrast ?? 0) * 100), -100, 100);
        break;
      case "Saturation":
        st.saturation = clamp(Math.round((f.saturation ?? 0) * 100), -100, 100);
        break;
      case "Blur":
        st.blur = clamp(Math.round((f.blur ?? 0) * 20), 0, 20);
        break;
      case "Grayscale":
        st.grayscale = true;
        break;
      case "Sepia":
        st.sepia = true;
        break;
      case "Invert":
        st.invert = true;
        break;
      case "Pixelate":
        st.pixelate = clamp(Math.round(f.blocksize ?? 0), 2, 50);
        break;
    }
  }
  return st;
}

function readSelectionProps(obj: fabric.FabricObject): SelectionProps {
  const props: SelectionProps = {
    fill: toHexColor(obj.fill, DEFAULT_SELECTION_PROPS.fill),
    stroke: toHexColor(obj.stroke, DEFAULT_SELECTION_PROPS.stroke),
    strokeWidth: clamp(Math.round(obj.strokeWidth ?? 0), 0, 40),
    opacity: clamp(Math.round((obj.opacity ?? 1) * 100), 0, 100),
    fontFamily: DEFAULT_SELECTION_PROPS.fontFamily,
    fontSize: DEFAULT_SELECTION_PROPS.fontSize,
    bold: false,
    italic: false,
    align: "left",
  };
  if (obj instanceof fabric.IText) {
    if (typeof obj.fontFamily === "string" && obj.fontFamily) props.fontFamily = obj.fontFamily;
    props.fontSize = clamp(Math.round(obj.fontSize ?? props.fontSize), 8, 200);
    props.bold = obj.fontWeight === "bold";
    props.italic = obj.fontStyle === "italic";
    if (obj.textAlign === "left" || obj.textAlign === "center" || obj.textAlign === "right") {
      props.align = obj.textAlign;
    }
  }
  return props;
}

/** Miniatura JPEG (fondo blanco si el lienzo es transparente) para el autoguardado. */
function makeThumbnail(canvas: fabric.Canvas, scene: SceneSize): string {
  const multiplier = Math.min(1, 320 / Math.max(scene.width, scene.height));
  const prev = canvas.backgroundColor;
  if (isTransparentBg(prev)) canvas.backgroundColor = "#ffffff";
  try {
    return canvas.toDataURL({ format: "jpeg", quality: 0.6, multiplier, enableRetinaScaling: false });
  } finally {
    canvas.backgroundColor = prev;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

// ─── Subcomponentes de UI ────────────────────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-7 cursor-pointer rounded border bg-transparent p-0.5"
          aria-label={label}
        />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-label={label}
      />
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function RowIconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "size-6 shrink-0 text-muted-foreground hover:text-foreground",
        danger && "hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400",
      )}
    >
      {children}
    </Button>
  );
}

// ─── Editor principal ────────────────────────────────────────────────────────

export default function ImageEditor({ initialData, onChange }: ProEditorProps) {
  // Refs de Fabric / DOM
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const sceneRef = useRef<SceneSize>({ ...DEFAULT_SCENE });
  const toolRef = useRef<ToolId>("select");
  const fitModeRef = useRef(true);
  const drawingRef = useRef<{ obj: fabric.FabricObject; x0: number; y0: number } | null>(null);
  const namesRef = useRef(new WeakMap<fabric.FabricObject, string>());
  const countersRef = useRef<Record<string, number>>({});
  const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [], index: -1 });
  const restoringRef = useRef(false);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uidRef = useRef(0);
  const chatIdRef = useRef(0);
  const chatRunningRef = useRef(false);
  const bgRef = useRef("");
  const onChangeRef = useRef(onChange);
  const initialDataRef = useRef(initialData);

  // Estado de UI
  const [ready, setReady] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [tool, setTool] = useState<ToolId>("select");
  const [zoom, setZoomState] = useState(1);
  const [displaySize, setDisplaySize] = useState<SceneSize>({ ...DEFAULT_SCENE });
  const [scene, setScene] = useState<SceneSize>({ ...DEFAULT_SCENE });
  const [layers, setLayers] = useState<LayerRow[]>([]);
  const [selectionKind, setSelectionKind] = useState<SelectionKind>("none");
  const [selectionProps, setSelectionProps] = useState<SelectionProps>({ ...DEFAULT_SELECTION_PROPS });
  const [filters, setFilters] = useState<FiltersState>({ ...DEFAULT_FILTERS });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("layers");
  const [bg, setBg] = useState("");
  const [brushColor, setBrushColor] = useState("#111827");
  const [brushSize, setBrushSize] = useState(6);
  const [importing, setImporting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatRunning, setChatRunning] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [exportQuality, setExportQuality] = useState(90);
  const [exportScale, setExportScale] = useState(1);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    fitModeRef.current = true;
  }, []);

  // ── Nombres de capas (runtime, con contadores por tipo) ──

  const ensureName = useCallback((obj: fabric.FabricObject) => {
    if (namesRef.current.has(obj)) return;
    const { base, label } = baseInfo(obj);
    countersRef.current[base] = (countersRef.current[base] ?? 0) + 1;
    namesRef.current.set(obj, `${label} ${countersRef.current[base]}`);
  }, []);

  const reassignAllNames = useCallback(
    (canvas: fabric.Canvas) => {
      countersRef.current = {};
      namesRef.current = new WeakMap();
      for (const o of canvas.getObjects()) ensureName(o);
    },
    [ensureName],
  );

  // ── Historial (undo/redo) ──

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || restoringRef.current) return;
    try {
      const snapshot = JSON.stringify(canvas.toJSON());
      const h = historyRef.current;
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snapshot);
      if (h.stack.length > HISTORY_LIMIT) h.stack.shift();
      h.index = h.stack.length - 1;
      setCanUndo(h.index > 0);
      setCanRedo(h.index < h.stack.length - 1);
    } catch {
      // Estado no serializable: se omite este snapshot.
    }
  }, []);

  const applyHistory = useCallback(
    (dir: -1 | 1) => {
      const canvas = canvasRef.current;
      const h = historyRef.current;
      if (!canvas || restoringRef.current) return;
      const next = h.index + dir;
      if (next < 0 || next >= h.stack.length) return;
      h.index = next;
      setCanUndo(h.index > 0);
      setCanRedo(h.index < h.stack.length - 1);
      restoringRef.current = true;
      canvas.discardActiveObject();
      void canvas
        .loadFromJSON(JSON.parse(h.stack[next]))
        .then(() => {
          restoringRef.current = false;
          reassignAllNames(canvas);
          canvas.requestRenderAll();
          syncSelection();
          scheduleAutosave();
        })
        .catch(() => {
          restoringRef.current = false;
          toast.error("No se pudo restaurar el historial.");
        });
    },
    // syncSelection y scheduleAutosave se declaran más abajo pero son estables ([] deps).

    [reassignAllNames],
  );

  const undo = useCallback(() => applyHistory(-1), [applyHistory]);
  const redo = useCallback(() => applyHistory(1), [applyHistory]);

  // ── Autoguardado ──

  const commitSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || restoringRef.current) return;
    try {
      const data = buildEnvelope(sceneRef.current, canvas.toJSON());
      onChangeRef.current({ data, thumbnail: makeThumbnail(canvas, sceneRef.current) });
    } catch {
      // Si el estado no se puede serializar, se reintenta en el próximo cambio.
    }
  }, []);

  const scheduleAutosave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      commitSave();
    }, 800);
  }, [commitSave]);

  const markDirty = useCallback(() => {
    if (restoringRef.current) return;
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      historyTimerRef.current = null;
      pushHistory();
    }, 300);
    scheduleAutosave();
  }, [pushHistory, scheduleAutosave]);

  // ── Zoom y ajuste a la ventana ──

  const setCanvasView = useCallback((z: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zz = clamp(z, 0.05, 4);
    const { width, height } = sceneRef.current;
    const dispW = Math.round(width * zz);
    const dispH = Math.round(height * zz);
    canvas.setDimensions({ width: dispW, height: dispH });
    canvas.setZoom(zz);
    setZoomState(zz);
    setDisplaySize({ width: dispW, height: dispH });
  }, []);

  const applyFit = useCallback(() => {
    const holder = scrollRef.current;
    if (!holder) return;
    const availW = Math.max(80, holder.clientWidth - 32);
    const availH = Math.max(80, holder.clientHeight - 32);
    const { width, height } = sceneRef.current;
    const z = clamp(Math.min(availW / width, availH / height, 1), 0.05, 4);
    fitModeRef.current = true;
    setCanvasView(z);
  }, [setCanvasView]);

  const applyZoom = useCallback(
    (z: number) => {
      fitModeRef.current = false;
      setCanvasView(z);
    },
    [setCanvasView],
  );

  // ── Capas: refresco y acciones ──

  const refreshLayers = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    const multi = active instanceof fabric.ActiveSelection ? active.getObjects() : null;
    uidRef.current += 1;
    const rows: LayerRow[] = canvas
      .getObjects()
      .slice()
      .reverse()
      .map((o) => {
        ensureName(o);
        const { base } = baseInfo(o);
        return {
          key: uidRef.current,
          obj: o,
          name: namesRef.current.get(o) ?? baseInfo(o).label,
          icon: base,
          visible: o.visible !== false,
          locked: o.selectable === false,
          selected: active === o || (multi?.includes(o) ?? false),
        };
      });
    setLayers(rows);
  }, [ensureName]);

  const syncSelection = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    refreshLayers();
    const active = canvas.getActiveObject();
    if (!active) {
      setSelectionKind("none");
      return;
    }
    if (active instanceof fabric.ActiveSelection) {
      setSelectionKind("multi");
      return;
    }
    setSelectionProps(readSelectionProps(active));
    if (active instanceof fabric.FabricImage) {
      setFilters(readFiltersState(active));
      setSelectionKind("image");
    } else if (active instanceof fabric.IText) {
      setSelectionKind("text");
    } else {
      setSelectionKind("shape");
    }
  }, [refreshLayers]);

  const selectLayer = (obj: fabric.FabricObject) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    syncSelection();
  };

  const moveLayer = useCallback(
    (obj: fabric.FabricObject, dir: 1 | -1) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const moved =
        dir === 1 ? canvas.bringObjectForward(obj) : canvas.sendObjectBackwards(obj);
      if (!moved) return;
      canvas.requestRenderAll();
      refreshLayers();
      markDirty();
    },
    [markDirty, refreshLayers],
  );

  const duplicateLayer = useCallback((obj: fabric.FabricObject) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void obj
      .clone()
      .then((clone) => {
        clone.set({ left: (clone.left ?? 0) + 16, top: (clone.top ?? 0) + 16 });
        clone.setCoords();
        canvas.add(clone);
        canvas.setActiveObject(clone);
        canvas.requestRenderAll();
        toast.success("Capa duplicada.");
      })
      .catch(() => toast.error("No se pudo duplicar la capa."));
  }, []);

  const removeObjects = useCallback(
    (targets: fabric.FabricObject[]) => {
      const canvas = canvasRef.current;
      if (!canvas || targets.length === 0) return;
      canvas.discardActiveObject();
      canvas.remove(...targets);
      canvas.requestRenderAll();
      syncSelection();
      toast.success(targets.length > 1 ? `${targets.length} objetos eliminados.` : "Objeto eliminado.");
    },
    [syncSelection],
  );

  const deleteSelected = useCallback(() => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) {
      toast.error("No hay ningún objeto seleccionado.");
      return;
    }
    removeObjects(active instanceof fabric.ActiveSelection ? active.getObjects() : [active]);
  }, [removeObjects]);

  const toggleVisible = useCallback(
    (obj: fabric.FabricObject) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const willShow = obj.visible === false;
      obj.set({ visible: willShow });
      if (!willShow && canvas.getActiveObject() === obj) canvas.discardActiveObject();
      canvas.requestRenderAll();
      syncSelection();
      markDirty();
    },
    [markDirty, syncSelection],
  );

  const toggleLock = useCallback(
    (obj: fabric.FabricObject) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const wasLocked = obj.selectable === false;
      obj.set({ selectable: wasLocked, evented: wasLocked });
      if (!wasLocked && canvas.getActiveObject() === obj) canvas.discardActiveObject();
      canvas.requestRenderAll();
      syncSelection();
      markDirty();
    },
    [markDirty, syncSelection],
  );

  // ── Propiedades de la selección ──

  const applyProps = useCallback(
    (patch: Partial<SelectionProps>) => {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;
      setSelectionProps((prev) => ({ ...prev, ...patch }));
      const targets = active instanceof fabric.ActiveSelection ? active.getObjects() : [active];
      for (const o of targets) {
        if (patch.fill !== undefined) o.set({ fill: patch.fill });
        if (patch.stroke !== undefined) o.set({ stroke: patch.stroke });
        if (patch.strokeWidth !== undefined) o.set({ strokeWidth: patch.strokeWidth });
        if (patch.opacity !== undefined) o.set({ opacity: clamp(patch.opacity, 0, 100) / 100 });
        if (patch.fontFamily !== undefined) o.set({ fontFamily: patch.fontFamily });
        if (patch.fontSize !== undefined) o.set({ fontSize: clamp(patch.fontSize, 8, 200) });
        if (patch.bold !== undefined) o.set({ fontWeight: patch.bold ? "bold" : "normal" });
        if (patch.italic !== undefined) o.set({ fontStyle: patch.italic ? "italic" : "normal" });
        if (patch.align !== undefined) o.set({ textAlign: patch.align });
        o.setCoords();
      }
      canvas.requestRenderAll();
      markDirty();
    },
    [markDirty],
  );

  // ── Filtros ──

  const applyFiltersToImage = useCallback(
    (img: fabric.FabricImage, st: FiltersState) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const list: fabric.FabricImage["filters"] = [];
      if (st.brightness !== 0) list.push(new Brightness({ brightness: st.brightness / 100 }));
      if (st.contrast !== 0) list.push(new Contrast({ contrast: st.contrast / 100 }));
      if (st.saturation !== 0) list.push(new Saturation({ saturation: st.saturation / 100 }));
      if (st.blur > 0) list.push(new Blur({ blur: st.blur / 20 }));
      if (st.grayscale) list.push(new Grayscale());
      if (st.sepia) list.push(new Sepia());
      if (st.invert) list.push(new Invert());
      if (st.pixelate >= 2) list.push(new Pixelate({ blocksize: Math.round(st.pixelate) }));
      img.filters = list;
      img.applyFilters();
      canvas.requestRenderAll();
      if (canvas.getActiveObject() === img) setFilters(st);
      markDirty();
    },
    [markDirty],
  );

  function updateFilters(patch: Partial<FiltersState>) {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !(active instanceof fabric.FabricImage)) {
      toast.error("Selecciona una imagen para aplicar ajustes.");
      return;
    }
    applyFiltersToImage(active, { ...filters, ...patch });
  }

  function resetFilters() {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !(active instanceof fabric.FabricImage)) {
      toast.error("Selecciona una imagen para restablecer sus filtros.");
      return;
    }
    applyFiltersToImage(active, { ...DEFAULT_FILTERS });
    toast.success("Filtros restablecidos.");
  }

  // ── Dibujo de formas / texto con el ratón ──

  const handleMouseDown = useCallback((opt: fabric.TPointerEventInfo) => {
    const canvas = canvasRef.current;
    const t = toolRef.current;
    if (!canvas || t === "select" || t === "brush") return;
    const p = opt.scenePoint;
    if (t === "text") {
      const itext = new fabric.IText("Texto", {
        left: p.x,
        top: p.y,
        originX: "left",
        originY: "top",
        fontFamily: "Arial",
        fontSize: 48,
        fill: DEFAULT_SELECTION_PROPS.fill,
      });
      canvas.add(itext);
      canvas.setActiveObject(itext);
      setTool("select");
      itext.enterEditing();
      itext.selectAll();
      canvas.requestRenderAll();
      return;
    }
    let obj: fabric.FabricObject;
    if (t === "rect") {
      obj = new fabric.Rect({ width: 1, height: 1, fill: DEFAULT_SELECTION_PROPS.fill });
    } else if (t === "circle") {
      obj = new fabric.Circle({ radius: 1, fill: DEFAULT_SELECTION_PROPS.fill });
    } else {
      obj = new fabric.Line([p.x, p.y, p.x, p.y], {
        stroke: DEFAULT_SELECTION_PROPS.stroke,
        strokeWidth: 3,
        strokeLineCap: "round",
      });
    }
    if (obj instanceof fabric.Rect || obj instanceof fabric.Circle) {
      obj.setPositionByOrigin(new fabric.Point(p.x, p.y), "left", "top");
    }
    obj.setCoords();
    canvas.add(obj);
    drawingRef.current = { obj, x0: p.x, y0: p.y };
    canvas.requestRenderAll();
  }, []);

  const handleMouseMove = useCallback((opt: fabric.TPointerEventInfo) => {
    const drawing = drawingRef.current;
    const canvas = canvasRef.current;
    if (!drawing || !canvas) return;
    const p = opt.scenePoint;
    const { obj, x0, y0 } = drawing;
    const dx = p.x - x0;
    const dy = p.y - y0;
    if (obj instanceof fabric.Rect) {
      obj.set({ width: Math.max(1, Math.abs(dx)), height: Math.max(1, Math.abs(dy)) });
      obj.setPositionByOrigin(new fabric.Point((x0 + p.x) / 2, (y0 + p.y) / 2), "center", "center");
    } else if (obj instanceof fabric.Circle) {
      obj.set({ radius: Math.max(1, Math.max(Math.abs(dx), Math.abs(dy)) / 2) });
      obj.setPositionByOrigin(new fabric.Point((x0 + p.x) / 2, (y0 + p.y) / 2), "center", "center");
    } else if (obj instanceof fabric.Line) {
      obj.set({ x2: p.x, y2: p.y });
    }
    obj.setCoords();
    canvas.requestRenderAll();
  }, []);

  const handleMouseUp = useCallback(() => {
    const drawing = drawingRef.current;
    const canvas = canvasRef.current;
    if (!drawing || !canvas) return;
    drawingRef.current = null;
    const { obj } = drawing;
    let tooSmall = false;
    if (obj instanceof fabric.Rect) tooSmall = obj.width < 3 && obj.height < 3;
    else if (obj instanceof fabric.Circle) tooSmall = obj.radius < 2;
    else if (obj instanceof fabric.Line) tooSmall = obj.width < 2 && obj.height < 2;
    if (tooSmall) {
      canvas.remove(obj);
      canvas.requestRenderAll();
      return;
    }
    obj.setCoords();
    canvas.setActiveObject(obj);
    setTool("select");
    canvas.requestRenderAll();
    markDirty();
  }, [markDirty]);

  // ── Importar imágenes ──

  const onImportFiles = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const canvas = canvasRef.current;
    const files = e.target.files;
    e.target.value = "";
    if (!canvas || !files || files.length === 0) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      toast.error("Selecciona archivos de imagen.");
      return;
    }
    setImporting(true);
    let added = 0;
    for (const file of images) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`«${file.name}» supera el límite de 20 MB.`);
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const img = await fabric.FabricImage.fromURL(dataUrl);
        const { width: sw, height: sh } = sceneRef.current;
        const iw = img.width || 1;
        const ih = img.height || 1;
        const scale = Math.min(1, sw / iw, sh / ih);
        img.set({
          originX: "left",
          originY: "top",
          scaleX: scale,
          scaleY: scale,
          left: Math.round((sw - iw * scale) / 2),
          top: Math.round((sh - ih * scale) / 2),
        });
        img.setCoords();
        canvas.add(img);
        added += 1;
      } catch {
        toast.error(`No se pudo cargar «${file.name}».`);
      }
    }
    setImporting(false);
    if (added > 0) {
      canvas.requestRenderAll();
      toast.success(added === 1 ? "Imagen importada." : `${added} imágenes importadas.`);
    }
  }, []);

  /** Define el tamaño del lienzo a partir de una imagen (máx. 2000 px). */
  const fitImageToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    const img =
      active instanceof fabric.FabricImage
        ? active
        : canvas.getObjects().find((o): o is fabric.FabricImage => o instanceof fabric.FabricImage);
    if (!img) {
      toast.error("Importa primero una imagen para ajustar el lienzo.");
      return;
    }
    const iw = img.width || 0;
    const ih = img.height || 0;
    if (!iw || !ih) {
      toast.error("La imagen todavía se está cargando.");
      return;
    }
    const s = Math.min(1, MAX_SCENE / Math.max(iw, ih));
    const w = Math.round(iw * s);
    const h = Math.round(ih * s);
    img.set({ originX: "left", originY: "top", left: 0, top: 0, scaleX: s, scaleY: s });
    img.setCoords();
    canvas.sendObjectToBack(img);
    canvas.discardActiveObject();
    sceneRef.current = { width: w, height: h };
    setScene(sceneRef.current);
    applyFit();
    markDirty();
    toast.success(`Lienzo ajustado a ${w} × ${h} px.`);
  }, [applyFit, markDirty]);

  // ── Fondo ──

  const applyBackground = useCallback(
    (value: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const v = value === "transparent" ? "" : value;
      canvas.backgroundColor = v;
      bgRef.current = v;
      canvas.requestRenderAll();
      setBg(v);
      markDirty();
    },
    [markDirty],
  );

  const bgSelectValue = bg === "" ? "transparent" : bg === "#ffffff" || bg === "#09090b" ? bg : "custom";

  // ── Exportar ──

  function doExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.getObjects().length === 0) {
      toast.error("El lienzo está vacío: importa una imagen o dibuja algo primero.");
      return;
    }
    const prev = canvas.backgroundColor;
    if (exportFormat === "jpeg" && isTransparentBg(prev)) canvas.backgroundColor = "#ffffff";
    try {
      const url = canvas.toDataURL({
        format: exportFormat,
        quality: exportFormat === "png" ? 1 : exportQuality / 100,
        multiplier: exportScale,
        enableRetinaScaling: false,
      });
      const blob = dataUrlToBlob(url);
      const ext = exportFormat === "jpeg" ? "jpg" : exportFormat;
      downloadBlob(blob, `osk-imagen.${ext}`);
      toast.success(
        `Imagen exportada en ${ext.toUpperCase()} (${scene.width * exportScale} × ${scene.height * exportScale} px).`,
      );
    } catch {
      toast.error("No se pudo exportar la imagen. Prueba con una escala menor.");
    } finally {
      canvas.backgroundColor = prev;
      canvas.requestRenderAll();
    }
  }

  // ── IA 1: edición generativa de imagen ──

  const runAiImage = useCallback(async (prompt: string, onlySelection: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas || aiRunning) return;
    setAiError(null);
    setAiRunning(true);
    try {
      const zoom = canvas.getZoom();
      const vp = canvas.viewportTransform;
      const canvasW = canvas.getWidth();
      const canvasH = canvas.getHeight();
      const active = onlySelection ? canvas.getActiveObject() : null;
      let left = 0;
      let top = 0;
      let cropW = canvasW;
      let cropH = canvasH;
      if (active && !(active instanceof fabric.ActiveSelection)) {
        const br = active.getBoundingRect();
        const padX = Math.max(8, br.width * 0.05);
        const padY = Math.max(8, br.height * 0.05);
        left = clamp((br.left - padX) * zoom + vp[4], 0, canvasW);
        top = clamp((br.top - padY) * zoom + vp[5], 0, canvasH);
        cropW = clamp(Math.round((br.width + padX * 2) * zoom), 16, Math.round(canvasW - left));
        cropH = clamp(Math.round((br.height + padY * 2) * zoom), 16, Math.round(canvasH - top));
      }
      const multiplier = Math.min(1, 1400 / Math.max(cropW, cropH));
      const image = canvas.toDataURL({
        format: "png",
        multiplier,
        left,
        top,
        width: cropW,
        height: cropH,
        enableRetinaScaling: false,
      });
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, prompt, size: pickAiSize(cropW, cropH) }),
      });
      const data = (await res.json().catch(() => null)) as { image?: unknown; error?: string } | null;
      if (!res.ok) throw new Error(data?.error || `Error ${res.status} al generar con IA.`);
      const resultUrl = typeof data?.image === "string" ? data.image : "";
      if (!resultUrl.startsWith("data:image/")) {
        throw new Error("La IA no devolvió una imagen válida. Prueba con otra instrucción.");
      }
      const result = await fabric.FabricImage.fromURL(resultUrl);
      const regionW = cropW / zoom;
      const regionH = cropH / zoom;
      const scale = Math.min(regionW / (result.width || 1), regionH / (result.height || 1));
      result.set({ scaleX: scale, scaleY: scale });
      const sceneLeft = (left - vp[4]) / zoom;
      const sceneTop = (top - vp[5]) / zoom;
      result.set({
        originX: "center",
        originY: "center",
        left: sceneLeft + regionW / 2,
        top: sceneTop + regionH / 2,
      });
      result.setCoords();
      canvas.add(result);
      canvas.setActiveObject(result);
      canvas.requestRenderAll();
      setAiOpen(false);
      toast.success("Resultado agregado como capa nueva. Puedes borrar la capa original si quieres.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo generar la edición con IA.";
      setAiError(msg);
      toast.error(msg);
    } finally {
      setAiRunning(false);
    }
  }, [aiRunning]);

  // ── IA 2: chat de operaciones ──

  const executeOp = useCallback(
    (op: ImageAiOp): boolean => {
      const canvas = canvasRef.current;
      if (!canvas) return false;
      const { width: W, height: H } = sceneRef.current;
      const n = (v: unknown, def: number): number =>
        typeof v === "number" && Number.isFinite(v) ? v : def;
      const imageTarget = (): fabric.FabricImage | null => {
        const active = canvas.getActiveObject();
        if (active instanceof fabric.FabricImage) return active;
        return (
          canvas.getObjects().find((o): o is fabric.FabricImage => o instanceof fabric.FabricImage) ??
          null
        );
      };

      switch (op?.op) {
        case "setBrightness": {
          const img = imageTarget();
          if (!img) return false;
          const st = readFiltersState(img);
          st.brightness = clamp(Math.round(n(op.value, 0)), -100, 100);
          applyFiltersToImage(img, st);
          return true;
        }
        case "setContrast": {
          const img = imageTarget();
          if (!img) return false;
          const st = readFiltersState(img);
          st.contrast = clamp(Math.round(n(op.value, 0)), -100, 100);
          applyFiltersToImage(img, st);
          return true;
        }
        case "setSaturation": {
          const img = imageTarget();
          if (!img) return false;
          const st = readFiltersState(img);
          st.saturation = clamp(Math.round(n(op.value, 0)), -100, 100);
          applyFiltersToImage(img, st);
          return true;
        }
        case "setBlur": {
          const img = imageTarget();
          if (!img) return false;
          const st = readFiltersState(img);
          st.blur = clamp(Math.round(n(op.value, 0)), 0, 20);
          applyFiltersToImage(img, st);
          return true;
        }
        case "setGrayscale": {
          const img = imageTarget();
          if (!img) return false;
          const st = readFiltersState(img);
          st.grayscale = !st.grayscale;
          applyFiltersToImage(img, st);
          return true;
        }
        case "setSepia": {
          const img = imageTarget();
          if (!img) return false;
          const st = readFiltersState(img);
          st.sepia = !st.sepia;
          applyFiltersToImage(img, st);
          return true;
        }
        case "setInvert": {
          const img = imageTarget();
          if (!img) return false;
          const st = readFiltersState(img);
          st.invert = !st.invert;
          applyFiltersToImage(img, st);
          return true;
        }
        case "setPixelate": {
          const img = imageTarget();
          if (!img) return false;
          const st = readFiltersState(img);
          st.pixelate = clamp(Math.round(n(op.value, 8)), 2, 50);
          applyFiltersToImage(img, st);
          return true;
        }
        case "clearFilters": {
          const img = imageTarget();
          if (!img) return false;
          applyFiltersToImage(img, { ...DEFAULT_FILTERS });
          return true;
        }
        case "addText": {
          const text =
            typeof op.text === "string" && op.text.trim() ? op.text.trim().slice(0, 160) : "Texto";
          const fontSize = clamp(Math.round(n(op.fontSize, 48)), 8, 120);
          const color = isHexColor(op.color) ? op.color : DEFAULT_SELECTION_PROPS.fill;
          const x = clamp(n(op.x, 0.5), 0, 1) * W;
          const y = clamp(n(op.y, 0.5), 0, 1) * H;
          const itext = new fabric.IText(text, {
            left: x,
            top: y,
            originX: "left",
            originY: "top",
            fontFamily: "Arial",
            fontSize,
            fill: color,
          });
          itext.setCoords();
          canvas.add(itext);
          canvas.setActiveObject(itext);
          canvas.requestRenderAll();
          return true;
        }
        case "addRectangle": {
          const color = isHexColor(op.color) ? op.color : DEFAULT_SELECTION_PROPS.fill;
          const opacity = clamp(n(op.opacity, 0.6), 0.05, 1);
          const rx = clamp(n(op.x, 0.25), 0, 1) * W;
          const ry = clamp(n(op.y, 0.25), 0, 1) * H;
          const rw = Math.max(4, clamp(n(op.w, 0.4), 0.01, 1) * W);
          const rh = Math.max(4, clamp(n(op.h, 0.3), 0.01, 1) * H);
          const rect = new fabric.Rect({ width: rw, height: rh, fill: color, opacity });
          rect.setPositionByOrigin(new fabric.Point(rx + rw / 2, ry + rh / 2), "center", "center");
          rect.setCoords();
          canvas.add(rect);
          canvas.setActiveObject(rect);
          canvas.requestRenderAll();
          return true;
        }
        case "resetCanvas": {
          canvas.clear();
          canvas.backgroundColor = bgRef.current;
          namesRef.current = new WeakMap();
          countersRef.current = {};
          canvas.requestRenderAll();
          refreshLayers();
          return true;
        }
        default:
          return false;
      }
    },
    [applyFiltersToImage, refreshLayers],
  );

  const sendChat = useCallback(
    async (instruction: string) => {
      const canvas = canvasRef.current;
      if (!canvas || chatRunningRef.current) return;
      if (!instruction.trim()) return;
      chatRunningRef.current = true;
      setChatRunning(true);
      chatIdRef.current += 1;
      const userId = `u${chatIdRef.current}`;
      setChat((prev) => [...prev, { id: userId, role: "user" as const, text: instruction }]);
      try {
        const active = canvas.getActiveObject();
        const context = JSON.stringify({
          width: sceneRef.current.width,
          height: sceneRef.current.height,
          objects: canvas.getObjects().length,
          selected: active ? baseInfo(active).label.toLowerCase() : null,
          filtersActuales: active instanceof fabric.FabricImage ? readFiltersState(active) : null,
        });
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene: "image-editor", instruction, context }),
        });
        const data = (await res.json().catch(() => null)) as
          | { reply?: unknown; operations?: unknown; unsupported?: unknown; error?: string }
          | null;
        if (!res.ok) throw new Error(data?.error || `Error ${res.status} al consultar al asistente.`);
        const reply =
          typeof data?.reply === "string" && data.reply.trim() ? data.reply.trim() : "Listo.";
        const ops = Array.isArray(data?.operations) ? (data?.operations as ImageAiOp[]) : [];
        const unsupported = Array.isArray(data?.unsupported)
          ? data.unsupported.filter((u): u is string => typeof u === "string")
          : [];

        chatIdRef.current += 1;
        setChat((prev) => [...prev, { id: `a${chatIdRef.current}`, role: "assistant" as const, text: reply }]);

        let executed = 0;
        const unknownOps: string[] = [];
        for (const op of ops) {
          if (op && typeof op.op === "string" && executeOp(op)) {
            executed += 1;
          } else if (op && typeof op.op === "string") {
            unknownOps.push(`«${op.op}»`);
          }
        }
        if (executed > 0) {
          markDirty();
          syncSelection();
          toast.success(executed === 1 ? "Se aplicó 1 operación." : `Se aplicaron ${executed} operaciones.`);
        }
        const pending = [
          ...unsupported,
          ...unknownOps.map((o) => `Operación ${o} no disponible`),
        ];
        if (pending.length > 0) {
          chatIdRef.current += 1;
          setChat((prev) => [
            ...prev,
            { id: `s${chatIdRef.current}`, role: "system" as const, text: `No puedo: ${pending.join(" · ")}` },
          ]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "No se pudo contactar al asistente.";
        chatIdRef.current += 1;
        setChat((prev) => [...prev, { id: `e${chatIdRef.current}`, role: "system" as const, text: msg }]);
      } finally {
        chatRunningRef.current = false;
        setChatRunning(false);
      }
    },
    [executeOp, markDirty, syncSelection],
  );

  // ── Montaje del lienzo Fabric ──

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement("canvas");
    container.appendChild(el);
    const canvas = new fabric.Canvas(el, {
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
    });
    canvasRef.current = canvas;

    const parsed = parseInitialData(initialDataRef.current);
    const initialScene = parsed?.scene ?? DEFAULT_SCENE;
    sceneRef.current = initialScene;
    canvas.setDimensions({ width: initialScene.width, height: initialScene.height });

    let cancelled = false;
    const initTimer = setTimeout(() => {
      void (async () => {
        if (parsed) {
          try {
            await canvas.loadFromJSON(parsed.fabric as Record<string, unknown>);
          } catch {
            toast.error("El proyecto estaba dañado y se abrió con un lienzo vacío.");
          }
        }
        if (cancelled) return;
        const bgValue = typeof canvas.backgroundColor === "string" ? canvas.backgroundColor : "";
        bgRef.current = bgValue;
        setBg(bgValue);
        reassignAllNames(canvas);
        applyFit();
        canvas.requestRenderAll();
        pushHistory();
        commitSave();
        setInitialLoading(false);
        setReady(true);
      })();
    }, 0);

    const onObjectsChanged = () => {
      refreshLayers();
      markDirty();
    };
    const onSelectionChanged = () => syncSelection();
    const onTextChanged = () => markDirty();
    const onMouseDown = (opt: fabric.TPointerEventInfo) => handleMouseDown(opt);
    const onMouseMove = (opt: fabric.TPointerEventInfo) => handleMouseMove(opt);
    const onMouseUp = () => handleMouseUp();

    canvas.on("object:added", onObjectsChanged);
    canvas.on("object:removed", onObjectsChanged);
    canvas.on("object:modified", onObjectsChanged);
    canvas.on("selection:created", onSelectionChanged);
    canvas.on("selection:updated", onSelectionChanged);
    canvas.on("selection:cleared", onSelectionChanged);
    canvas.on("text:changed", onTextChanged);
    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      if (historyTimerRef.current) {
        clearTimeout(historyTimerRef.current);
        historyTimerRef.current = null;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        commitSave(); // flush del autoguardado pendiente antes de desmontar
      }
      canvas.off();
      void canvas.dispose();
      if (containerRef.current) containerRef.current.innerHTML = "";
      canvasRef.current = null;
    };
  }, [
    applyFit,
    commitSave,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    markDirty,
    pushHistory,
    refreshLayers,
    reassignAllNames,
    syncSelection,
  ]);

  // ── Modo de herramienta (pincel / formas) ──

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    if (tool === "brush") {
      canvas.isDrawingMode = true;
      const brush = new fabric.PencilBrush(canvas);
      brush.color = brushColor;
      brush.width = brushSize;
      canvas.freeDrawingBrush = brush;
      canvas.skipTargetFind = true;
      canvas.selection = false;
    } else if (tool === "select") {
      canvas.isDrawingMode = false;
      canvas.skipTargetFind = false;
      canvas.selection = true;
    } else {
      canvas.isDrawingMode = false;
      canvas.skipTargetFind = true;
      canvas.selection = false;
    }
  }, [tool, ready, brushColor, brushSize]);

  // ── Ajuste automático al redimensionar ──

  useEffect(() => {
    const holder = scrollRef.current;
    if (!holder) return;
    const observer = new ResizeObserver(() => {
      if (fitModeRef.current) applyFit();
    });
    observer.observe(holder);
    return () => observer.disconnect();
  }, [applyFit]);

  // ── Atajos de teclado ──

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (active instanceof fabric.IText && active.isEditing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && active) {
        e.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, redo, undo]);

  // ── Derivados de UI ──

  const selectedName = layers.find((l) => l.selected)?.name ?? "";
  const selectedCount = layers.filter((l) => l.selected).length;
  const hasSingleSelection =
    selectionKind === "image" || selectionKind === "text" || selectionKind === "shape";

  // ── Render ──

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-16rem)] lg:min-h-[560px] lg:flex-row lg:gap-4">
      {/* Barra de herramientas */}
      <div
        role="toolbar"
        aria-label="Herramientas del editor"
        className="flex shrink-0 items-center gap-1 overflow-x-auto rounded-xl border bg-card p-1.5 lg:w-14 lg:flex-col lg:items-stretch lg:overflow-visible"
      >
        {TOOLS.map((t) => (
          <Button
            key={t.id}
            variant="ghost"
            size="icon"
            title={t.label}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
            className={cn(
              "size-9 shrink-0",
              tool === t.id && "bg-amber-600 text-white hover:bg-amber-700 hover:text-white",
            )}
          >
            <t.icon className="size-4.5" aria-hidden />
          </Button>
        ))}
        <div className="mx-1 h-6 w-px shrink-0 bg-border lg:mx-0 lg:my-1 lg:h-px lg:w-auto" />
        <Button
          variant="ghost"
          size="icon"
          title="Eliminar objeto seleccionado (Supr)"
          aria-label="Eliminar objeto seleccionado"
          onClick={deleteSelected}
          disabled={!hasSingleSelection && selectionKind !== "multi"}
          className="size-9 shrink-0 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="size-4.5" aria-hidden />
        </Button>
      </div>

      {/* Zona central: barra de acciones + lienzo */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border bg-card p-1.5">
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={initialLoading || importing}
            className="h-8 shrink-0 gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
          >
            {importing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-4" aria-hidden />
            )}
            <span className="hidden sm:inline">Importar imagen</span>
            <span className="sm:hidden">Importar</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void onImportFiles(e)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={fitImageToCanvas}
            disabled={initialLoading}
            title="Define el tamaño del lienzo a partir de una imagen (máx. 2000 px)"
            className="h-8 shrink-0 gap-1.5"
          >
            <Maximize className="size-4" aria-hidden />
            <span className="hidden xl:inline">Ajustar imagen al lienzo</span>
            <span className="xl:hidden">Ajustar</span>
          </Button>

          <div className="h-6 w-px shrink-0 bg-border" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => applyZoom(zoom / 1.25)}
            disabled={initialLoading}
            title="Alejar"
            aria-label="Alejar"
            className="size-8 shrink-0"
          >
            <ZoomOut className="size-4" aria-hidden />
          </Button>
          <span
            className="w-11 shrink-0 text-center text-xs tabular-nums text-muted-foreground"
            title="Nivel de zoom"
          >
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => applyZoom(zoom * 1.25)}
            disabled={initialLoading}
            title="Acercar"
            aria-label="Acercar"
            className="size-8 shrink-0"
          >
            <ZoomIn className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={applyFit}
            disabled={initialLoading}
            title="Ajustar la vista al espacio disponible"
            aria-label="Ajustar vista"
            className="size-8 shrink-0"
          >
            <Scan className="size-4" aria-hidden />
          </Button>

          <div className="h-6 w-px shrink-0 bg-border" />

          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={!canUndo || initialLoading}
            title="Deshacer (Ctrl+Z)"
            aria-label="Deshacer"
            className="size-8 shrink-0"
          >
            <Undo2 className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={!canRedo || initialLoading}
            title="Rehacer (Ctrl+Shift+Z)"
            aria-label="Rehacer"
            className="size-8 shrink-0"
          >
            <Redo2 className="size-4" aria-hidden />
          </Button>

          <div className="h-6 w-px shrink-0 bg-border" />

          <Select value={bgSelectValue} onValueChange={applyBackground}>
            <SelectTrigger
              className="h-8 w-[124px] shrink-0 text-xs"
              aria-label="Fondo del lienzo"
              title="Fondo del lienzo"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="transparent">Transparente</SelectItem>
              <SelectItem value="#ffffff">Blanco</SelectItem>
              <SelectItem value="#09090b">Negro</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          <input
            type="color"
            value={toHexColor(bg === "" ? "#ffffff" : bg, "#ffffff")}
            onChange={(e) => applyBackground(e.target.value)}
            className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
            title="Color de fondo personalizado"
            aria-label="Color de fondo personalizado"
          />

          <div className="ms-auto flex items-center gap-1.5 ps-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAiError(null);
                setAiOpen(true);
              }}
              disabled={initialLoading}
              className="h-8 shrink-0 gap-1.5"
              title="Edición generativa con IA (inpainting)"
            >
              <Sparkles className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
              <span className="hidden xl:inline">IA de imagen</span>
              <span className="xl:hidden">IA</span>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={initialLoading}
                  className="h-8 shrink-0 gap-1.5"
                >
                  <Download className="size-4" aria-hidden />
                  <span className="hidden xl:inline">Exportar</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Exportar imagen</p>
                  <p className="text-xs text-muted-foreground">
                    Tamaño final: {scene.width * exportScale} × {scene.height * exportScale} px
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Formato</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["png", "jpeg", "webp"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={exportFormat === f}
                        onClick={() => setExportFormat(f)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-xs font-medium uppercase transition-colors",
                          exportFormat === f
                            ? "border-amber-600 bg-amber-600 text-white"
                            : "bg-background hover:bg-muted",
                        )}
                      >
                        {f === "jpeg" ? "JPG" : f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {exportFormat === "png"
                      ? "PNG conserva la transparencia del lienzo."
                      : "Los fondos transparentes se aplanan a blanco."}
                  </p>
                </div>
                {exportFormat !== "png" ? (
                  <SliderRow
                    label="Calidad"
                    value={exportQuality}
                    min={10}
                    max={100}
                    onChange={setExportQuality}
                    format={(v) => `${v}%`}
                  />
                ) : null}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Escala</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[1, 2].map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={exportScale === s}
                        onClick={() => setExportScale(s)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                          exportScale === s
                            ? "border-amber-600 bg-amber-600 text-white"
                            : "bg-background hover:bg-muted",
                        )}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  onClick={doExport}
                  className="w-full gap-2 bg-amber-600 text-white hover:bg-amber-700"
                >
                  <Download className="size-4" aria-hidden />
                  Descargar
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {tool === "brush" ? (
          <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Pincel</span>
            <input
              type="color"
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className="size-7 cursor-pointer rounded border bg-transparent p-0.5"
              aria-label="Color del pincel"
              title="Color del pincel"
            />
            <span className="font-mono text-xs text-muted-foreground">{brushColor}</span>
            <Slider
              value={[brushSize]}
              min={1}
              max={40}
              step={1}
              onValueChange={(v) => setBrushSize(v[0] ?? brushSize)}
              className="w-32 sm:w-44"
              aria-label="Grosor del pincel"
            />
            <span className="w-9 text-xs tabular-nums text-muted-foreground">{brushSize} px</span>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className="relative h-[420px] overflow-auto rounded-xl border bg-muted/30 lg:h-auto lg:min-h-0 lg:flex-1"
        >
          <div className="flex min-h-full w-max min-w-full items-center justify-center p-4">
            <div
              ref={containerRef}
              className="rounded-lg shadow-md ring-1 ring-black/5"
              style={{ width: displaySize.width, height: displaySize.height, ...CHECKER_STYLE }}
              aria-label="Lienzo del editor"
              role="img"
            />
          </div>
          {initialLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Cargando proyecto…
              </div>
            </div>
          ) : null}
          {!initialLoading && layers.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
              <p className="rounded-lg border bg-background/85 px-4 py-2 text-center text-xs text-muted-foreground backdrop-blur-sm">
                Importa una imagen o elige una herramienta para empezar.
                <br />
                Usa «Ajustar imagen al lienzo» si quieres que el proyecto adopte el tamaño de tu
                imagen.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Panel derecho: capas / ajustes / IA */}
      <div className="flex h-[480px] w-full shrink-0 flex-col rounded-xl border bg-card lg:h-full lg:w-80">
        <Tabs
          value={panelTab}
          onValueChange={(v) => setPanelTab(v as PanelTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="h-9 w-full shrink-0 justify-start gap-0 rounded-b-none border-b bg-muted/40 p-1">
            <TabsTrigger value="layers" className="h-7 flex-1 gap-1.5 px-2 text-xs">
              <Layers className="size-3.5" aria-hidden />
              Capas ({layers.length})
            </TabsTrigger>
            <TabsTrigger value="adjust" className="h-7 flex-1 gap-1.5 px-2 text-xs">
              <SlidersHorizontal className="size-3.5" aria-hidden />
              Ajustes
            </TabsTrigger>
            <TabsTrigger value="ai" className="h-7 flex-1 gap-1.5 px-2 text-xs">
              <Sparkles className="size-3.5" aria-hidden />
              IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="layers" className="mt-0 min-h-0 flex-1 overflow-y-auto p-3">
            {/* Propiedades contextuales */}
            {selectionKind === "none" ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Selecciona un objeto en el lienzo (o en la lista de capas) para editar sus
                propiedades.
              </p>
            ) : null}
            {selectionKind === "multi" ? (
              <div className="space-y-3">
                <p className="text-xs font-medium">{selectedCount} objetos seleccionados</p>
                <SliderRow
                  label="Opacidad"
                  value={selectionProps.opacity}
                  min={0}
                  max={100}
                  onChange={(v) => applyProps({ opacity: v })}
                  format={(v) => `${v}%`}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 gap-1.5"
                    onClick={() => {
                      const canvas = canvasRef.current;
                      const active = canvas?.getActiveObject();
                      if (canvas && active instanceof fabric.ActiveSelection) {
                        void Promise.all(active.getObjects().map((o) => o.clone())).then((clones) => {
                          clones.forEach((c, i) => {
                            c.set({ left: (c.left ?? 0) + 16, top: (c.top ?? 0) + 16 });
                            canvas.add(c);
                          });
                          canvas.requestRenderAll();
                          toast.success("Capas duplicadas.");
                        });
                      }
                    }}
                  >
                    <Copy className="size-3.5" aria-hidden />
                    Duplicar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                    onClick={deleteSelected}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Eliminar
                  </Button>
                </div>
              </div>
            ) : null}
            {hasSingleSelection ? (
              <div className="space-y-3">
                <p className="truncate text-xs font-medium" title={selectedName}>
                  {selectedName}
                </p>

                {selectionKind === "image" ? (
                  <div className="rounded-lg border bg-muted/20 p-2.5 text-xs text-muted-foreground">
                    Los filtros y ajustes de color están en la pestaña{" "}
                    <button
                      type="button"
                      onClick={() => setPanelTab("adjust")}
                      className="font-medium text-amber-700 underline underline-offset-2 dark:text-amber-400"
                    >
                      Ajustes
                    </button>
                    .
                  </div>
                ) : null}

                {selectionKind === "text" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Fuente</Label>
                        <Select
                          value={selectionProps.fontFamily}
                          onValueChange={(v) => applyProps({ fontFamily: v })}
                        >
                          <SelectTrigger className="h-8 text-xs" aria-label="Fuente">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["Arial", "Helvetica", "Georgia", "Courier New"].map((f) => (
                              <SelectItem key={f} value={f} className="text-xs">
                                {f}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <SliderRow
                        label="Tamaño"
                        value={selectionProps.fontSize}
                        min={8}
                        max={200}
                        onChange={(v) => applyProps({ fontSize: v })}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        aria-pressed={selectionProps.bold}
                        title="Negrita"
                        onClick={() => applyProps({ bold: !selectionProps.bold })}
                        className={cn(
                          "size-8 font-bold",
                          selectionProps.bold && "border-amber-600 bg-amber-600 text-white hover:bg-amber-700",
                        )}
                      >
                        B
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-pressed={selectionProps.italic}
                        title="Cursiva"
                        onClick={() => applyProps({ italic: !selectionProps.italic })}
                        className={cn(
                          "size-8 italic",
                          selectionProps.italic && "border-amber-600 bg-amber-600 text-white hover:bg-amber-700",
                        )}
                      >
                        I
                      </Button>
                      <Separator orientation="vertical" className="h-6" />
                      {(
                        [
                          { v: "left", icon: AlignLeft, title: "Alinear a la izquierda" },
                          { v: "center", icon: AlignCenter, title: "Centrar" },
                          { v: "right", icon: AlignRight, title: "Alinear a la derecha" },
                        ] as const
                      ).map((a) => (
                        <Button
                          key={a.v}
                          variant="outline"
                          size="icon"
                          aria-pressed={selectionProps.align === a.v}
                          title={a.title}
                          onClick={() => applyProps({ align: a.v })}
                          className={cn(
                            "size-8",
                            selectionProps.align === a.v &&
                              "border-amber-600 bg-amber-600 text-white hover:bg-amber-700",
                          )}
                        >
                          <a.icon className="size-4" aria-hidden />
                        </Button>
                      ))}
                    </div>
                    <ColorField
                      label="Color de relleno"
                      value={selectionProps.fill}
                      onChange={(v) => applyProps({ fill: v })}
                    />
                    <ColorField
                      label="Color de borde"
                      value={selectionProps.stroke}
                      onChange={(v) => applyProps({ stroke: v })}
                    />
                    <SliderRow
                      label="Grosor del borde"
                      value={selectionProps.strokeWidth}
                      min={0}
                      max={20}
                      onChange={(v) => applyProps({ strokeWidth: v })}
                    />
                  </>
                ) : null}

                {selectionKind === "shape" ? (
                  <>
                    {selectedName.toLowerCase().startsWith("línea") ? null : (
                      <ColorField
                        label="Color de relleno"
                        value={selectionProps.fill}
                        onChange={(v) => applyProps({ fill: v })}
                      />
                    )}
                    <ColorField
                      label="Color de borde"
                      value={selectionProps.stroke}
                      onChange={(v) => applyProps({ stroke: v })}
                    />
                    <SliderRow
                      label="Grosor del borde"
                      value={selectionProps.strokeWidth}
                      min={0}
                      max={20}
                      onChange={(v) => applyProps({ strokeWidth: v })}
                    />
                  </>
                ) : null}

                <SliderRow
                  label="Opacidad"
                  value={selectionProps.opacity}
                  min={0}
                  max={100}
                  onChange={(v) => applyProps({ opacity: v })}
                  format={(v) => `${v}%`}
                />

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 gap-1.5"
                    onClick={() => {
                      const canvas = canvasRef.current;
                      const active = canvas?.getActiveObject();
                      if (canvas && active) duplicateLayer(active);
                    }}
                  >
                    <Copy className="size-3.5" aria-hidden />
                    Duplicar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                    onClick={deleteSelected}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Eliminar
                  </Button>
                </div>
              </div>
            ) : null}

            <Separator className="my-3" />

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Capas · delante hacia atrás
            </p>
            <div className="space-y-1">
              {layers.map((l, i) => {
                const Icon = LAYER_ICONS[l.icon];
                return (
                  <div
                    key={l.key}
                    className={cn(
                      "flex items-center gap-0.5 rounded-lg border px-1.5 py-1 transition-colors",
                      l.selected
                        ? "border-amber-500 bg-amber-500/10"
                        : "bg-background hover:bg-muted/50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => selectLayer(l.obj)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded text-left"
                      title={`Seleccionar ${l.name}`}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{l.name}</span>
                      {!l.visible ? <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
                      {l.locked ? <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
                    </button>
                    <RowIconButton
                      title={l.visible ? "Ocultar capa" : "Mostrar capa"}
                      onClick={() => toggleVisible(l.obj)}
                    >
                      {l.visible ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                    </RowIconButton>
                    <RowIconButton
                      title={l.locked ? "Desbloquear capa" : "Bloquear capa"}
                      onClick={() => toggleLock(l.obj)}
                    >
                      {l.locked ? <Lock className="size-3.5" aria-hidden /> : <LockOpen className="size-3.5" aria-hidden />}
                    </RowIconButton>
                    <RowIconButton
                      title="Subir capa"
                      disabled={i === 0}
                      onClick={() => moveLayer(l.obj, 1)}
                    >
                      <ArrowUp className="size-3.5" aria-hidden />
                    </RowIconButton>
                    <RowIconButton
                      title="Bajar capa"
                      disabled={i === layers.length - 1}
                      onClick={() => moveLayer(l.obj, -1)}
                    >
                      <ArrowDown className="size-3.5" aria-hidden />
                    </RowIconButton>
                    <RowIconButton title="Duplicar capa" onClick={() => duplicateLayer(l.obj)}>
                      <Copy className="size-3.5" aria-hidden />
                    </RowIconButton>
                    <RowIconButton title="Eliminar capa" danger onClick={() => removeObjects([l.obj])}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </RowIconButton>
                  </div>
                );
              })}
              {layers.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Sin capas todavía. Importa una imagen, escribe un texto o dibuja algo.
                </p>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="adjust" className="mt-0 min-h-0 flex-1 overflow-y-auto p-3">
            {selectionKind === "image" ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Ajustes de <span className="font-medium text-foreground">{selectedName}</span>
                </p>
                <SliderRow
                  label="Brillo"
                  value={filters.brightness}
                  min={-100}
                  max={100}
                  onChange={(v) => updateFilters({ brightness: v })}
                />
                <SliderRow
                  label="Contraste"
                  value={filters.contrast}
                  min={-100}
                  max={100}
                  onChange={(v) => updateFilters({ contrast: v })}
                />
                <SliderRow
                  label="Saturación"
                  value={filters.saturation}
                  min={-100}
                  max={100}
                  onChange={(v) => updateFilters({ saturation: v })}
                />
                <SliderRow
                  label="Desenfoque"
                  value={filters.blur}
                  min={0}
                  max={20}
                  onChange={(v) => updateFilters({ blur: v })}
                />
                <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
                  <SwitchRow
                    label="Escala de grises"
                    checked={filters.grayscale}
                    onChange={(v) => updateFilters({ grayscale: v })}
                  />
                  <SwitchRow
                    label="Sepia"
                    checked={filters.sepia}
                    onChange={(v) => updateFilters({ sepia: v })}
                  />
                  <SwitchRow
                    label="Invertir colores"
                    checked={filters.invert}
                    onChange={(v) => updateFilters({ invert: v })}
                  />
                </div>
                <SliderRow
                  label="Pixelado"
                  value={filters.pixelate}
                  min={0}
                  max={50}
                  onChange={(v) => updateFilters({ pixelate: v })}
                  format={(v) => (v < 2 ? "Sin pixelar" : `${v} px`)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full gap-1.5"
                  onClick={resetFilters}
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Restablecer filtros
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                {layers.some((l) => l.icon === "image")
                  ? "Selecciona una imagen en el lienzo (o en Capas) para ajustar brillo, contraste, saturación, desenfoque y más."
                  : "Importa una imagen para poder aplicar filtros y ajustes de color."}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ai" className="mt-0 min-h-0 flex-1 p-3">
            <AssistantTab messages={chat} running={chatRunning} onSend={(t) => void sendChat(t)} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Diálogo IA de imagen */}
      <AiImageDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        hasSelection={hasSingleSelection}
        running={aiRunning}
        error={aiError}
        onSubmit={(prompt, onlySelection) => void runAiImage(prompt, onlySelection)}
      />
    </div>
  );
}
