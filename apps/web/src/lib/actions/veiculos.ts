import { lerConfiguracaoNumero } from "@/lib/settings";
import { cleanAdDescription } from "@/lib/ad-cleaner";
import { formatVehicleAd } from "@/lib/vehicle-formatter";
import type { Veiculo } from "@/lib/db";

// ---------------------------------------------------------------------------
// Regras de negocio do veiculo — uma implementacao, todos chamam esta.
//
// Antes, extrair a FIPE do texto do anuncio existia em QUATRO lugares (approve,
// publish-direct, publisher, backfill-fipe) em duas versoes diferentes, e a
// precificacao inteligente em dois. As copias ja tinham divergido: o
// publish-direct perdeu o termo "procedência" com acento que o approve
// reconhece, entao o mesmo carro era precificado diferente conforme o botao
// que o operador clicasse.
// ---------------------------------------------------------------------------

/** Emojis atrapalham o casamento do numero; saem antes da leitura. */
const SO_TEXTO = /[\u{1F000}-\u{1FFFF}]/gu;

const PADROES_FIPE = [
  /fipe\s*:?\s*r?\$?\s*([\d.,]+)\s*(mil|reais)?/i,
  /tabela\s+fipe\s*:?\s*r?\$?\s*([\d.,]+)\s*(mil|reais)?/i,
];

/** Valor abaixo disso e ruido, nao preco de tabela. */
const FIPE_MINIMA = 1000;

/**
 * Le o valor da FIPE do texto do anuncio.
 * Entende "FIPE: 58.000", "FIPE R$ 58.000,00" e "FIPE 58 mil".
 */
export function extrairFipeDoTexto(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const limpo = texto.replace(SO_TEXTO, "").trim();

  for (const padrao of PADROES_FIPE) {
    const m = limpo.match(padrao);
    if (!m) continue;

    const sufixo = m[2]?.toLowerCase();
    if (sufixo === "mil") {
      const n = parseFloat(m[1].replace(",", "."));
      if (!Number.isNaN(n)) return n * 1000;
      continue;
    }

    // "58.000,00" -> ponto e separador de milhar, virgula e decimal.
    const n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    if (!Number.isNaN(n) && n >= FIPE_MINIMA) return n;
  }
  return null;
}

/** Sinais de carro bem cuidado no texto do anuncio. */
const BONS_SINAIS =
  /\b(unico\s*dono|único\s*dono|procedencia|procedência|sem\s*detalhes|revisado|revisões|revisoes)\b/i;
/** Sinais que derrubam a confianca no carro. */
const ALERTAS = /\b(leil[aã]o|sinistro|batido|enchente|recuperado)\b/i;

/** Acima deste desconto sobre a FIPE, ja ha margem embutida no proprio preco. */
const DESCONTO_LIMITE = 0.12;
/** Abaixo desta km o carro conta como bem cuidado por si so. */
const KM_BAIXA = 60000;

export interface Precificacao {
  margem: number;
  margemEfetiva: number;
  sellingPrice: number;
}

/**
 * Precificacao inteligente: carro bom e perto da FIPE sai sem margem, porque a
 * margem de fato e escolhida pelo operador no modal. Nos demais casos aplica a
 * margem padrao das configuracoes.
 */
export async function precificar(v: {
  price: number;
  fipePrice: number | null;
  km: number;
  rawDescription: string | null;
  model?: string;
}): Promise<Precificacao> {
  const margem = await lerConfiguracaoNumero("profit_margin_percent", 10);
  let margemEfetiva = margem;

  if (v.fipePrice && v.rawDescription) {
    const desconto = 1 - v.price / v.fipePrice;
    const texto = v.rawDescription.toLowerCase();
    const bomCarro = v.km < KM_BAIXA || BONS_SINAIS.test(texto);
    const semAlerta = !ALERTAS.test(texto);

    if (desconto <= DESCONTO_LIMITE && bomCarro && semAlerta) {
      margemEfetiva = 0;
      console.log(
        `[precificar] ${v.model ?? "veiculo"}: bom carro a ${Math.round(desconto * 100)}% da FIPE, margem 0%`
      );
    }
  }

  return { margem, margemEfetiva, sellingPrice: v.price * (1 + margemEfetiva / 100) };
}

export interface Aprovacao extends Precificacao {
  fipePrice: number | null;
  formattedAd: string;
}

/**
 * Calcula tudo que a aprovacao precisa: FIPE, preco de venda e anuncio
 * formatado. NAO grava: quem chama decide a transacao e a trilha.
 *
 * `precoEditado` e `anuncioEditado` vem do modal quando o operador ajustou os
 * valores a mao.
 */
export async function prepararAprovacao(
  vehicle: Veiculo,
  opcoes?: { precoEditado?: number; anuncioEditado?: string }
): Promise<Aprovacao> {
  const fipePrice = vehicle.fipePrice ?? extrairFipeDoTexto(vehicle.rawDescription);

  const preco = await precificar({
    price: vehicle.price,
    fipePrice,
    km: vehicle.km,
    rawDescription: vehicle.rawDescription,
    model: vehicle.model,
  });

  let features: string[] = [];
  try {
    features = JSON.parse(vehicle.features || "[]");
  } catch {
    features = [];
  }

  // Limpa o texto do vendedor antes de formatar: tira cabecalho de loja,
  // contato e frase promocional que regex nao pega. Tem cache de 24 h.
  const limpo = vehicle.rawDescription ? await cleanAdDescription(vehicle.rawDescription) : null;

  const formattedAd =
    opcoes?.anuncioEditado ??
    formatVehicleAd(
      {
        model: vehicle.model,
        brand: vehicle.brand,
        year: vehicle.year,
        yearModel: vehicle.yearModel,
        km: vehicle.km,
        price: vehicle.price,
        fipePrice,
        transmission: vehicle.transmission,
        fuel: vehicle.fuel,
        features,
        rawDescription: limpo || vehicle.rawDescription,
      },
      { profitMarginPercent: preco.margemEfetiva }
    );

  return {
    ...preco,
    sellingPrice: opcoes?.precoEditado ?? preco.sellingPrice,
    fipePrice,
    formattedAd,
  };
}
