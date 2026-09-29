"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, CheckSquare, Copy, Eye, Loader2, Pencil, Send, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { anuncioParaExibir, tituloDoAnuncio } from "@/lib/vehicle-formatter";
import { DadosDoCard } from "@/components/vehicles/swipe-stack/dados-do-card";
import { FotoDoCard } from "@/components/vehicles/swipe-stack/foto-do-card";
import { parseArray, statusConfig, type Vehicle } from "./tipos";

// ---------------------------------------------------------------------------
// A grade de cards das abas Aprovados, Prontos, Publicados e Rejeitados -- e
// dos Pendentes, quando o operador escolhe ver em lista.
//
// A triagem por swipe mostra um carro de cada vez. E boa pra decidir com
// calma, mas o cliente quer ver TODAS as oportunidades de uma vez pra
// escolher em quais mexer (24/09/2026): repasse gira rapido, e o carro bom
// some enquanto ele analisa os da frente.
//
// Entao o card aqui e montado das MESMAS pecas da pilha -- `FotoDoCard` e
// `DadosDoCard`. Vem tudo junto: recorte, blur e pincel na foto, a escolha da
// capa nas miniaturas, ano/km/preco editaveis na linha, o texto do anuncio na
// caixa, as margens e a nota. Nao e uma copia parecida -- e o mesmo
// componente, pra que as duas telas nao possam divergir.
// ---------------------------------------------------------------------------

interface AcoesDoCard {
  abaAtiva: string;
  carregandoAcao: string | null;
  marcados: Set<string>;
  aoMarcar: (id: string) => void;
  aoEditar: (v: Vehicle) => void;
  aoReenviar: (v: Vehicle) => void;
  aoRejeitar: (id: string) => void;
  aoPreVisualizar: (v: Vehicle) => void;
  /** So na aba Pendentes. */
  aoAprovar?: (id: string) => void;
  aoPublicarDireto?: (id: string) => void;
  publicandoId?: string | null;
  /** Sem isto nada no card e editavel -- so leitura. */
  aoAtualizarCampo?: (id: string, campo: string, valor: string | number) => Promise<void>;
  aoAbrirGaleria?: (id: string) => void;
  /** A foto principal foi recortada, borrada ou pintada. */
  aoEditarFotoPrincipal?: (id: string, foto: string) => void;
  /** Uma miniatura virou a capa. */
  aoDefinirPrincipal?: (id: string, indice: number) => void;
}

interface Props extends AcoesDoCard {
  veiculos: Vehicle[];
}

export function GradeDeVeiculos({ veiculos, ...acoes }: Props) {
  return (
    <motion.div layout className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      <AnimatePresence>
        {veiculos.map((veiculo) => (
          <CardDeVeiculo key={veiculo.id} veiculo={veiculo} {...acoes} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Um carro na grade.
 *
 * E um componente, e nao um trecho do `map`, porque o rascunho do anuncio
 * mora aqui: cada card guarda o que o operador esta digitando no seu.
 */
function CardDeVeiculo({
  veiculo, abaAtiva, carregandoAcao, marcados,
  aoMarcar, aoEditar, aoReenviar, aoRejeitar, aoPreVisualizar,
  aoAprovar, aoPublicarDireto, publicandoId, aoAtualizarCampo,
  aoAbrirGaleria, aoEditarFotoPrincipal, aoDefinirPrincipal,
}: AcoesDoCard & { veiculo: Vehicle }) {
  const fotos = parseArray(veiculo.photos);
  const opcionais = parseArray(veiculo.features);
  const sc = statusConfig[veiculo.status] || statusConfig.PENDING;
  const ocupado = carregandoAcao === veiculo.id;
  const publicando = publicandoId === veiculo.id;
  // O mesmo titulo da pilha e do anuncio que vai pro grupo: sem o ano, a km e
  // o cambio que vem colados no modelo. A marca continua na frente, que numa
  // lista de muitos carros ela ajuda a achar.
  const titulo = tituloDoAnuncio(veiculo);
  const temMarca = veiculo.brand && !titulo.toUpperCase().startsWith(veiculo.brand.toUpperCase());

  // Edicao no proprio card so nos pendentes: nas outras abas ha o modal de
  // Editar, que ja vem com a escolha dos grupos junto.
  const editavel = veiculo.status === "PENDING" ? aoAtualizarCampo : undefined;
  // Recorte, blur, pincel e troca de capa: so nos pendentes, como na pilha.
  const fotoEditavel = veiculo.status === "PENDING" && !!aoEditarFotoPrincipal;

  // null = o operador nao mexeu no texto.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [salvandoTexto, setSalvandoTexto] = useState(false);
  const gravacaoRef = useRef<Promise<boolean> | null>(null);

  const gravarRascunho = async (): Promise<boolean> => {
    if (rascunho === null || !editavel) return true;
    const texto = rascunho.trim();
    if (!texto || texto === (anuncioParaExibir(veiculo) ?? "").trim()) {
      setRascunho(null);
      return true;
    }
    setSalvandoTexto(true);
    try {
      await editavel(veiculo.id, "formattedAd", texto);
      // Se o operador seguiu digitando durante a gravacao, o rascunho novo fica.
      setRascunho((atual) => (atual !== null && atual.trim() === texto ? null : atual));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar o anúncio");
      return false;
    } finally {
      setSalvandoTexto(false);
    }
  };

  /** Sair da caixa e clicar num botao disparam juntos: uma gravacao so. */
  const salvarTexto = () => {
    gravacaoRef.current ??= gravarRascunho().finally(() => { gravacaoRef.current = null; });
    return gravacaoRef.current;
  };

  // Aprovar e Publicar leem o texto do BANCO, entao o rascunho grava antes --
  // senao o operador corrige o anuncio e publica a versao velha.
  const depoisDeSalvar = async (acao: (id: string) => void) => {
    if (await salvarTexto()) acao(veiculo.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass rounded-2xl overflow-hidden hover:glow-gold-sm transition-all duration-300"
    >
      <div className="relative">
        {abaAtiva === "APPROVED" && (
          <button
            className="absolute top-2 left-2 z-10"
            onClick={(e) => { e.stopPropagation(); aoMarcar(veiculo.id); }}
          >
            {marcados.has(veiculo.id)
              ? <CheckSquare className="h-6 w-6 text-brand-gold drop-shadow" />
              : <Square className="h-6 w-6 text-white/70 drop-shadow" />
            }
          </button>
        )}
        {/* Com a foto editavel, a faixa de Pincel/Blur ocupa o topo -- e o selo
            diria "Pendente" numa aba que so tem pendentes. */}
        {!fotoEditavel && (
          <Badge className={cn("absolute top-3 right-3 z-10 border", sc.color)}>{sc.label}</Badge>
        )}
        <FotoDoCard
          vehicle={{ ...veiculo, photos: fotos }}
          isTop={fotoEditavel}
          titulo={temMarca ? `${veiculo.brand} ${titulo}` : titulo}
          aoAmpliar={aoAbrirGaleria ? () => aoAbrirGaleria(veiculo.id) : undefined}
          onSetMainPhoto={fotoEditavel ? aoDefinirPrincipal : undefined}
          onPhotoEdited={fotoEditavel ? aoEditarFotoPrincipal : undefined}
        />
      </div>

      <div className="flex flex-col gap-3 p-5">
        {/* Varios fornecedores postaram este mesmo carro. Os cards vem lado a
            lado, do mais barato pro mais caro -- o primeiro e a melhor
            oferta. */}
        {veiculo.repetido && (
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
              veiculo.repetido.posicao === 1
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-accent/40 text-muted-foreground"
            )}
            title={`${veiculo.repetido.total} fornecedores anunciaram este mesmo carro. Os cards estao lado a lado, do mais barato para o mais caro.`}
          >
            <Copy className="h-3.5 w-3.5 shrink-0" />
            {veiculo.repetido.posicao === 1
              ? `Mais barato dos ${veiculo.repetido.total}`
              : `${veiculo.repetido.posicao}º de ${veiculo.repetido.total} iguais`}
          </div>
        )}

        <DadosDoCard
          vehicle={veiculo}
          onUpdateField={editavel}
          edicaoDoTexto={editavel ? {
            rascunho,
            mudar: setRascunho,
            sair: () => void salvarTexto(),
            salvando: salvandoTexto,
          } : undefined}
        />

        {opcionais.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {opcionais.slice(0, 4).map((f, i) => (
              <span key={i} className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] text-muted-foreground">
                {f}
              </span>
            ))}
            {opcionais.length > 4 && (
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] text-muted-foreground">
                +{opcionais.length - 4}
              </span>
            )}
          </div>
        )}

        {veiculo.status === "REJECTED" && veiculo.rejectionReason && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/10 p-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive/80 leading-relaxed">{veiculo.rejectionReason}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {veiculo.status === "PENDING" && aoAprovar && (
            <>
              {/* Publicar e o que o operador mais faz na lista, entao leva o
                  botao grande; aprovar so guarda o carro pra depois. */}
              {aoPublicarDireto && (
                <Button
                  size="sm"
                  onClick={() => void depoisDeSalvar(aoPublicarDireto)}
                  disabled={ocupado || publicando}
                  className="flex-1 gap-1.5 border-0 bg-gradient-to-br from-success to-success/70 font-semibold text-white hover:shadow-[0_0_20px_rgba(52,211,153,0.4)]"
                  title="Publicar direto nos grupos"
                >
                  {publicando || salvandoTexto
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                  Publicar
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void depoisDeSalvar(aoAprovar)}
                disabled={ocupado || publicando}
                className="gap-1.5 border-border text-foreground hover:border-white/30"
                title="Aprovar"
              >
                {ocupado || salvandoTexto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => aoRejeitar(veiculo.id)}
                disabled={ocupado}
                title="Rejeitar"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {veiculo.status === "APPROVED" && (
            <>
              <Button
                size="sm"
                onClick={() => aoEditar(veiculo)}
                disabled={ocupado}
                className="flex-1 gap-1.5 gradient-gold text-black border-0"
                title="Abrir modal pra editar, preparar ou publicar"
              >
                {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => aoRejeitar(veiculo.id)}
                disabled={ocupado}
                title="Rejeitar"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {veiculo.status === "PUBLISHED" && (
            <Button
              size="sm"
              onClick={() => aoReenviar(veiculo)}
              disabled={ocupado}
              className="flex-1 gap-1.5 border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10"
              variant="outline"
            >
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Reenviar
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-border"
            onClick={() => aoPreVisualizar(veiculo)}
            title="Preview WhatsApp"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
