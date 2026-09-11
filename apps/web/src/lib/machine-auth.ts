import { createHash, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Autenticacao de maquina (webhook, cron, health check)
//
// Um controle, uma implementacao: toda rota de maquina chama daqui. Segunda
// copia de comparacao de segredo = a proxima correcao so chega em uma.
//
// Regras:
//  1. Comparacao em TEMPO CONSTANTE. `===` sobre string vaza o tamanho do
//     prefixo que bateu e permite descobrir o segredo byte a byte.
//  2. Segredo viaja em CABECALHO. Query string fica no log do proxy, no log da
//     CDN e no historico de todo intermediario. O fallback por `?secret=` so
//     existe atras de MACHINE_SECRET_ALLOW_QUERY, que e interruptor de
//     MIGRACAO e nasce desligado.
//  3. Segredo ausente na configuracao = ninguem entra (fail-closed), em
//     qualquer ambiente. "Opcional em dev" e como a rota fica aberta em prod.
// ---------------------------------------------------------------------------

export type MachineAuthResult =
  | { ok: true; viaQueryString: boolean }
  | {
      ok: false;
      motivo: "sem_segredo_configurado" | "sem_credencial" | "credencial_invalida";
    };

export interface MachineAuthOptions {
  /** Cabecalho onde o segredo deve chegar. Ex: "x-webhook-secret" */
  headerName: string;
  /** Nome da variavel de ambiente que guarda o segredo esperado */
  envVar: string;
  /** Parametro de query aceito apenas durante a migracao. Omitir = nunca aceita */
  queryParam?: string;
}

/**
 * Compara dois segredos em tempo constante, sem vazar o tamanho.
 * O SHA-256 iguala o comprimento antes do timingSafeEqual, que exige buffers
 * do mesmo tamanho e lancaria com segredos de tamanhos diferentes.
 */
function segredosIguais(recebido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recebido, "utf8").digest();
  const b = createHash("sha256").update(esperado, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Confere a credencial de maquina de uma requisicao.
 * Nao devolve resposta HTTP: quem chama decide o status, para manter a recusa
 * uniforme com o resto da rota.
 */
export function checkMachineSecret(
  request: Request,
  options: MachineAuthOptions
): MachineAuthResult {
  const esperado = process.env[options.envVar];

  if (!esperado) {
    console.error(
      `[machine-auth] ${options.envVar} nao esta definida. Recusando todas as requisicoes desta rota.`
    );
    return { ok: false, motivo: "sem_segredo_configurado" };
  }

  const doCabecalho = request.headers.get(options.headerName);
  if (doCabecalho) {
    return segredosIguais(doCabecalho, esperado)
      ? { ok: true, viaQueryString: false }
      : { ok: false, motivo: "credencial_invalida" };
  }

  // Fallback de migracao. Desligado por padrao.
  const permiteQuery = process.env.MACHINE_SECRET_ALLOW_QUERY === "1";
  if (options.queryParam && permiteQuery) {
    const daQuery = new URL(request.url).searchParams.get(options.queryParam);
    if (daQuery) {
      console.warn(
        `[machine-auth] Segredo recebido por QUERY STRING em ${options.headerName}. ` +
          `Isso grava o segredo no log do proxy. Migre o painel para enviar o cabecalho ` +
          `e desligue MACHINE_SECRET_ALLOW_QUERY.`
      );
      return segredosIguais(daQuery, esperado)
        ? { ok: true, viaQueryString: true }
        : { ok: false, motivo: "credencial_invalida" };
    }
  }

  return { ok: false, motivo: "sem_credencial" };
}
