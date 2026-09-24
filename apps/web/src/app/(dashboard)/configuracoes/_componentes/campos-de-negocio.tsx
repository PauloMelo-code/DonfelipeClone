"use client";

import { Ban, Crown, Filter, Gauge, MapPin, Percent, Wifi } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/ui/section-card";
import type { Configuracoes } from "../_ganchos/use-configuracoes";
import type { Settings } from "./tipos";

// ---------------------------------------------------------------------------
// Os parametros que definem o que o sistema aceita e por quanto revende.
//
// Sao numeros com consequencia direta na operacao: margem errada vira anuncio
// com preco errado, e filtro frouxo enche a fila de carro que ninguem quer.
// ---------------------------------------------------------------------------

const CAMPO = "bg-card border-border";
const AJUDA = "text-[11px] text-muted-foreground/60";

/** Um numero simples, com rotulo e ajuda opcional. */
function CampoNumero({
  cfg, chave, rotulo, ajuda, placeholder, className,
}: {
  cfg: Configuracoes;
  chave: keyof Settings;
  rotulo: string;
  ajuda?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{rotulo}</Label>
      <Input
        type="number"
        value={cfg.valores[chave]}
        onChange={(e) => cfg.alterar(chave, e.target.value)}
        placeholder={placeholder}
        className={CAMPO}
      />
      {ajuda && <p className={AJUDA}>{ajuda}</p>}
    </div>
  );
}

export function CamposDeNegocio({ cfg }: { cfg: Configuracoes }) {
  return (
    <>
      <SectionCard icon={<Percent />} title="Margem de Lucro" padding="lg">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoNumero cfg={cfg} chave="profit_margin_percent" rotulo="Margem padrão sobre o preço captado (%)" />
          <CampoNumero
            cfg={cfg}
            chave="min_fipe_discount"
            rotulo="Desconto mínimo da FIPE (%)"
            ajuda="Quanto o preço de compra precisa estar abaixo da tabela FIPE pra o carro valer a pena. Abaixo disso entra como &quot;sem margem&quot;. Padrão 10%."
          />
        </div>
      </SectionCard>

      <SectionCard icon={<MapPin />} title="Região Atendida" padding="lg">
        <div className="space-y-2">
          <Label>Estados atendidos (separados por vírgula)</Label>
          <Input
            value={cfg.valores.served_states}
            onChange={(e) => cfg.alterar("served_states", e.target.value)}
            placeholder="RS,SC,PR,SP"
            className={CAMPO}
          />
          <p className={AJUDA}>
            Carros de outros estados ou regiões são descartados, venham de qualquer grupo.
            Sem estado no anúncio, só os grupos &quot;Nacional&quot; descartam.
          </p>
        </div>
      </SectionCard>

      <SectionCard icon={<Wifi />} title="Anti-Ban (Delays)" padding="lg">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoNumero cfg={cfg} chave="delay_min_seconds" rotulo="Delay mínimo (segundos)" />
          <CampoNumero cfg={cfg} chave="delay_max_seconds" rotulo="Delay máximo (segundos)" />
        </div>
      </SectionCard>

      <SectionCard icon={<Filter />} title="Filtros Padrão" padding="lg">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoNumero cfg={cfg} chave="filter_min_year" rotulo="Ano mínimo" />
          <CampoNumero cfg={cfg} chave="filter_min_price" rotulo="Preço mínimo (R$)" />
          <CampoNumero
            cfg={cfg}
            chave="filter_max_km"
            rotulo="KM máxima"
            placeholder="300000"
            ajuda="Carros com km acima desse valor são descartados na captura. Padrão 300.000."
            className="sm:col-span-2"
          />
        </div>
      </SectionCard>

      <SectionCard icon={<Gauge />} title="Nota do carro (Score)" padding="lg">
        <p className={`${AJUDA} mb-4`}>
          A nota parte de 5 e sobe ou desce conforme o carro. Aqui se ajusta ONDE cada faixa começa;
          quanto cada uma vale em pontos continua fixo. Leilão ou sinistro de verdade tira 5 pontos.
          Passe o mouse no selo do Score, no card, para ver a conta de cada carro.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoNumero cfg={cfg} chave="score_km_muito_baixa" rotulo="Km muito baixa, até (+2 pontos)" />
          <CampoNumero cfg={cfg} chave="score_km_baixa" rotulo="Km baixa, até (+1 ponto)" />
          <CampoNumero cfg={cfg} chave="score_km_alta" rotulo="Km alta, acima de (-1 ponto)" />
          <CampoNumero cfg={cfg} chave="score_km_muito_alta" rotulo="Km muito alta, acima de (-2 pontos)" />
          <CampoNumero cfg={cfg} chave="score_idade_novo" rotulo="Carro novo, até quantos anos (+1 ponto)" />
          <CampoNumero cfg={cfg} chave="score_idade_antigo" rotulo="Carro antigo, a partir de quantos anos (-1 ponto)" />
          <CampoNumero cfg={cfg} chave="score_desconto_bom" rotulo="Bom desconto da FIPE, a partir de (%) (+2 pontos)" />
          <CampoNumero cfg={cfg} chave="score_desconto_excelente" rotulo="Desconto excelente da FIPE, a partir de (%) (+3 pontos)" />
        </div>
        <p className={`${AJUDA} mt-3`}>
          Mudou aqui? Os cards já mostram a nota nova na hora. A nota guardada no banco -- a que o
          Dashboard soma -- se atualiza quando o anúncio passa pelo &quot;Regerar&quot;.
        </p>
      </SectionCard>

      <SectionCard icon={<Ban />} title="Palavras-chave" padding="lg">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5 text-destructive" />
              Blocklist (rejeição automática)
            </Label>
            <Textarea
              value={cfg.valores.blocklist_keywords}
              onChange={(e) => cfg.alterar("blocklist_keywords", e.target.value)}
              placeholder="leilão, sinistro, batido, enchente, recuperado"
              className={`${CAMPO} min-h-[80px]`}
            />
            <p className="text-xs text-muted-foreground">
              Separe por vírgula. Veículos com essas palavras serão rejeitados automaticamente.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Crown className="h-3.5 w-3.5 text-warning" />
              VIP keywords (prioridade)
            </Label>
            <Textarea
              value={cfg.valores.vip_keywords}
              onChange={(e) => cfg.alterar("vip_keywords", e.target.value)}
              placeholder="Defender, Range Rover, M3, Porsche"
              className={`${CAMPO} min-h-[80px]`}
            />
            <p className="text-xs text-muted-foreground">
              Separe por vírgula. Veículos com essas palavras recebem prioridade.
            </p>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
