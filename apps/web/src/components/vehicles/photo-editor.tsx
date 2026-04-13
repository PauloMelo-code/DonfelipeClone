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

  // Notify parent when fullscreen changes
  useEffect(() => {
    onFullscreenChange?.(fullscreen);
  }, [fullscreen, onFullscreenChange]);

  // Load image onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setImageLoaded(false);
    setImageError(false);
    setCurrentRect(null);

    const src = editedPhotos[selectedIndex] || photos[selectedIndex];
    if (!src) return;

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
  }, [selectedIndex, photos, editedPhotos]);

  // Draw rect selection overlay (crop/blur only)
  useEffect(() => {
    if (!currentRect || !imageLoaded || tool === "erase") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || !cleanImageRef.current) return;

    ctx.putImageData(cleanImageRef.current, 0, 0);

    const { x, y, w, h } = currentRect;

    if (tool === "crop") {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(x, y, w, h);
      ctx.fill("evenodd");
    } else {
      ctx.fillStyle = "rgba(59,130,246,0.15)";
      ctx.fillRect(x, y, w, h);
    }

    ctx.strokeStyle = tool === "crop" ? "#E8731A" : "#3B82F6";
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
    if (tool === "erase" || tool === "pencil") {
      setDrawing(true);
      paintAt(pos, tool === "erase" ? "#ffffff" : pencilColor);
    } else {
      setStartPos(pos);
      setDrawing(true);
      setCurrentRect(null);
    }
  };

  const moveDraw = (pos: { x: number; y: number }) => {
    if (!drawing) return;
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

    ctx.putImageData(cleanImageRef.current, 0, 0);

    const { x, y, w, h } = currentRect;

    if (tool === "crop") {
      const imageData = ctx.getImageData(x, y, w, h);
      canvas.width = w;
      canvas.height = h;
      ctx.putImageData(imageData, 0, 0);
    } else {
      const offscreen = document.createElement("canvas");
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return;
      offCtx.putImageData(cleanImageRef.current, 0, 0);

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = "blur(14px)";
      ctx.drawImage(offscreen, 0, 0);
      ctx.filter = "none";
      ctx.restore();
    }

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
    onPhotoReset(selectedIndex);
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
          {editedPhotos[selectedIndex] && (
            <Button size="sm" variant="outline" onClick={resetPhoto}
              className="gap-1.5 border-border text-xs">
              <Undo2 className="h-3.5 w-3.5" />Original
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
          <canvas
            ref={canvasRef}
            className={cn(
              "max-w-full",
              fullscreen ? "max-h-[60vh]" : "max-h-[300px]",
              (!imageLoaded || imageError) && "hidden"
            )}
            style={{ cursor: cursorStyle, touchAction: "none" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        {/* Apply / hint */}
        {tool !== "erase" && tool !== "pencil" && currentRect && currentRect.w > 10 && currentRect.h > 10 ? (
          <Button size="sm" onClick={applyTool} className="w-full gradient-orange text-white border-0">
            {tool === "crop" ? "Aplicar recorte" : "Aplicar blur"}
          </Button>
        ) : (
          <p className="text-[11px] text-center text-muted-foreground">
            {tool === "crop" ? "Arraste para selecionar a area de recorte"
              : tool === "blur" ? "Arraste para borrar a area selecionada"
              : tool === "pencil" ? "Pinte sobre a area que deseja cobrir"
              : "Pinte sobre o fundo para apaga-lo (branco)"}
          </p>
        )}
      </div>
    </div>
  );
}
