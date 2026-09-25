import { and, eq, like } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, gruposWhatsapp, vivos } from "@/lib/db";
import { gravarConfiguracao, lerConfiguracao } from "@/lib/settings";
import { uazapi, type PublicacaoDeCanal } from "@/lib/uazapi";
import { ENTREGA_INTERNA, POST as entregarNoWebhook } from "@/app/api/webhook/whatsapp/route";

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

/**
 * Ate onde o marcador pode andar.
 *
 * Publicacao que a esteira OLHOU e decidiu conta, mesmo que ela tenha
 * ignorado -- senao o giro seguinte paga IA de novo pelo mesmo anuncio.
 * Publicacao que a esteira RECUSOU (429, erro) nao conta: essa nem foi lida,
 * e passar o marcador por cima dela a perderia pra sempre.
 */
export function ateOndeMarcar(
  entregas: Array<{ publicacao: PublicacaoDeCanal; atendida: boolean }>
): PublicacaoDeCanal | null {
  let ultima: PublicacaoDeCanal | null = null;
  for (const entrega of entregas) {
    if (!entrega.atendida) break;
    ultima = entrega.publicacao;
  }
  return ultima;
}

/** Quanto tempo depois da foto o texto ainda pertence ao mesmo anuncio. */
const JANELA_DO_ANUNCIO_MS = 5 * 60 * 1000;
/** Teto de fotos por anuncio, igual ao do pareamento do webhook. */
const MAXIMO_DE_FOTOS = 12;

/** O que a leitura de um giro achou no canal. */
export interface LeituraDoCanal {
  anuncios: AnuncioDoCanal[];
  /** Fotos que ainda podem receber o texto -- o marcador NAO passa por elas. */
  aguardando: PublicacaoDeCanal[];
  /** Fotos velhas demais pra pertencer a um anuncio: nunca vao parear. */
  perdidas: PublicacaoDeCanal[];
}

/** Um anuncio montado a partir de uma ou mais publicacoes do canal. */
export interface AnuncioDoCanal {
  /** Publicacoes com foto, na ordem. A primeira vira a capa. */
  fotos: PublicacaoDeCanal[];
  /** O texto do anuncio. */
  texto: string;
  /** A ultima publicacao que compoe o anuncio -- e ate onde o marcador anda. */
  ultima: PublicacaoDeCanal;
}

/**
 * Junta as publicacoes que formam UM anuncio.
 *
 * O canal publica de tres jeitos, e o cliente confirmou os tres (25/09/2026):
 * foto com a legenda junto, foto num post e o texto no seguinte, ou varias
 * fotos e depois o texto. So o primeiro virava carro -- nos outros a foto era
 * descartada por "sem legenda" e o texto por "sem foto".
 *
 * Aqui da pra agrupar com certeza, e nao por janela de tempo como o webhook
 * faz: a busca le as 20 publicacoes de uma vez e em ordem, entao sabe o que
 * veio antes do que. O que segura foto de um anuncio pra ela nao colar no
 * texto do seguinte e a JANELA: passou dela, a foto orfa fica pra tras.
 *
 * Publicacao de foto sem texto nenhum depois nao vira anuncio -- entrar so a
 * foto daria um carro sem dado nenhum.
 */
export function agruparPublicacoes(
  publicacoes: PublicacaoDeCanal[],
  agora: Date = new Date()
): LeituraDoCanal {
  const anuncios: AnuncioDoCanal[] = [];
  const perdidas: PublicacaoDeCanal[] = [];
  let pendentes: PublicacaoDeCanal[] = [];

  const naJanela = (p: PublicacaoDeCanal) =>
    pendentes.length > 0 &&
    p.quando.getTime() - pendentes[pendentes.length - 1].quando.getTime() <= JANELA_DO_ANUNCIO_MS;

  for (const p of [...publicacoes].sort((a, b) => a.quando.getTime() - b.quando.getTime())) {
    const temFoto = !!p.imagemUrl;
    const temTexto = !!p.texto;

    // Foto orfa que ficou velha demais nao entra no proximo anuncio.
    if (pendentes.length > 0 && !naJanela(p)) {
      perdidas.push(...pendentes);
      pendentes = [];
    }

    if (temTexto) {
      const fotos = temFoto ? [...pendentes, p] : pendentes;
      anuncios.push({ fotos: fotos.slice(0, MAXIMO_DE_FOTOS), texto: p.texto as string, ultima: p });
      pendentes = [];
    } else if (temFoto) {
      pendentes.push(p);
    }
  }

  // O que sobrou no fim: foto ainda sem texto. Se ela ainda esta dentro da
  // janela, o texto pode chegar no proximo giro e o marcador tem que esperar
  // por ele. Passada a janela, ela nunca mais pareia -- e ai o marcador
  // PRECISA passar, senao o canal fica preso relendo as mesmas fotos pra
  // sempre e nenhum anuncio novo entra.
  const corte = agora.getTime() - JANELA_DO_ANUNCIO_MS;
  const aguardando = pendentes.filter((p) => p.quando.getTime() > corte);
  perdidas.push(...pendentes.filter((p) => p.quando.getTime() <= corte));

  return { anuncios, aguardando, perdidas };
}

export interface ResumoDoCanal {
  jid: string;
  nome: string;
  lidas: number;
  novas: number;
  capturadas: number;
  /** Quantos anuncios as publicacoes novas formaram. */
  anuncios?: number;
  /** Fotos que ficaram esperando o texto chegar no proximo giro. */
  aguardando?: number;
  /**
   * Por que cada publicacao NAO virou carro, contado por motivo.
   *
   * Sem isto o resumo dizia "novas: 1, capturadas: 0" e o motivo ficava so no
   * log do container -- entao diagnosticar canal exigia acesso ao servidor.
   * A esteira ja devolve o motivo em cada entrega; e so somar.
   */
  motivos?: Record<string, number>;
  /**
   * Comeco do texto dos anuncios que NAO viraram carro.
   *
   * O motivo sozinho nao basta: "no_vehicle_data" tanto pode ser um recado do
   * canal ("bom dia, chama no zap") quanto um anuncio de verdade que a
   * extracao errou. Com o texto na mao da pra saber qual dos dois sem abrir o
   * log do servidor.
   */
  amostras?: string[];
  erro?: string;
}

export interface ResumoDaBusca {
  canais: ResumoDoCanal[];
  novas: number;
  capturadas: number;
  erro?: string;
}

/**
 * Entrega UMA publicacao na esteira.
 *
 * `pareamento` e o remetente que a esteira usa pra juntar foto e texto que
 * vieram em posts separados. Ja tentaram usar o JID do canal ali, e o
 * resultado foi a legenda de um anuncio colando na foto sem legenda do
 * seguinte. Por isso aqui a chave e UNICA POR ANUNCIO (`<canal>#<id da
 * primeira foto>`): as pecas do mesmo anuncio se encontram e nenhuma outra
 * alcanca aquele balde.
 */
async function entregar(
  publicacao: PublicacaoDeCanal,
  canal: { groupId: string; name: string },
  segredo: string,
  opcoes: { texto?: string | null; comFoto?: boolean; pareamento?: string } = {}
) {
  const texto = opcoes.texto !== undefined ? opcoes.texto : publicacao.texto;
  const foto = opcoes.comFoto === false ? null : publicacao.imagemUrl;
  // Formato aninhado do webhook. A foto vai como URL: quem persiste e a
  // esteira, do mesmo jeito que faz com a foto que chega de grupo.
  const corpo = {
    event: "messages",
    data: {
      key: {
        remoteJid: canal.groupId,
        id: publicacao.messageId,
        fromMe: false,
        ...(opcoes.pareamento ? { participant: opcoes.pareamento } : {}),
      },
      pushName: canal.name,
      message: foto
        ? { imageMessage: { url: foto, caption: texto } }
        : { conversation: texto },
    },
  };

  const requisicao = new NextRequest("http://interno/api/webhook/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": segredo },
    body: JSON.stringify(corpo),
  });
  const resposta = await entregarNoWebhook(requisicao, ENTREGA_INTERNA);
  const corpoDaResposta = (await resposta.json().catch(() => ({}))) as {
    status?: string;
    reason?: string;
    amostra?: string;
  };
  // O `ok` separa "a esteira olhou e decidiu" de "a esteira nem viu": so o
  // primeiro caso pode andar o marcador.
  return { ...corpoDaResposta, ok: resposta.ok };
}

/**
 * Entrega um anuncio inteiro e devolve o que a esteira disse do FINAL dele.
 *
 * Foto com a legenda junto vai como uma mensagem so, do jeito que sempre foi.
 * Quando o texto veio num post separado, as fotos vao primeiro (a esteira as
 * guarda) e o texto por ultimo, que e o que fecha o anuncio.
 */
async function entregarAnuncio(
  anuncio: AnuncioDoCanal,
  canal: { groupId: string; name: string },
  segredo: string
) {
  const legendaJunto = anuncio.fotos.length === 1 && anuncio.fotos[0].messageId === anuncio.ultima.messageId;
  if (legendaJunto || anuncio.fotos.length === 0) {
    return entregar(anuncio.ultima, canal, segredo, { texto: anuncio.texto });
  }

  const pareamento = `${canal.groupId}#${anuncio.fotos[0].messageId}`;
  for (const foto of anuncio.fotos) {
    const r = await entregar(foto, canal, segredo, { texto: null, pareamento });
    // Esteira fora do ar no meio do anuncio: para aqui, o marcador nao anda e
    // o giro seguinte remonta o anuncio inteiro.
    if (!r.ok) return r;
  }
  return entregar(anuncio.ultima, canal, segredo, {
    texto: anuncio.texto,
    comFoto: false,
    pareamento,
  });
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

      // O marcador anda ate a ultima que a esteira ATENDEU. Publicacao
      // ignorada por ela conta (senao o proximo giro paga IA de novo pelo
      // mesmo anuncio); publicacao que ela recusou, nao -- essa volta no giro
      // seguinte em vez de se perder.
      const leitura = agruparPublicacoes(novas);
      linha.anuncios = leitura.anuncios.length;
      if (leitura.aguardando.length > 0) linha.aguardando = leitura.aguardando.length;

      const entregas: Array<{ publicacao: PublicacaoDeCanal; atendida: boolean }> = [];
      for (const anuncio of leitura.anuncios) {
        const r = await entregarAnuncio(anuncio, canal, segredo);
        entregas.push({ publicacao: anuncio.ultima, atendida: r.ok });
        if (!r.ok) {
          linha.erro = `esteira recusou a publicacao ${anuncio.ultima.messageId}`;
          console.warn(`[Canais] ${canal.name}: esteira recusou ${anuncio.ultima.messageId}, o marcador fica onde esta`);
          break;
        }
        if (r.status === "captured") {
          linha.capturadas++;
        } else {
          const motivo = r.reason || r.status || "sem_motivo";
          linha.motivos ??= {};
          linha.motivos[motivo] = (linha.motivos[motivo] ?? 0) + 1;
          const amostra = (r.amostra || anuncio.texto).replace(/\s+/g, " ").trim().slice(0, 120);
          if (amostra) {
            linha.amostras ??= [];
            if (linha.amostras.length < 3) linha.amostras.push(amostra);
          }
        }
      }

      // Foto que nunca vai parear conta pro marcador junto com o que foi
      // entregue: sem isso o canal trava nelas. O que esta AGUARDANDO fica de
      // fora de proposito -- o texto ainda pode chegar.
      const marcos = [ateOndeMarcar(entregas), ...leitura.perdidas].filter(
        (p): p is PublicacaoDeCanal => p != null
      );
      const ultima = marcos.sort((a, b) => a.quando.getTime() - b.quando.getTime()).at(-1);
      if (ultima) {
        await gravarConfiguracao(CHAVE_DO_MARCADOR(canal.groupId), ultima.quando.toISOString());
      }
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
