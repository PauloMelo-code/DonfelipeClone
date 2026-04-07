"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Crop, Droplets, Undo2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoEditorProps {
  photos: string[];
  editedPhotos: Record<number, string>;
  onPhotoEdited: (index: number, dataUrl: string) => void;
  onPhotoReset: (index: number) => void;
}

type Tool = "crop" | "blur";

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
}: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("blur");
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const cleanImageRef = useRef<ImageData | null>(null);

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

  // Draw selection rectangle overlay
  useEffect(() => {
    if (!currentRect || !imageLoaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || !cleanImageRef.current) return;

    // Restore clean state
    ctx.putImageData(cleanImageRef.current, 0, 0);

    const { x, y, w, h } = currentRect;

    if (tool === "crop") {
      // Darken outside crop area
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(x, y, w, h);
      ctx.fill("evenodd");
    } else {
      // Highlight blur area
      ctx.fillStyle = "rgba(59,130,246,0.15)";
      ctx.fillRect(x, y, w, h);
    }

    // Draw selection border
    ctx.strokeStyle = tool === "crop" ? "#E8731A" : "#3B82F6";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }, [currentRect, tool, imageLoaded]);

  const getMousePos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setStartPos(pos);
    setDrawing(true);
    setCurrentRect(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const pos = getMousePos(e);
    setCurrentRect({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x),
      h: Math.abs(pos.y - startPos.y),
    });
  };

  const handleMouseUp = () => setDrawing(false);

  const applyTool = () => {
    if (!currentRect || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || !cleanImageRef.current) return;

    // Restore clean image
    ctx.putImageData(cleanImageRef.current, 0, 0);

    const { x, y, w, h } = currentRect;

    if (tool === "crop") {
      const imageData = ctx.getImageData(x, y, w, h);
      canvas.width = w;
      canvas.height = h;
      ctx.putImageData(imageData, 0, 0);
    } else {
      // Create offscreen canvas with clean image for blur source
      const offscreen = document.createElement("canvas");
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return;
      offCtx.putImageData(cleanImageRef.current, 0, 0);

      // Draw blurred version clipped to selection
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = "blur(14px)";
      ctx.drawImage(offscreen, 0, 0);
      ctx.filter = "none";
      ctx.restore();
    }

    // Save result — canvas may be tainted if image came from external origin
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

  return (
    <div className="p-4 space-y-3">
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
              <img
                src={editedPhotos[i] || photo}
                alt=""
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Tool selector */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={tool === "blur" ? "default" : "outline"}
          onClick={() => setTool("blur")}
          className={cn(
            "gap-1.5 text-xs",
            tool === "blur" && "gradient-orange text-white border-0"
          )}
        >
          <Droplets className="h-3.5 w-3.5" />
          Blur
        </Button>
        <Button
          size="sm"
          variant={tool === "crop" ? "default" : "outline"}
          onClick={() => setTool("crop")}
          className={cn(
            "gap-1.5 text-xs",
            tool === "crop" && "gradient-orange text-white border-0"
          )}
        >
          <Crop className="h-3.5 w-3.5" />
          Recortar
        </Button>
        <div className="flex-1" />
        {editedPhotos[selectedIndex] && (
          <Button
            size="sm"
            variant="outline"
            onClick={resetPhoto}
            className="gap-1.5 border-border text-xs"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Original
          </Button>
        )}
      </div>

      {/* Canvas */}
      <div className="relative bg-black/40 rounded-lg overflow-hidden flex items-center justify-center min-h-[260px]">
        {imageError ? (
          <p className="text-sm text-muted-foreground">
            Erro ao carregar imagem (CORS)
          </p>
        ) : !imageLoaded ? (
          <div className="animate-pulse text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          className={cn(
            "max-w-full max-h-[340px] cursor-crosshair",
            (!imageLoaded || imageError) && "hidden"
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Apply button or instruction */}
      {currentRect && currentRect.w > 10 && currentRect.h > 10 ? (
        <Button
          size="sm"
          onClick={applyTool}
          className="w-full gradient-orange text-white border-0"
        >
          {tool === "crop" ? "Aplicar recorte" : "Aplicar blur"}
        </Button>
      ) : (
        <p className="text-[11px] text-center text-muted-foreground">
          {tool === "crop"
            ? "Arraste na foto para selecionar a area de recorte"
            : "Arraste na foto para borrar a marca do concorrente"}
        </p>
      )}
    </div>
  );
}
