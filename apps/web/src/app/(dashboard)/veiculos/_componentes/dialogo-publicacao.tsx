"use client";

import {
  ArrowRight, Building2, ChevronDown, Clock, Eye, ImageIcon, Loader2, MapPin,
  Megaphone, MessageCircle, Pencil, Percent, Radio, Send, Sparkles, User, Users, X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PhotoEditor } from "@/components/vehicles/photo-editor";
import { cn } from "@/lib/utils";
import type { Grupos } from "../_ganchos/use-grupos";
import type { Publicacao } from "../_ganchos/use-publicacao";
import { BolhaEnviada, BolhaRecebida } from "./bolha-whatsapp";
import { SeletorDeGrupos } from "./seletor-de-grupos";
import { formatPrice, parseArray, type Vehicle } from "./tipos";
import { tipoDaOrigem, type OrigemBruta, type TipoDeOrigem } from "@/lib/tipo-de-origem";

// ---------------------------------------------------------------------------
// O modal onde o carro vira anuncio.
//
// Tres abas na ordem do trabalho: corta a foto, ajusta o texto, confere o
// resultado lado a lado com o que chegou do grupo de repasse. Embaixo, a
// margem e os grupos de destino.
//
// Dois botoes de saida com sentidos diferentes: "Salvar pronto" guarda tudo
// pra ir junto com os outros mais tarde, "Confirmar e publicar" manda agora.
// ---------------------------------------------------------------------------

const ABAS = [
  { key: "photo" as const, label: "Editar Foto", icon: ImageIcon },
  { key: "edit" as const, label: "Editar Texto", icon: Pencil },
  { key: "preview" as const, label: "Preview", icon: Eye },
];

/** Marca + modelo sem repetir a marca quando o modelo ja comeca com ela. */
function nomeDoVeiculo(v: Vehicle) {
  const marca = v.brand || "";
  const modelo = v.model || "";
  if (marca && modelo.toUpperCase().startsWith(marca.toUpperCase())) return modelo;
  return marca ? `${marca} ${modelo}` : modelo;
}

/** O icone conta de onde o carro veio, pela mesma regra da tela de Grupos. */
function IconeDaOrigem({ origem }: { origem: OrigemBruta }) {
  const Icon = ICONE_DA_ORIGEM[tipoDaOrigem(origem)];
  return <Icon className="h-3 w-3 shrink-0" />;
}

const ICONE_DA_ORIGEM: Record<TipoDeOrigem, LucideIcon> = {
  grupo: Users,
  comunidade: Building2,
  canal: Radio,
  lista: Megaphone,
  contato: User,
};

export function DialogoPublicacao({
  pub,
  grupos,
  carregandoAcao,
}: {
  pub: Publicacao;
  grupos: Grupos;
  carregandoAcao: string | null;
}) {
  const v = pub.veiculo;
  const fotos = v ? parseArray(v.photos) : [];
  const regiao = v ? (v.state || v.sourceGroup?.region) : null;
  const ocupado = carregandoAcao === v?.id;
  const semDestino = grupos.selecionados.length === 0;
  const secaoGruposAberta = grupos.regioesAbertas.has("__groups_section");

  return (
    <Dialog open={!!v} onOpenChange={(open) => { if (!open) pub.fechar(); }}>
      <DialogContent showCloseButton={false} className="inset-0 translate-x-0 translate-y-0 max-w-none rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-3xl sm:rounded-xl p-0 overflow-hidden bg-[#0D0D0D] ring-1 ring-white/10 h-full sm:h-auto">
        <div className="flex flex-col h-full sm:max-h-[90vh]">
          {/* Cabecalho */}
          <div className="px-5 py-3.5 border-b border-white/10 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-foreground">
                {pub.modoReenvio ? "Reenviar veículo" : "Publicar veículo"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {v && nomeDoVeiculo(v)}
                {v && ` · ${formatPrice(v.price)} (custo)`}
              </p>
              {v && (v.sourceGroup || v.state) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {v.sourceGroup && (
                    <span
                      className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/10 px-1.5 py-0.5 text-[11px] text-muted-foreground max-w-[260px]"
                      title={v.sourceGroup.name}
                    >
                      <IconeDaOrigem origem={v.sourceGroup} />
                      <span className="truncate">{v.sourceGroup.name}</span>
                    </span>
                  )}
                  {regiao && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-brand-gold/10 border border-brand-gold/30 px-1.5 py-0.5 text-[11px] font-semibold text-brand-gold uppercase tracking-wide">
                      <MapPin className="h-3 w-3" />
                      {regiao}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button onClick={pub.fechar} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Abas */}
          <div className="flex border-b border-white/10">
            {ABAS.map((aba) => (
              <button
                key={aba.key}
                onClick={() => pub.setAba(aba.key)}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                  pub.aba === aba.key
                    ? "text-brand-gold border-b-2 border-brand-gold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <aba.icon className="h-3.5 w-3.5" />
                {aba.label}
              </button>
            ))}
          </div>

          {/* Conteudo da aba */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {pub.aba === "photo" && v && (
              <>
                {/* Celular: miniatura + botao pra editar em tela cheia */}
                <div className="sm:hidden flex flex-col items-center gap-3 py-4 px-4">
                  {(pub.fotosEditadas[0] || fotos[0]) && (
                    <img src={pub.fotosEditadas[0] || fotos[0]} alt="" className="w-full max-h-48 object-contain rounded-xl" />
                  )}
                  <Button
                    variant="outline"
                    className="gap-2 border-brand-gold/30 text-brand-gold"
                    onClick={() => pub.setEditorTelaCheia(true)}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar foto em tela cheia
                  </Button>
                </div>
                {pub.editorTelaCheia && (
                  <div className="sm:hidden">
                    <PhotoEditor
                      photos={fotos}
                      editedPhotos={pub.fotosEditadas}
                      defaultFullscreen
                      onFullscreenChange={(fs) => { if (!fs) pub.setEditorTelaCheia(false); }}
                      onPhotoEdited={(index, dataUrl) => pub.editarFoto(index, dataUrl)}
                      onPhotoReset={(index) => pub.editarFoto(index)}
                    />
                  </div>
                )}
                {/* Desktop: editor embutido */}
                <div className="hidden sm:block">
                  <PhotoEditor
                    photos={fotos}
                    editedPhotos={pub.fotosEditadas}
                    onPhotoEdited={(index, dataUrl) => pub.editarFoto(index, dataUrl)}
                    onPhotoReset={(index) => pub.editarFoto(index)}
                  />
                </div>
              </>
            )}

            {pub.aba === "edit" && (
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    Edite o texto. Sua alteração é salva ao fechar o modal.
                  </p>
                  <button
                    type="button"
                    disabled={pub.regerando || !v}
                    onClick={pub.regerarComIa}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-gold/30 bg-brand-gold/[0.05] text-brand-gold hover:bg-brand-gold/10 px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
                    title="Limpa o texto com IA (remove header da loja, contatos, frases promocionais)"
                  >
                    {pub.regerando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {pub.regerando ? "Regerando..." : "Regerar com IA"}
                  </button>
                </div>
                <textarea
                  value={pub.texto}
                  onChange={(e) => pub.setTexto(e.target.value)}
                  className="w-full h-[50vh] sm:h-64 rounded-lg bg-card border border-border p-3 text-sm text-foreground font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold/50"
                  placeholder="Texto do anuncio..."
                />
              </div>
            )}

            {pub.aba === "preview" && v && (
              <div>
                {/* Como veio x como ficou */}
                <div className="flex items-center justify-center gap-1 py-2.5 border-b border-white/5">
                  <button
                    onClick={() => pub.setModoPreview("before")}
                    className={cn(
                      "px-3 py-1 rounded-l-lg text-xs font-medium transition-all border",
                      pub.modoPreview === "before"
                        ? "bg-red-500/10 border-red-500/30 text-red-400"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Como veio
                  </button>
                  <div className="flex items-center px-1.5">
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <button
                    onClick={() => pub.setModoPreview("after")}
                    className={cn(
                      "px-3 py-1 rounded-r-lg text-xs font-medium transition-all border",
                      pub.modoPreview === "after"
                        ? "bg-success/10 border-success/30 text-success"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Como ficou
                  </button>
                </div>

                {pub.modoPreview === "before" ? (
                  <div>
                    <div className="bg-[#1F2C34] px-4 py-2 flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-[#2A3942] flex items-center justify-center">
                        <Users className="h-3 w-3 text-[#8696A0]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-[#E9EDEF] truncate">
                          {v.sourceGroup?.name || "Grupo de Repasse"}
                        </p>
                        <p className="text-[9px] text-[#8696A0]">Mensagem original</p>
                      </div>
                      <Badge className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20">
                        Original
                      </Badge>
                    </div>
                    <BolhaRecebida
                      text={v.rawDescription || "Sem descrição original"}
                      photo={fotos[0]}
                      capturedAt={v.capturedAt}
                      alturaMinima
                    />
                  </div>
                ) : (
                  <div>
                    <div className="bg-[#1F2C34] px-4 py-2 flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-brand-gold/20 flex items-center justify-center">
                        <MessageCircle className="h-3 w-3 text-brand-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-[#E9EDEF] truncate">Don Felipe Repasses</p>
                        <p className="text-[9px] text-[#8696A0]">Mensagem reformatada</p>
                      </div>
                      <Badge className="text-[9px] bg-success/10 text-success border-success/20">
                        Reformatado
                      </Badge>
                    </div>
                    <BolhaEnviada
                      text={pub.texto}
                      photo={pub.fotosEditadas[0] || fotos[0]}
                      photoCount={fotos.length}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Margem e destino */}
          <div className="border-t border-white/10">
            <div className="px-5 py-3 flex items-center gap-3 border-b border-white/5">
              <Percent className="h-4 w-4 text-brand-gold flex-shrink-0" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">Margem:</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={pub.margem}
                  onChange={(e) => pub.mudarMargem(parseFloat(e.target.value) || 0)}
                  className="w-16 h-7 rounded bg-card border border-border px-2 text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-brand-gold/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <div className="flex-1" />
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Preço venda</p>
                <p className="text-sm font-bold text-brand-gold">
                  {v && formatPrice(v.price * (1 + pub.margem / 100))}
                </p>
              </div>
            </div>

            {/* Secao recolhivel em qualquer tamanho de tela, pra foto ficar visivel */}
            <div className="px-5 py-3 flex-1 overflow-y-auto min-h-0">
              <button
                onClick={pub.alternarSecaoGrupos}
                className="w-full flex items-center gap-2 mb-2 hover:bg-white/[0.02] rounded-lg -mx-1 px-1 py-1 transition-colors"
              >
                <Users className="h-4 w-4 text-brand-gold flex-shrink-0" />
                <span className="text-xs text-muted-foreground">Enviar para:</span>
                <span className="text-xs font-medium text-brand-gold">
                  {grupos.selecionados.length} grupo{grupos.selecionados.length !== 1 ? "s" : ""}
                </span>
                <div className="flex-1" />
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secaoGruposAberta && "rotate-180")} />
              </button>
              <div className={cn(secaoGruposAberta ? "block" : "hidden")}>
                {grupos.grupos.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 pl-6">Nenhum grupo destino configurado</p>
                ) : (
                  <div className="pl-6">
                    <SeletorDeGrupos
                      gruposPorRegiao={grupos.gruposPorRegiao}
                      selecionados={grupos.selecionados}
                      regioesAbertas={grupos.regioesAbertas}
                      aoAlternarRegiao={grupos.alternarRegiao}
                      aoAlternarGrupo={grupos.alternarGrupo}
                      aoAbrirRegiao={grupos.alternarAbertura}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Acoes */}
          <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 border-border shrink-0" onClick={pub.fechar}>
              Cancelar
            </Button>
            {!pub.modoReenvio && (
              <Button
                variant="outline"
                size="sm"
                onClick={pub.salvarComoPronto}
                disabled={ocupado || !pub.texto.trim() || semDestino}
                className="gap-1.5 border-info/30 text-info hover:bg-info/10 shrink-0"
                title="Salva texto, fotos e grupos pra publicar depois (em massa por estado)"
              >
                <Clock className="h-3.5 w-3.5" />
                Salvar pronto
              </Button>
            )}
            <Button
              size="sm"
              onClick={pub.publicar}
              disabled={ocupado || !pub.texto.trim() || semDestino}
              className="flex-1 gap-1.5 gradient-gold text-black border-0"
            >
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {pub.modoReenvio ? "Confirmar e reenviar" : "Confirmar e publicar"}
              {grupos.selecionados.length > 0 && (
                <span className="ml-1 text-[10px] opacity-80">
                  ({grupos.selecionados.length} grupo{grupos.selecionados.length !== 1 ? "s" : ""})
                </span>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
