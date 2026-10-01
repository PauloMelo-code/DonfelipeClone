// ---------------------------------------------------------------------------
// Fila por conversa: as mensagens de um chat chegam ao pareamento na ORDEM em
// que chegaram ao servidor.
//
// Foto baixa e grava antes de parear (segundos); texto pareia na hora. Numa
// rajada de anuncios encaminhados -- foto do City, texto do City, texto do
// ASX, foto do ASX -- o texto do carro seguinte passava na frente da foto do
// anterior, os dois textos se juntavam e as fotos casavam com o carro errado,
// em cascata (cliente, 01/10/2026: "foto de Up e descrição de City").
//
// So segura ate o pareamento: a IA e a gravacao do carro seguem em paralelo.
//
// ponytail: em memoria, como o buffer do pareamento. Vale enquanto a aplicacao
// roda num processo so.
// ---------------------------------------------------------------------------

const filas = new Map<string, Promise<void>>();

/** Teto de espera pela mensagem anterior: um download travado nao para o grupo. */
const ESPERA_MAXIMA_MS = 30_000;

/** Espera a vez da conversa e devolve quem libera a proxima. Liberar duas vezes nao faz nada. */
export async function entrarNaFila(chave: string): Promise<() => void> {
  const anterior = filas.get(chave) ?? Promise.resolve();
  let liberar!: () => void;
  const minha = new Promise<void>((r) => (liberar = r));
  const cauda = anterior.then(() => minha);
  filas.set(chave, cauda);

  let teto: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([anterior, new Promise<void>((r) => (teto = setTimeout(r, ESPERA_MAXIMA_MS)))]);
  clearTimeout(teto);

  let livre = false;
  return () => {
    if (livre) return;
    livre = true;
    liberar();
    if (filas.get(chave) === cauda) filas.delete(chave);
  };
}
