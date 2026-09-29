import { normalizeModelKey } from "./deduplication";
import { MARCAS } from "./vehicle-formatter";

// ---------------------------------------------------------------------------
// Anuncios do MESMO carro, lado a lado na tela.
//
// Nao confundir com a deduplicacao de `deduplication.ts`. Aquela FUNDE: acha o
// mesmo carro, fica o mais barato e o outro e descartado. Esta aqui nao
// descarta nada -- ela so junta na tela os que sobraram, pro operador ver os
// quatro fornecedores do mesmo carro um do lado do outro e escolher.
//
// Por isso o criterio e de proposito MAIS LARGO que o da fusao: o que chega
// aqui e justamente o que escapou dela. O cliente escolheu os tres campos
// (26/09/2026): nome/modelo, quilometragem e valor da Fipe.
//
// A Fipe entra no lugar do ano -- ela ja carrega ano e versao, e dois
// fornecedores que escrevem o modelo de jeitos diferentes ("Compass
// Longitude" e "Jeep Compass Longitude T270") ainda batem pela Fipe.
// ---------------------------------------------------------------------------

/** Quanto a km pode variar e ainda ser o mesmo carro. */
const FAIXA_DE_KM = 10_000;
/** Quanto a Fipe pode variar -- tabelas de meses diferentes divergem um pouco. */
const FAIXA_DE_FIPE = 1_000;
/**
 * Quantas palavras do modelo entram na chave.
 *
 * Duas, e nao as quatro da fusao: e aqui que mora a largura. "Compass
 * Longitude" e "Compass Longitude T270" viram a mesma coisa, e quem separa
 * carro diferente sao a km e a Fipe.
 */
const PALAVRAS_DO_MODELO = 2;

export interface DadosDoRepetido {
  id: string;
  model: string;
  km: number;
  price: number;
  fipePrice?: number | null;
}

/**
 * O modelo sem a marca na frente.
 *
 * Um fornecedor escreve "Jeep Compass Longitude" e o outro "Compass
 * Longitude". Como a chave usa as duas primeiras palavras, a marca desloca a
 * janela e os dois viravam carros diferentes -- "jeep compass" contra
 * "compass longitude".
 */
function semAMarca(model: string): string {
  const cru = model.trim().toUpperCase();
  // MARCAS vem com as compostas primeiro ("LAND ROVER" antes de "RANGE"), entao
  // a primeira que casar e a mais especifica.
  for (const marca of MARCAS) {
    if (cru.startsWith(`${marca} `)) return model.trim().slice(marca.length).trim();
  }
  return model.trim();
}

/**
 * A chave que junta candidatos a mesmo carro: modelo e Fipe.
 *
 * A KM NAO ENTRA AQUI, de proposito. Arredondar km em faixas cria fronteira:
 * 44.000 e 46.000 -- o mesmo carro, por dois fornecedores -- cairiam em
 * faixas diferentes so porque cruzam os 45.000. Quem separa por km e o
 * agrupamento, comparando os anuncios ENTRE SI, onde 2.000 de diferenca e
 * perto e 75.000 e longe.
 *
 * `null` quando nao da pra afirmar -- sem Fipe nao ha como separar dois carros
 * do mesmo modelo, e agrupar no chute poe carro errado lado a lado.
 */
export function chaveDeRepetido(v: DadosDoRepetido): string | null {
  const modelo = normalizeModelKey(semAMarca(v.model))
    .split(" ")
    .slice(0, PALAVRAS_DO_MODELO)
    .join(" ");
  if (!modelo) return null;
  if (!v.fipePrice || v.fipePrice <= 0) return null;
  if (v.km == null || v.km <= 0) return null;

  return `${modelo}|${Math.round(v.fipePrice / FAIXA_DE_FIPE)}`;
}

/**
 * Quebra os candidatos em grupos por proximidade de km.
 *
 * Em ordem de km, um corte a cada salto maior que a faixa. Assim 44.000 e
 * 46.000 ficam juntos (2.000 de diferenca) e 45.000 e 120.000 se separam --
 * sem fronteira fixa pra atrapalhar.
 */
function separarPorKm<T extends DadosDoRepetido>(candidatos: T[]): T[][] {
  const porKm = [...candidatos].sort((a, b) => a.km - b.km);
  const grupos: T[][] = [];
  let atual: T[] = [];
  for (const v of porKm) {
    if (atual.length > 0 && v.km - atual[atual.length - 1].km > FAIXA_DE_KM) {
      grupos.push(atual);
      atual = [];
    }
    atual.push(v);
  }
  if (atual.length > 0) grupos.push(atual);
  return grupos;
}

/** Onde este anuncio esta dentro do grupo dele. */
export interface LugarNoGrupo {
  chave: string;
  /** Quantos anuncios do mesmo carro existem na fila. */
  total: number;
  /** 1 = o mais barato do grupo. */
  posicao: number;
}

/**
 * Ordena a fila deixando os repetidos JUNTOS.
 *
 * O grupo aparece na posicao do seu integrante mais recente -- assim a fila
 * continua sendo "o mais novo primeiro", que e como o operador esta
 * acostumado, e os repetidos sobem junto com o primeiro deles. Dentro do
 * grupo, do mais barato pro mais caro: e a ordem que o cliente pediu, porque
 * a primeira coluna passa a ser sempre a melhor oferta.
 *
 * Devolve a ordem e, para cada anuncio agrupado, o lugar dele no grupo. Quem
 * nao tem par nao ganha nada -- um grupo de um nao e repetido.
 */
export function ordenarComRepetidosJuntos<T extends DadosDoRepetido & { capturedAt: string | Date }>(
  veiculos: T[]
): { ordenados: T[]; grupos: Map<string, LugarNoGrupo> } {
  const porChave = new Map<string, T[]>();
  const soltos: T[] = [];

  for (const v of veiculos) {
    const chave = chaveDeRepetido(v);
    if (!chave) {
      soltos.push(v);
      continue;
    }
    const lista = porChave.get(chave);
    if (lista) lista.push(v);
    else porChave.set(chave, [v]);
  }

  const quando = (v: T) => new Date(v.capturedAt).getTime();

  /** Um bloco da fila: ou um grupo de repetidos, ou um anuncio sozinho. */
  const blocos: { itens: T[]; maisRecente: number; chave: string | null }[] = [];

  for (const [chave, candidatos] of porChave) {
    // Mesmo modelo e mesma Fipe ainda pode ser carro diferente: o que separa e
    // a km. Dai a quebra por proximidade antes de formar o grupo.
    const porKm = separarPorKm(candidatos);
    porKm.forEach((lista, i) => {
      if (lista.length === 1) {
        soltos.push(lista[0]);
        return;
      }
      lista.sort((a, b) => a.price - b.price || quando(b) - quando(a));
      blocos.push({
        itens: lista,
        maisRecente: Math.max(...lista.map(quando)),
        // O sufixo separa dois grupos do mesmo modelo/Fipe com km distante --
        // sem ele os dois teriam a mesma chave na tela.
        chave: porKm.length > 1 ? `${chave}#${i}` : chave,
      });
    });
  }

  for (const v of soltos) blocos.push({ itens: [v], maisRecente: quando(v), chave: null });

  blocos.sort((a, b) => b.maisRecente - a.maisRecente);

  const ordenados: T[] = [];
  const grupos = new Map<string, LugarNoGrupo>();
  for (const bloco of blocos) {
    bloco.itens.forEach((v, i) => {
      ordenados.push(v);
      if (bloco.chave) {
        grupos.set(v.id, { chave: bloco.chave, total: bloco.itens.length, posicao: i + 1 });
      }
    });
  }

  return { ordenados, grupos };
}
