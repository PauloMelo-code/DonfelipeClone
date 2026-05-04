"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Crop, Droplets, Undo2, ImageIcon, Eraser, Pencil, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoEditorProps {
  photos: string[];
  editedPhotos: Record<number, string>;
  onPhotoEdited: (index: number, dataUrl: string) => void;
  onPhotoReset: (index: number) => void;
  defaultFullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

type Tool = "crop" | "blur" | "erase" | "pencil";

const PENCIL_COLORS = [
  { label: "Preto",  value: "#000000" },
  { label: "Cinza",  value: "#6b7280" },
  { label: "Branco", value: "#ffffff" },
] as const;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function PhotoEditor({
  photos,
  editedPhotos,
  onPhotoEdited,
  onPhotoReset,
  defaultFullscreen = false,
  onFullscreenChange,
}: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("blur");
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [brushSize, setBrushSize] = useState(24);
  const [pencilColor, setPencilColor] = useState("#000000");
  const [fullscreen, setFullscreen] = useState(defaultFullscreen);
  const cleanImageRef = useRef<ImageData | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  // Crop box state (WhatsApp-style: drag edges/corners)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropDragRef = useRef<{ edge: string; startY: number; startX: number; startBox: { x: number; y: number; w: number; h: number } } | null>(null);

  // Initialize crop box when crop tool selected
  useEffect(() => {
    if (tool === "crop" && canvasRef.current && imageLoaded) {
      setCropBox({ x: 0, y: 0, w: canvasRef.current.width, h: canvasRef.current.height });
    } else {
      setCropBox(null);
    }
  }, [tool, imageLoaded]);

  function startCropDrag(e: React.PointerEvent, edge: string) {
    e.stopPropagation();
    e.preventDefault();
    cropDragRef.current = { edge, startY: e.clientY, startX: e.clientX, startBox: cropBox ? { ...cropBox } : { x: 0, y: 0, w: 0, h: 0 } };

    const onMove = (ev: PointerEvent) => {
      if (!cropDragRef.current || !canvasRef.current) return;
      const { edge: edg, startY, startX, startBox } = cropDragRef.current;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const dy = (ev.clientY - startY) * scaleY;
      const dx = (ev.clientX - startX) * scaleX;

      setCropBox(() => {
        const box = { ...startBox };
        // "move" = drag entire crop box without resizing
        if (edg === "move") {
          box.x = Math.max(0, Math.min(startBox.x + dx, canvas.width - startBox.w));
          box.y = Math.max(0, Math.min(startBox.y + dy, canvas.height - startBox.h));
          return box;
        }
        if (edg === "top" || edg === "top-left" || edg === "top-right") {
          box.y = Math.max(0, Math.min(startBox.y + dy, startBox.y + startBox.h - 50));
          box.h = startBox.h - (box.y - startBox.y);
        }
        if (edg === "bottom" || edg === "bottom-left" || edg === "bottom-right") {
          box.h = Math.max(50, Math.min(startBox.h + dy, canvas.height - startBox.y));
        }
        if (edg === "left" || edg === "top-left" || edg === "bottom-left") {
          box.x = Math.max(0, Math.min(startBox.x + dx, startBox.x + startBox.w - 50));
          box.w = startBox.w - (box.x - startBox.x);
        }
        if (edg === "right" || edg === "top-right" || edg === "bottom-right") {
          box.w = Math.max(50, Math.min(startBox.w + dx, canvas.width - startBox.x));
        }
        return box;
      });
    };

    const onUp = () => {
      cropDragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function applyCrop() {
    if (!cropBox || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || !cleanImageRef.current) return;

    saveToHistory();

    ctx.putImageData(cleanImageRef.current, 0, 0);

    const { x, y, w, h } = cropBox;
    const imageData = ctx.getImageData(
      Math.round(x), Math.round(y), Math.round(w), Math.round(h)
    );
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    ctx.putImageData(imageData, 0, 0);

    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      cleanImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setCropBox(null);
      setTool("blur");
      onPhotoEdited(selectedIndex, dataUrl);
    } catch {
      setImageError(true);
    }
  }

  // Notify parent when fullscreen changes
  useEffect(() => {
    onFullscreenChange?.(fullscreen);
  }, [fullscreen, onFullscreenChange]);

  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      setHistory(prev => [...prev, canvas.toDataURL("image/png")]);
    } catch {
      // CORS tainted canvas
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      cleanImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      try {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        onPhotoEdited(selectedIndex, dataUrl);
      } catch {
        // CORS tainted canvas
      }
    };
    img.src = prev;
  }, [history, selectedIndex, onPhotoEdited]);

  // Keep latest editedPhotos available without making it a dep that triggers reload
  const editedPhotosRef = useRef(editedPhotos);
  useEffect(() => {
    editedPhotosRef.current = editedPhotos;
  }, [editedPhotos]);

  // Imperative image loader (used by switch effect AND by resetPhoto)
  const loadImage = useCallback((src: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setImageLoaded(false);
    setImageError(false);
    setCurrentRect(null);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxW = 480;
      const maxH = 360;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      cleanImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setImageLoaded(true);
    };
    img.onerror = () => setImageError(true);
    img.src = src;
  }, []);

  // Load image when actually switching photos (NOT on every edit save)
  // editedPhotos is read via ref so saves don't trigger reload + history reset
  useEffect(() => {
    const src = editedPhotosRef.current[selectedIndex] || photos[selectedIndex];
    if (!src) return;
    setHistory([]); // reset undo history only on actual photo switch
    loadImage(src);
  }, [selectedIndex, photos, loadImage]);

  // Draw rect selection overlay (blur only — crop uses CSS overlay)
  useEffect(() => {
    if (!currentRect || !imageLoaded || tool !== "blur") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || !cleanImageRef.current) return;

    ctx.putImageData(cleanImageRef.current, 0, 0);

    const { x, y, w, h } = currentRect;

    ctx.fillStyle = "rgba(59,130,246,0.15)";
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "#3B82F6";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }, [currentRect, tool, imageLoaded]);

  const getPosFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const getMousePos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) =>
      getPosFromClient(e.clientX, e.clientY),
    [getPosFromClient]
  );

  const getTouchPos = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const touch = e.touches[0] || e.changedTouches[0];
      return getPosFromClient(touch.clientX, touch.clientY);
    },
    [getPosFromClient]
  );

  // Paint at a point with given color
  const paintAt = useCallback(
    (pos: { x: number; y: number }, color: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    [brushSize]
  );

  // Save erased state continuously to cleanImageRef and notify parent
  const saveErase = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      cleanImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      onPhotoEdited(selectedIndex, dataUrl);
    } catch {
      // CORS tainted canvas
    }
  }, [selectedIndex, onPhotoEdited]);

  const startDraw = (pos: { x: number; y: number }) => {
    if (tool === "crop") return; // crop is handled by overlay drag handles
    if (tool === "erase" || tool === "pencil") {
      saveToHistory();
      setDrawing(true);
      paintAt(pos, tool === "erase" ? "#ffffff" : pencilColor);
    } else {
      setStartPos(pos);
      setDrawing(true);
      setCurrentRect(null);
    }
  };

  const moveDraw = (pos: { x: number; y: number }) => {
    if (!drawing || tool === "crop") return;
    if (tool === "erase" || tool === "pencil") {
      paintAt(pos, tool === "erase" ? "#ffffff" : pencilColor);
    } else {
      setCurrentRect({
        x: Math.min(startPos.x, pos.x),
        y: Math.min(startPos.y, pos.y),
        w: Math.abs(pos.x - startPos.x),
        h: Math.abs(pos.y - startPos.y),
      });
    }
  };

  const endDraw = () => {
    if (drawing && (tool === "erase" || tool === "pencil")) {
      saveErase();
    }
    setDrawing(false);
  };

  // Mouse
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => startDraw(getMousePos(e));
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => moveDraw(getMousePos(e));
  const handleMouseUp = () => endDraw();

  // Attach touch events natively with { passive: false } so e.preventDefault() works
  // (prevents page scroll while drawing on mobile)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      startDraw(getPosFromClient(touch.clientX, touch.clientY));
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      moveDraw(getPosFromClient(touch.clientX, touch.clientY));
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      endDraw();
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageLoaded, tool, drawing, startPos, brushSize, pencilColor]);

  const applyTool = () => {
    if (!currentRect || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || !cleanImageRef.current) return;

    saveToHistory();

    ctx.putImageData(cleanImageRef.current, 0, 0);

    const { x, y, w, h } = currentRect;

    // Blur using pixel-downscale approach (cross-browser compatible)
    const imageData = ctx.getImageData(x, y, w, h);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;
    tempCtx.putImageData(imageData, 0, 0);

    const scale = 0.1;
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = w;
    blurCanvas.height = h;
    const blurCtx = blurCanvas.getContext("2d");
    if (!blurCtx) return;
    blurCtx.imageSmoothingEnabled = true;
    blurCtx.drawImage(tempCanvas, 0, 0, w * scale, h * scale);
    blurCtx.drawImage(blurCanvas, 0, 0, w * scale, h * scale, 0, 0, w, h);
    ctx.drawImage(blurCanvas, x, y);

    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      cleanImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setCurrentRect(null);
      onPhotoEdited(selectedIndex, dataUrl);
    } catch {
      setImageError(true);
    }
  };

  const resetPhoto = () => {
    setCurrentRect(null);
    setHistory([]);
    onPhotoReset(selectedIndex);
    // Reload original imperatively (since editedPhotos is no longer a useEffect dep)
    if (photos[selectedIndex]) loadImage(photos[selectedIndex]);
  };

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ImageIcon className="h-10 w-10 opacity-30 mb-2" />
        <p className="text-sm">Nenhuma foto disponivel</p>
      </div>
    );
  }

  const cursorStyle =
    tool === "erase"
      ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${brushSize}' height='${brushSize}' viewBox='0 0 ${brushSize} ${brushSize}'%3E%3Ccircle cx='${brushSize / 2}' cy='${brushSize / 2}' r='${brushSize / 2 - 1}' fill='none' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") ${brushSize / 2} ${brushSize / 2}, crosshair`
      : "crosshair";

  // Single return — outer wrapper toggles CSS classes so canvas is NEVER remounted
  return (
    <div className={cn(
      fullscreen
        ? "fixed inset-0 z-[9999] bg-[#0D0D0F] flex flex-col"
        : ""
    )}>
      {/* Fullscreen top bar */}
      {fullscreen && (
        <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-2 border-b border-white/[0.06] flex-shrink-0">
          <span className="text-sm font-medium text-foreground">Editor de foto</span>
          <button
            onClick={() => setFullscreen(false)}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className={cn("space-y-3 p-4", fullscreen && "overflow-y-auto flex-1")}>
        {/* Photo thumbnails */}
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((photo, i) => (
              <button
                key={i}
                onClick={() => setSelectedIndex(i)}
                className={cn(
                  "flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all",
                  selectedIndex === i
                    ? "border-cugini-orange ring-1 ring-cugini-orange/30"
                    : editedPhotos[i]
                    ? "border-blue-500/50"
                    : "border-white/10 hover:border-white/30"
                )}
              >
                <img src={editedPhotos[i] || photo} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Tool selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant={tool === "blur" ? "default" : "outline"}
            onClick={() => { setTool("blur"); setCurrentRect(null); }}
            className={cn("gap-1.5 text-xs", tool === "blur" && "gradient-orange text-white border-0")}>
            <Droplets className="h-3.5 w-3.5" />Blur
          </Button>
          <Button size="sm" variant={tool === "crop" ? "default" : "outline"}
            onClick={() => { setTool("crop"); setCurrentRect(null); }}
            className={cn("gap-1.5 text-xs", tool === "crop" && "gradient-orange text-white border-0")}>
            <Crop className="h-3.5 w-3.5" />Recortar
          </Button>
          <Button size="sm" variant={tool === "pencil" ? "default" : "outline"}
            onClick={() => { setTool("pencil"); setCurrentRect(null); }}
            className={cn("gap-1.5 text-xs", tool === "pencil" && "gradient-orange text-white border-0")}>
            <Pencil className="h-3.5 w-3.5" />Lápis
          </Button>
          <Button size="sm" variant={tool === "erase" ? "default" : "outline"}
            onClick={() => { setTool("erase"); setCurrentRect(null); }}
            className={cn("gap-1.5 text-xs", tool === "erase" && "gradient-orange text-white border-0")}>
            <Eraser className="h-3.5 w-3.5" />Borracha
          </Button>
          <div className="flex-1" />
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className={cn(
              "rounded-lg border border-border p-1.5 text-muted-foreground transition-colors",
              history.length === 0
                ? "opacity-40 cursor-not-allowed"
                : "hover:text-foreground hover:bg-accent"
            )}
            title="Desfazer"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          {editedPhotos[selectedIndex] && (
            <Button size="sm" variant="outline" onClick={resetPhoto}
              className="gap-1.5 border-border text-xs">
              <ImageIcon className="h-3.5 w-3.5" />Original
            </Button>
          )}
          <button
            onClick={() => setFullscreen((v) => !v)}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={fullscreen ? "Sair de tela cheia" : "Expandir para pintar"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Brush controls */}
        {(tool === "erase" || tool === "pencil") && (
          <div className="space-y-2">
            {tool === "pencil" && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">Cor:</span>
                <div className="flex gap-1.5">
                  {PENCIL_COLORS.map((c) => (
                    <button key={c.value} title={c.label} onClick={() => setPencilColor(c.value)}
                      className={cn("w-7 h-7 rounded-full border-2 transition-all",
                        pencilColor === c.value ? "border-cugini-orange scale-110" : "border-white/20 hover:border-white/50"
                      )}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">Tamanho:</span>
              <input type="range" min={8} max={80} value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="flex-1 h-2 accent-cugini-orange" />
              <span className="text-[11px] text-muted-foreground w-6 text-right">{brushSize}</span>
            </div>
          </div>
        )}

        {/* Canvas container */}
        <div className={cn(
          "relative bg-black/40 rounded-lg overflow-hidden flex items-center justify-center",
          fullscreen ? "min-h-[50vh]" : "min-h-[220px]"
        )}>
          {imageError ? (
            <p className="text-sm text-muted-foreground">Erro ao carregar imagem (CORS)</p>
          ) : !imageLoaded ? (
            <div className="animate-pulse text-sm text-muted-foreground">Carregando...</div>
          ) : null}
          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              className={cn(
                "max-w-full block",
                fullscreen ? "max-h-[60vh]" : "max-h-[300px]",
                (!imageLoaded || imageError) && "hidden"
              )}
              style={{ cursor: tool === "crop" ? "default" : cursorStyle, touchAction: "none" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            {/* WhatsApp-style crop overlay */}
            {tool === "crop" && cropBox && canvasRef.current && imageLoaded && (() => {
              const canvas = canvasRef.current!;
              const rect = canvas.getBoundingClientRect();
              const scaleX = rect.width / canvas.width;
              const scaleY = rect.height / canvas.height;
              const bx = cropBox.x * scaleX;
              const by = cropBox.y * scaleY;
              const bw = cropBox.w * scaleX;
              const bh = cropBox.h * scaleY;
              return (
                <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
                  {/* Dark overlay outside crop area */}
                  <div className="absolute bg-black/60" style={{ top: 0, left: 0, right: 0, height: by }} />
                  <div className="absolute bg-black/60" style={{ top: by + bh, left: 0, right: 0, bottom: 0 }} />
                  <div className="absolute bg-black/60" style={{ top: by, left: 0, width: bx, height: bh }} />
                  <div className="absolute bg-black/60" style={{ top: by, left: bx + bw, right: 0, height: bh }} />
                  {/* Crop border. The interior captures pointer-events for dragging the
                      whole box. Handles are wrapped in 44x44 invisible touch targets so
                      thumbs can grab them on mobile. */}
                  <div
                    className="absolute border-2 border-white cursor-move"
                    style={{ top: by, left: bx, width: bw, height: bh, pointerEvents: "auto", touchAction: "none" }}
                    onPointerDown={(e) => {
                      // Only start move-drag if user touched the interior (not a handle)
                      if ((e.target as HTMLElement).dataset.handle) return;
                      startCropDrag(e, "move");
                    }}
                  >
                    {/* Corner handles — 44x44 hit area, small white L visual on top */}
                    {([
                      { edge: "top-left", pos: "-top-6 -left-6", inner: "top-4 left-4 border-t-[3px] border-l-[3px] rounded-tl", cursor: "cursor-nwse-resize" },
                      { edge: "top-right", pos: "-top-6 -right-6", inner: "top-4 right-4 border-t-[3px] border-r-[3px] rounded-tr", cursor: "cursor-nesw-resize" },
                      { edge: "bottom-left", pos: "-bottom-6 -left-6", inner: "bottom-4 left-4 border-b-[3px] border-l-[3px] rounded-bl", cursor: "cursor-nesw-resize" },
                      { edge: "bottom-right", pos: "-bottom-6 -right-6", inner: "bottom-4 right-4 border-b-[3px] border-r-[3px] rounded-br", cursor: "cursor-nwse-resize" },
                    ] as const).map((c) => (
                      <div
                        key={c.edge}
                        data-handle="1"
                        className={cn("absolute w-11 h-11", c.pos, c.cursor)}
                        style={{ touchAction: "none" }}
                        onPointerDown={(e) => startCropDrag(e, c.edge)}
                      >
                        <span aria-hidden className={cn("absolute w-5 h-5 border-white", c.inner)} />
                      </div>
                    ))}

                    {/* Edge handles — 44px hit area, slim white bar visual */}
                    <div
                      data-handle="1"
                      className="absolute -top-6 left-1/2 -translate-x-1/2 w-16 h-10 cursor-ns-resize flex items-center justify-center"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => startCropDrag(e, "top")}
                    >
                      <span aria-hidden className="w-10 h-1.5 bg-white/90 rounded" />
                    </div>
                    <div
                      data-handle="1"
                      className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-16 h-10 cursor-ns-resize flex items-center justify-center"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => startCropDrag(e, "bottom")}
                    >
                      <span aria-hidden className="w-10 h-1.5 bg-white/90 rounded" />
                    </div>
                    <div
                      data-handle="1"
                      className="absolute top-1/2 -left-6 -translate-y-1/2 h-16 w-10 cursor-ew-resize flex items-center justify-center"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => startCropDrag(e, "left")}
                    >
                      <span aria-hidden className="h-10 w-1.5 bg-white/90 rounded" />
                    </div>
                    <div
                      data-handle="1"
                      className="absolute top-1/2 -right-6 -translate-y-1/2 h-16 w-10 cursor-ew-resize flex items-center justify-center"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => startCropDrag(e, "right")}
                    >
                      <span aria-hidden className="h-10 w-1.5 bg-white/90 rounded" />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Apply / hint */}
        {tool === "crop" && cropBox ? (
          <Button size="sm" onClick={applyCrop} className="w-full gradient-orange text-white border-0">
            Aplicar recorte
          </Button>
        ) : tool === "blur" && currentRect && currentRect.w > 10 && currentRect.h > 10 ? (
          <Button size="sm" onClick={applyTool} className="w-full gradient-orange text-white border-0">
            Aplicar blur
          </Button>
        ) : (
          <p className="text-[11px] text-center text-muted-foreground">
            {tool === "crop" ? "Arraste as bordas/cantos pra redimensionar · arraste o meio pra mover"
              : tool === "blur" ? "Arraste para borrar a area selecionada"
              : tool === "pencil" ? "Pinte sobre a area que deseja cobrir"
              : "Pinte sobre o fundo para apaga-lo (branco)"}
          </p>
        )}
      </div>
    </div>
  );
}
