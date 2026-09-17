"use client";

import type { ReactNode } from "react";
import { BarChart3, Loader2, MapPin, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import type { Ferramentas as GanchoDeFerramentas } from "../_ganchos/use-ferramentas";

// ---------------------------------------------------------------------------
// Rotinas de manutencao disparadas na mao.
//
// Eram seis blocos de JSX iguais mudando so o texto, o icone e a cor. Viraram
// uma lista: acrescentar uma ferramenta agora e acrescentar uma linha.
// ---------------------------------------------------------------------------

interface Linha {
  titulo: string;
  descricao: ReactNode;
  ocupado: boolean;
  /** O que o botao diz enquanto roda. */
  rotuloOcupado: string;
  aoExecutar: () => void;
  icone: ReactNode;
  cor?: string;
}

const DESTRUTIVO = "border-destructive/30 text-destructive hover:bg-destructive/10";

export function Ferramentas({ ferramentas }: { ferramentas: GanchoDeFerramentas }) {
  const f = ferramentas;
  const girando = <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  const LINHAS: Linha[] = [
    {
      titulo: "Atualizar FIPE + Anúncios",
      descricao: "Extrai FIPE e regenera anúncios aprovados no formato Don Felipe",
      ocupado: f.atualizandoFipe,
      rotuloOcupado: "Atualizando...",
      aoExecutar: f.atualizarFipe,
      icone: <RefreshCw className="h-3.5 w-3.5" />,
    },
    {
      titulo: "Auto-tagger de Região",
      descricao: "Detecta RS/SC/PR/SP pelo nome do grupo",
      ocupado: f.taggeando,
      rotuloOcupado: "Tagueando...",
      aoExecutar: f.taggearRegioes,
      icone: <MapPin className="h-3.5 w-3.5" />,
    },
    {
      titulo: "Limpar veículos sem foto",
      descricao: "Remove veículos com foto quebrada, expirada ou ausente",
      ocupado: f.limpando,
      rotuloOcupado: "Limpando...",
      aoExecutar: () => f.limpar("no_photo"),
      icone: <Trash2 className="h-3.5 w-3.5" />,
      cor: DESTRUTIVO,
    },
    {
      titulo: "Limpar veículos sem margem",
      descricao: <>Remove pendentes onde preço &gt;= FIPE (margem negativa)</>,
      ocupado: f.limpando,
      rotuloOcupado: "Limpando...",
      aoExecutar: () => f.limpar("bad_margin"),
      icone: <Trash2 className="h-3.5 w-3.5" />,
      cor: DESTRUTIVO,
    },
    {
      titulo: "Corrigir valores inflados",
      descricao: <>Divide por 100 carros com preço/FIPE acima de R$ 2 mi (bug do &quot;78.200.00&quot;)</>,
      ocupado: f.corrigindoPrecos,
      rotuloOcupado: "Verificando...",
      aoExecutar: f.corrigirPrecos,
      icone: <RefreshCw className="h-3.5 w-3.5" />,
      cor: "border-warning/40 text-warning hover:bg-warning/10",
    },
    {
      titulo: "Corrigir modelos errados",
      descricao: (
        <>
          Detecta carros com modelo = chamada/loja (&quot;Menor valor Brasil&quot;,
          &quot;CAARPIX PORTO ALEGRE&quot;) e re-extrai do anúncio original
        </>
      ),
      ocupado: f.corrigindoNomes,
      rotuloOcupado: "Verificando...",
      aoExecutar: f.corrigirModelos,
      icone: <RefreshCw className="h-3.5 w-3.5" />,
      cor: "border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10",
    },
    {
      titulo: "Zerar sistema",
      descricao: "Apaga todos os carros e o histórico de publicações. Grupos, usuários e configurações ficam.",
      ocupado: f.zerando,
      rotuloOcupado: "Zerando...",
      aoExecutar: f.zerarSistema,
      icone: <Trash2 className="h-3.5 w-3.5" />,
      cor: DESTRUTIVO,
    },
  ];

  return (
    <SectionCard icon={<BarChart3 />} title="Ferramentas" padding="lg">
      <div className="space-y-4">
        {LINHAS.map((l) => (
          <div key={l.titulo} className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium">{l.titulo}</p>
              <p className="text-xs text-muted-foreground">{l.descricao}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={l.aoExecutar}
              disabled={l.ocupado}
              className={`gap-1.5 ${l.cor ?? "border-border"}`}
            >
              {l.ocupado ? girando : l.icone}
              {l.ocupado ? l.rotuloOcupado : "Executar"}
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
