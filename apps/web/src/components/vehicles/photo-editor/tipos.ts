import { Crop, Droplets, Eraser, Pencil } from "lucide-react";

// ---------------------------------------------------------------------------
// O vocabulario do editor de foto.
//
// O editor existe por um motivo pratico: a foto que chega do grupo de repasse
// costuma vir com telefone, marca d'agua ou o nome da loja de origem. Antes de
// republicar, isso sai.
// ---------------------------------------------------------------------------

export type Tool = "crop" | "blur" | "erase" | "pencil";

/** Area retangular em coordenadas do canvas, nao da tela. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PhotoEditorProps {
  photos: string[];
  editedPhotos: Record<number, string>;
  onPhotoEdited: (index: number, dataUrl: string) => void;
  onPhotoReset: (index: number) => void;
  defaultFullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
  /**
   * Edicao no proprio card: comeca no recorte, recorta ao soltar a borda e
   * borra ao soltar o dedo, sem botao de aplicar.
   */
  modoRapido?: boolean;
}

export const PENCIL_COLORS = [
  { label: "Preto",  value: "#000000" },
  { label: "Cinza",  value: "#6b7280" },
  { label: "Branco", value: "#ffffff" },
] as const;

/** As quatro ferramentas, na ordem em que aparecem na barra. */
export const FERRAMENTAS = [
  { id: "blur" as const,   rotulo: "Blur",      icone: Droplets },
  { id: "crop" as const,   rotulo: "Recortar",  icone: Crop },
  { id: "pencil" as const, rotulo: "Lápis",     icone: Pencil },
  { id: "erase" as const,  rotulo: "Borracha",  icone: Eraser },
];

/** A dica que aparece embaixo quando nao ha nada pra aplicar. */
export const DICAS: Record<Tool, string> = {
  crop: "Arraste as bordas/cantos pra redimensionar · arraste o meio pra mover",
  blur: "Arraste para borrar a área selecionada",
  pencil: "Pinte sobre a área que deseja cobrir",
  erase: "Pinte sobre o fundo para apagá-lo (branco)",
};

/** As bordas e cantos que o operador pode arrastar, mais o corpo da caixa. */
export type Borda =
  | "move"
  | "top" | "bottom" | "left" | "right"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right";
