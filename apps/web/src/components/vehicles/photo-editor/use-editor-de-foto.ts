"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SELECAO_MINIMA, cobreTudo, posicaoNoCanvas, redimensionarCaixa, retanguloEntre } from "./geometria";
import {
  QUALIDADE_JPEG, borrarArea, carregarNoCanvas, desenharSelecao,
  pintarTraco, recortar, restaurarDe,
} from "./pintura";
import type { Borda, PhotoEditorProps, Rect, Tool } from "./tipos";

// ---------------------------------------------------------------------------
// O estado do editor e a ligacao dele com o canvas.
//
// Duas regras sustentam tudo aqui:
//
//   1. A imagem limpa vive num `ImageData` a parte. Toda previa -- a moldura
//      do blur, por exemplo -- repinta a partir dela, senao cada movimento do
//      mouse empilharia efeito sobre efeito.
//   2. Trocar de foto recarrega e zera o desfazer; salvar uma edicao NAO.
//      Por isso `editedPhotos` e lido por referencia, fora das dependencias do
//      efeito de carga: se entrasse nelas, cada pincelada recarregaria a foto
//      e apagaria o historico.
//
// No `modoRapido` (o card da triagem) nao ha botao de aplicar: soltar a borda
// recorta e soltar o dedo borra. Desfazer e Original cobrem o engano.
// ---------------------------------------------------------------------------


export function useEditorDeFoto({
  photos,
  editedPhotos,
  onPhotoEdited,
  onPhotoReset,
  defaultFullscreen = false,
  onFullscreenChange,
  modoRapido = false,
}: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagemLimpaRef = useRef<ImageData | null>(null);

  const [indice, setIndice] = useState(0);
  const [ferramenta, setFerramenta] = useState<Tool>(modoRapido ? "crop" : "blur");
  const [desenhando, setDesenhando] = useState(false);
  const [inicio, setInicio] = useState({ x: 0, y: 0 });
  const [selecao, setSelecao] = useState<Rect | null>(null);
  const [carregada, setCarregada] = useState(false);
  const [erro, setErro] = useState(false);
  const [tamanhoDoPincel, setTamanhoDoPincel] = useState(24);
  const [corDoLapis, setCorDoLapis] = useState("#000000");
  const [telaCheia, setTelaCheia] = useState(defaultFullscreen);
  const [historico, setHistorico] = useState<string[]>([]);
  const [caixaDeCorte, setCaixaDeCorte] = useState<Rect | null>(null);
  // Muda sempre que a imagem do canvas muda de tamanho (recorte, desfazer).
  const [versao, setVersao] = useState(0);
  const caixaAtualRef = useRef<Rect | null>(null);
  const arrasteRef = useRef<{ borda: Borda; xInicial: number; yInicial: number; caixaInicial: Rect } | null>(null);

  const contexto = () => canvasRef.current?.getContext("2d") ?? null;

  /** Entrega o resultado ao componente pai. Canvas contaminado por CORS falha calado. */
  const publicar = useCallback((canvas: HTMLCanvasElement) => {
    try {
      onPhotoEdited(indice, canvas.toDataURL("image/jpeg", QUALIDADE_JPEG));
      return true;
    } catch {
      return false;
    }
  }, [indice, onPhotoEdited]);

  const guardarNoHistorico = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      setHistorico((prev) => [...prev, canvas.toDataURL("image/png")]);
    } catch {
      // canvas contaminado por CORS
    }
  }, []);

  const desfazer = useCallback(() => {
    if (historico.length === 0) return;
    const anterior = historico[historico.length - 1];
    setHistorico((h) => h.slice(0, -1));
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    restaurarDe(canvas, ctx, anterior, (limpa) => {
      imagemLimpaRef.current = limpa;
      setVersao((v) => v + 1);
      publicar(canvas);
    });
  }, [historico, publicar]);

  // O valor mais recente sem virar dependencia do efeito de carga.
  const editadasRef = useRef(editedPhotos);
  useEffect(() => { editadasRef.current = editedPhotos; }, [editedPhotos]);

  const carregar = useCallback((src: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    setCarregada(false);
    setErro(false);
    setSelecao(null);
    carregarNoCanvas(canvas, ctx, src,
      (limpa) => {
        imagemLimpaRef.current = limpa;
        // No card a foto aparece pequena: o pincel acompanha o tamanho dela.
        if (modoRapido) setTamanhoDoPincel(Math.max(16, Math.round(canvas.width * 0.04)));
        setCarregada(true);
      },
      () => setErro(true),
    );
  }, [modoRapido]);

  // Recarrega so na troca de foto, nunca ao salvar uma edicao.
  useEffect(() => {
    const src = editadasRef.current[indice] || photos[indice];
    if (!src) return;
    setHistorico([]);
    carregar(src);
  }, [indice, photos, carregar]);

  useEffect(() => {
    onFullscreenChange?.(telaCheia);
  }, [telaCheia, onFullscreenChange]);

  // A caixa de recorte comeca cobrindo a foto inteira, e volta a cobrir depois
  // de cada recorte ou desfazer.
  useEffect(() => {
    const canvas = canvasRef.current;
    const caixa = ferramenta === "crop" && canvas && carregada
      ? { x: 0, y: 0, w: canvas.width, h: canvas.height }
      : null;
    caixaAtualRef.current = caixa;
    setCaixaDeCorte(caixa);
  }, [ferramenta, carregada, versao]);

  // Previa da area de blur: repinta a imagem limpa e desenha a moldura por cima.
  useEffect(() => {
    if (!selecao || !carregada || ferramenta !== "blur") return;
    const ctx = contexto();
    if (!ctx || !imagemLimpaRef.current) return;
    ctx.putImageData(imagemLimpaRef.current, 0, 0);
    desenharSelecao(ctx, selecao);
  }, [selecao, ferramenta, carregada]);

  const posicao = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return posicaoNoCanvas(
      { larguraNaTela: r.width, alturaNaTela: r.height, esquerda: r.left, topo: r.top },
      canvas,
      clientX, clientY,
    );
  }, []);

  /** Pincel e borracha gravam a cada traco: a imagem limpa passa a incluir a tinta. */
  const gravarTraco = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    try {
      imagemLimpaRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      publicar(canvas);
    } catch {
      // canvas contaminado por CORS
    }
  }, [publicar]);

  const ultimoPontoRef = useRef<{ x: number; y: number } | null>(null);
  const pintar = useCallback((pos: { x: number; y: number }) => {
    const ctx = contexto();
    if (!ctx) return;
    pintarTraco(ctx, ultimoPontoRef.current, pos, ferramenta === "erase" ? "#ffffff" : corDoLapis, tamanhoDoPincel);
    ultimoPontoRef.current = pos;
  }, [ferramenta, corDoLapis, tamanhoDoPincel]);

  const aplicarBlur = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!selecao || !canvas || !ctx || !imagemLimpaRef.current) return;

    guardarNoHistorico();
    ctx.putImageData(imagemLimpaRef.current, 0, 0);
    if (!borrarArea(ctx, selecao)) return;

    try {
      imagemLimpaRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setSelecao(null);
      publicar(canvas);
    } catch {
      setErro(true);
    }
  };

  // Estas tres nao sao memorizadas de proposito: o efeito de toque abaixo se
  // reanexa a cada mudanca de estado justamente pra capturar versoes novas.
  const comecarTraco = (pos: { x: number; y: number }) => {
    if (ferramenta === "crop") return; // o recorte tem alcas proprias
    if (ferramenta === "erase" || ferramenta === "pencil") {
      guardarNoHistorico();
      setDesenhando(true);
      ultimoPontoRef.current = null;
      pintar(pos);
    } else {
      setInicio(pos);
      setDesenhando(true);
      setSelecao(null);
    }
  };

  const moverTraco = (pos: { x: number; y: number }) => {
    if (!desenhando || ferramenta === "crop") return;
    if (ferramenta === "erase" || ferramenta === "pencil") pintar(pos);
    else setSelecao(retanguloEntre(inicio, pos));
  };

  const terminarTraco = () => {
    if (desenhando && (ferramenta === "erase" || ferramenta === "pencil")) gravarTraco();
    if (desenhando && modoRapido && ferramenta === "blur"
      && selecao && selecao.w > SELECAO_MINIMA && selecao.h > SELECAO_MINIMA) {
      aplicarBlur();
    }
    setDesenhando(false);
  };

  // Toque precisa de listener nativo com `passive: false` pra o preventDefault
  // valer e a pagina nao rolar enquanto o dedo pinta.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const aoTocar = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      comecarTraco(posicao(t.clientX, t.clientY));
    };
    const aoArrastar = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      moverTraco(posicao(t.clientX, t.clientY));
    };
    const aoSoltar = (e: TouchEvent) => {
      e.preventDefault();
      terminarTraco();
    };

    canvas.addEventListener("touchstart", aoTocar, { passive: false });
    canvas.addEventListener("touchmove", aoArrastar, { passive: false });
    canvas.addEventListener("touchend", aoSoltar, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", aoTocar);
      canvas.removeEventListener("touchmove", aoArrastar);
      canvas.removeEventListener("touchend", aoSoltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregada, ferramenta, desenhando, inicio, selecao, tamanhoDoPincel, corDoLapis]);

  const aplicarRecorte = (caixa: Rect | null = caixaDeCorte) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!caixa || !canvas || !ctx || !imagemLimpaRef.current) return;

    guardarNoHistorico();
    // Corta a imagem limpa, nao a que esta com a moldura desenhada por cima.
    ctx.putImageData(imagemLimpaRef.current, 0, 0);
    recortar(canvas, ctx, caixa);

    try {
      imagemLimpaRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (modoRapido) {
        setVersao((v) => v + 1);
      } else {
        setCaixaDeCorte(null);
        setFerramenta("blur");
      }
      publicar(canvas);
    } catch {
      setErro(true);
    }
  };
  // O soltar da borda roda num listener da janela, criado no pointerdown.
  const aplicarRecorteRef = useRef(aplicarRecorte);
  useEffect(() => { aplicarRecorteRef.current = aplicarRecorte; });

  /** Arrasta uma borda, um canto ou a caixa inteira ate soltar o ponteiro. */
  const arrastarCorte = (e: React.PointerEvent, borda: Borda) => {
    e.stopPropagation();
    e.preventDefault();
    arrasteRef.current = {
      borda,
      xInicial: e.clientX,
      yInicial: e.clientY,
      caixaInicial: caixaDeCorte ? { ...caixaDeCorte } : { x: 0, y: 0, w: 0, h: 0 },
    };

    const aoMover = (ev: PointerEvent) => {
      const arraste = arrasteRef.current;
      const canvas = canvasRef.current;
      if (!arraste || !canvas) return;
      const r = canvas.getBoundingClientRect();
      const dx = (ev.clientX - arraste.xInicial) * (canvas.width / r.width);
      const dy = (ev.clientY - arraste.yInicial) * (canvas.height / r.height);
      const caixa = redimensionarCaixa(arraste.borda, arraste.caixaInicial, dx, dy, canvas);
      caixaAtualRef.current = caixa;
      setCaixaDeCorte(caixa);
    };

    const aoSoltar = () => {
      arrasteRef.current = null;
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      const caixa = caixaAtualRef.current;
      const canvas = canvasRef.current;
      if (modoRapido && caixa && canvas && !cobreTudo(caixa, canvas)) aplicarRecorteRef.current(caixa);
    };

    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
  };

  const voltarAoOriginal = () => {
    setSelecao(null);
    setHistorico([]);
    onPhotoReset(indice);
    if (photos[indice]) carregar(photos[indice]);
  };

  /** Trocar de ferramenta sempre descarta a selecao pendente. */
  const escolherFerramenta = (nova: Tool) => {
    setFerramenta(nova);
    setSelecao(null);
  };

  return {
    canvasRef,
    indice, setIndice,
    ferramenta, escolherFerramenta,
    selecao,
    carregada, erro,
    tamanhoDoPincel, setTamanhoDoPincel,
    corDoLapis, setCorDoLapis,
    telaCheia, setTelaCheia,
    historico, desfazer,
    caixaDeCorte, arrastarCorte,
    aplicarBlur, aplicarRecorte, voltarAoOriginal,
    comecarTraco, moverTraco, terminarTraco, posicao,
  };
}

export type EditorDeFoto = ReturnType<typeof useEditorDeFoto>;
