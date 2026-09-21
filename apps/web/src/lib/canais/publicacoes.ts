import { and, eq, like } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, gruposWhatsapp, vivos } from "@/lib/db";
import { gravarConfiguracao, lerConfiguracao } from "@/lib/settings";
import { uazapi, type PublicacaoDeCanal } from "@/lib/uazapi";
import { POST as entregarNoWebhook } from "@/app/api/webhook/whatsapp/route";

// ---------------------------------------------------------------------------
// Busca das publicacoes dos canais.
//
// Canal do WhatsApp (`@newsletter`) NAO chega pelo webhook: a instancia so
// avisa mensagem de grupo e de conversa. Medido em 17/09/2026 -- quatro canais
// seguidos, publicando todo dia, e nenhum carro capturado.
//
// Entao o sistema vai buscar: de tempos em tempos pergunta o que ha de novo em
// cada canal ATIVO e entrega na mesma esteira de captura do webhook, que e
// quem sabe parear foto com legenda, extrair com IA, filtrar e deduplicar.
//
// A entrega e uma chamada em memoria ao proprio handler do webhook, com o
// segredo de maquina. Nao e elegante, mas e uma esteira so: duplicar aquelas
// regras aqui seria a forma segura de elas divergirem.
//
// Onde parou: a data da ultima publicacao lida fica nas configuracoes, uma
// chave por canal. Sem marcador, le so a janela inicial -- senao o primeiro
// giro capturaria meses de anuncio velho.
// ---------------------------------------------------------------------------

const CHAVE_DO_MARCADOR = (jid: string) => `canal_ultimo_post:${jid}`;
/** Teto por canal em cada giro: segura o custo de IA e o limite do webhook. */
const MAXIMO_POR_CANAL = 10;
/** Sem marcador, so o que foi publicado nas ultimas horas conta como novo. */
const JANELA_INICIAL_HORAS = 6;

/**
 * O que ainda nao foi lido, em ordem de publicacao.
 *
 * Sem marcador vale a janela inicial: o primeiro giro de um canal nao pode
 * capturar meses de anuncio velho. O teto por giro segura o custo de IA.
 */
export function novasPublicacoes(
  publicacoes: PublicacaoDeCanal[],
  marcador: string | null,
  agora = new Date()
): PublicacaoDeCanal[] {
  const corte = marcador
    ? new Date(marcador)
    : new Date(agora.getTime() - JANELA_INICIAL_HORAS * 60 * 60 * 1000);
  return publicacoes
    .filter((p) => p.quando > corte)
    .sort((a, b) => a.quando.getTime() - b.quando.getTime())
    .slice(-MAXIMO_POR_CANAL);
}

export interface ResumoDoCanal {
  jid: string;
  nome: string;
  lidas: number;
  novas: number;
  capturadas: number;
  erro?: string;
}

export interface ResumoDaBusca {
  canais: ResumoDoCanal[];
  novas: number;
  capturadas: number;
  erro?: string;
}

async function entregar(publicacao: PublicacaoDeCanal, canal: { groupId: string; name: string }, segredo: string) {
  // Formato aninhado do webhook. A foto vai como URL: quem persiste e a
  // esteira, do mesmo jeito que faz com a foto que chega de grupo.
  //
  // Sem `participant`: publicacao de canal chega inteira, foto e legenda
  // juntas. Com remetente, a esteira guardava a legenda de um post esperando
  // foto e colava na foto sem legenda do post seguinte -- carro de um com a
  // foto de outro.
  const corpo = {
    event: "messages",
    data: {
      key: {
        remoteJid: canal.groupId,
        id: publicacao.messageId,
        fromMe: false,
      },
      pushName: canal.name,
      message: publicacao.imagemUrl
        ? { imageMessage: { url: publicacao.imagemUrl, caption: publicacao.texto } }
        : { conversation: publicacao.texto },
    },
  };

  const requisicao = new NextRequest("http://interno/api/webhook/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": segredo },
    body: JSON.stringify(corpo),
  });
  const resposta = await entregarNoWebhook(requisicao);
  return (await resposta.json().catch(() => ({}))) as { status?: string };
}

/** Le os canais ativos e entrega o que for novo. */
export async function buscarPublicacoesDosCanais(): Promise<ResumoDaBusca> {
  const segredo = process.env.WEBHOOK_SECRET;
  if (!segredo) {
    return { canais: [], novas: 0, capturadas: 0, erro: "WEBHOOK_SECRET não configurado" };
  }

  const canais = await db
    .select({ groupId: gruposWhatsapp.groupId, name: gruposWhatsapp.name })
    .from(gruposWhatsapp)
    .where(
      and(
        vivos(gruposWhatsapp),
        eq(gruposWhatsapp.role, "SOURCE"),
        eq(gruposWhatsapp.active, true),
        like(gruposWhatsapp.groupId, "%@newsletter")
      )
    );

  const resumo: ResumoDaBusca = { canais: [], novas: 0, capturadas: 0 };

  for (const canal of canais) {
    const linha: ResumoDoCanal = { jid: canal.groupId, nome: canal.name, lidas: 0, novas: 0, capturadas: 0 };
    resumo.canais.push(linha);
    try {
      const publicacoes = await uazapi.newsletterMessages(canal.groupId, 20);
      linha.lidas = publicacoes.length;

      const marcador = await lerConfiguracao(CHAVE_DO_MARCADOR(canal.groupId));
      const novas = novasPublicacoes(publicacoes, marcador);
      linha.novas = novas.length;

      for (const publicacao of novas) {
        const r = await entregar(publicacao, canal, segredo);
        if (r.status === "captured") linha.capturadas++;
      }

      // Anda o marcador mesmo quando a publicacao foi ignorada: senao o
      // proximo giro paga IA de novo pelo mesmo anuncio.
      const ultima = novas.at(-1);
      if (ultima) await gravarConfiguracao(CHAVE_DO_MARCADOR(canal.groupId), ultima.quando.toISOString());
    } catch (e) {
      linha.erro = e instanceof Error ? e.message : String(e);
      console.error(`[Canais] ${canal.name} (${canal.groupId}):`, e);
    }
    resumo.novas += linha.novas;
    resumo.capturadas += linha.capturadas;
  }

  if (resumo.novas > 0) {
    console.log(`[Canais] ${resumo.novas} publicação(ões) nova(s), ${resumo.capturadas} capturada(s)`);
  }
  return resumo;
}

let relogio: ReturnType<typeof setInterval> | null = null;
let rodando = false;

/**
 * Liga a busca periodica. Um giro de cada vez: canal movimentado com IA lenta
 * nao pode acumular giros em cima do outro.
 */
export function iniciarBuscaDeCanais(minutos: number): void {
  if (relogio || minutos <= 0) return;

  const girar = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await buscarPublicacoesDosCanais();
    } catch (e) {
      console.error("[Canais] giro falhou:", e);
    } finally {
      rodando = false;
    }
  };

  // O primeiro giro espera um minuto: o servidor acabou de subir.
  setTimeout(girar, 60_000).unref?.();
  relogio = setInterval(girar, minutos * 60_000);
  relogio.unref?.();
  console.log(`[Canais] busca de publicações a cada ${minutos} min`);
}
