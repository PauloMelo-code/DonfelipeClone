import { and, eq, like } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, gruposWhatsapp, vivos } from "@/lib/db";
import { gravarConfiguracao, lerConfiguracao } from "@/lib/settings";
import { uazapi, type PublicacaoDeCanal } from "@/lib/uazapi";
import { fotoDaPublicacao, type FotoResolvida } from "./foto-do-canal";
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
  const ordenadas = [...publicacoes].sort((a, b) => a.quando.getTime() - b.quando.getTime());

  // O texto e a ancora do anuncio: cada um vira um carro.
  const ancoras = ordenadas.filter((p) => p.texto);
  const perdidas: PublicacaoDeCanal[] = [];
  const orfas: PublicacaoDeCanal[] = [];
  const fotosDe = new Map<string, PublicacaoDeCanal[]>();
  for (const a of ancoras) fotosDe.set(a.messageId, a.imagemUrl ? [a] : []);

  for (const p of ordenadas) {
    if (p.texto) continue;
    if (!p.imagemUrl) {
      // Nem foto nem texto: formato que nao sabemos ler. Nao vira anuncio,
      // mas TEM que sair da frente -- senao o marcador nunca passa por ela e
      // o canal fica preso relendo a mesma publicacao pra sempre.
      perdidas.push(p);
      continue;
    }

    // A foto pertence ao texto MAIS PROXIMO no tempo, dos dois lados.
    //
    // Os canais publicam nas duas ordens: o TOME manda o anuncio e as fotos
    // logo depois; outros mandam as fotos e o texto em seguida. Olhar so pra
    // tras deixava o anuncio do TOME sem foto nenhuma e as fotos viravam
    // orfas (25/09/2026). A proximidade resolve os dois: dentro de um
    // anuncio as pecas estao a segundos uma da outra, e o anuncio vizinho
    // esta a minutos.
    let escolhida: PublicacaoDeCanal | null = null;
    let menor = Infinity;
    for (const a of ancoras) {
      const dist = Math.abs(p.quando.getTime() - a.quando.getTime());
      if (dist <= JANELA_DO_ANUNCIO_MS && dist < menor) {
        menor = dist;
        escolhida = a;
      }
    }
    if (!escolhida) {
      orfas.push(p);
      continue;
    }
    const lista = fotosDe.get(escolhida.messageId)!;
    if (lista.length < MAXIMO_DE_FOTOS) lista.push(p);
  }

  const anuncios: AnuncioDoCanal[] = ancoras.map((a) => {
    const fotos = (fotosDe.get(a.messageId) ?? []).sort(
      (x, y) => x.quando.getTime() - y.quando.getTime()
    );
    // O marcador anda ate a ultima peca do anuncio, que pode ser uma foto
    // publicada depois do texto.
    // `>=`: publicacoes do mesmo segundo sao comuns num album, e o marcador
    // tem que cobrir a ULTIMA delas.
    const ultima = [a, ...fotos].reduce((m, p) => (p.quando >= m.quando ? p : m), a);
    return { fotos, texto: a.texto as string, ultima };
  });

  // Foto que sobrou sem texto. Dentro da janela ainda pode receber o texto no
  // proximo giro, e o marcador espera por ela. Passada a janela, nunca mais
  // pareia e sai da frente.
  const corte = agora.getTime() - JANELA_DO_ANUNCIO_MS;
  const aguardando = orfas.filter((p) => p.quando.getTime() > corte);
  perdidas.push(...orfas.filter((p) => p.quando.getTime() <= corte));

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
  // A foto vai como data URI, ja decifrada. Mandar o endereco do CDN nao
  // adianta: o arquivo de la e cifrado e a esteira so guardaria lixo.
  const foto =
    opcoes.comFoto === false ? null : (await fotoDaPublicacao(publicacao.midia))?.dataUri ?? null;
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

// ---------------------------------------------------------------------------
// Simulacao: o que a busca VE e o que ela decidiria.
//
// Nasceu de um caso real (25/09/2026): dois canais voltavam com
// "novas: 3, capturadas: 0" e nenhum motivo, giro apos giro. Sem enxergar as
// publicacoes nao dava pra saber se era foto esperando texto (comportamento
// certo) ou defeito do agrupamento -- e adivinhar em cima de producao nao e
// diagnostico.
//
// Nao entrega nada e nao move o marcador.
// ---------------------------------------------------------------------------

export interface PublicacaoVista {
  id: string;
  quando: string;
  temFoto: boolean;
  temTexto: boolean;
  /** Os campos que a publicacao trazia -- diz o que e quando vem vazia. */
  tipo?: string | null;
  /** O comeco do texto -- o bastante pra reconhecer, sem despejar o anuncio. */
  inicio: string | null;
}

/** O teste de download da foto mais recente do canal. */
export interface TesteDeFoto {
  publicacao: string;
  /** Os campos que a UAZAPI mandou na imagem. */
  campos: string[];
  /** Conseguimos uma foto? */
  temFoto: boolean;
  /** "decifrada" = o arquivo cheio; "miniatura" = so o que vem no payload. */
  origem?: FotoResolvida["origem"];
  bytes?: number;
  erro?: string;
}

export interface SimulacaoDoCanal {
  jid: string;
  nome: string;
  marcador: string | null;
  lidas: number;
  publicacoes: PublicacaoVista[];
  anuncios: Array<{ fotos: number; texto: string }>;
  aguardando: number;
  perdidas: number;
  /** A prova de que a foto do canal baixa (ou nao). */
  foto?: TesteDeFoto;
  erro?: string;
}

const verPublicacao = (p: PublicacaoDeCanal): PublicacaoVista => ({
  id: p.messageId,
  quando: p.quando.toISOString(),
  temFoto: !!p.imagemUrl,
  temTexto: !!p.texto,
  inicio: p.texto ? p.texto.replace(/\s+/g, " ").trim().slice(0, 80) : null,
  tipo: p.tipo ?? null,
});

export async function simularBuscaDosCanais(): Promise<SimulacaoDoCanal[]> {
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

  const saida: SimulacaoDoCanal[] = [];
  for (const canal of canais) {
    const linha: SimulacaoDoCanal = {
      jid: canal.groupId, nome: canal.name, marcador: null,
      lidas: 0, publicacoes: [], anuncios: [], aguardando: 0, perdidas: 0,
    };
    saida.push(linha);
    try {
      const publicacoes = await uazapi.newsletterMessages(canal.groupId, 20);
      linha.lidas = publicacoes.length;
      linha.marcador = await lerConfiguracao(CHAVE_DO_MARCADOR(canal.groupId));
      // TODAS as lidas, e nao so as novas: e olhando o que ficou ANTES do
      // marcador que se ve se o texto do anuncio ja passou.
      linha.publicacoes = [...publicacoes]
        .sort((a, b) => a.quando.getTime() - b.quando.getTime())
        .map(verPublicacao);

      const novas = novasPublicacoes(publicacoes, linha.marcador);
      const leitura = agruparPublicacoes(novas);
      linha.anuncios = leitura.anuncios.map((a) => ({
        fotos: a.fotos.length,
        texto: a.texto.replace(/\s+/g, " ").trim().slice(0, 80),
      }));
      linha.aguardando = leitura.aguardando.length;
      linha.perdidas = leitura.perdidas.length;

      // A foto de verdade: baixa do CDN e decifra com a chave da publicacao,
      // ou cai na miniatura do payload. E o mesmo caminho da entrega, entao o
      // que aparecer aqui e o que o card vai mostrar.
      const comFoto = [...publicacoes]
        .filter((x) => x.imagemUrl)
        .sort((a, b) => b.quando.getTime() - a.quando.getTime())[0];
      if (comFoto) {
        const teste: TesteDeFoto = {
          publicacao: comFoto.messageId,
          campos: comFoto.midia?.campos ?? [],
          temFoto: false,
        };
        linha.foto = teste;
        try {
          const resolvida = await fotoDaPublicacao(comFoto.midia);
          if (resolvida) {
            teste.temFoto = true;
            teste.origem = resolvida.origem;
            teste.bytes = Math.round(((resolvida.dataUri.split(",")[1] ?? "").length * 3) / 4);
          } else {
            teste.erro = "nem o arquivo cifrado nem a miniatura deram imagem";
          }
        } catch (e) {
          teste.erro = e instanceof Error ? e.message : String(e);
        }
      }
    } catch (e) {
      linha.erro = e instanceof Error ? e.message : String(e);
    }
  }
  return saida;
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
