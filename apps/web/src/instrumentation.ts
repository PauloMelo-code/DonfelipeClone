/**
 * Ponto de partida do processo do servidor.
 *
 * O Next chama isto uma vez, antes de atender a primeira requisicao. E aqui
 * que o worker da fila de publicacao sobe.
 */
export async function register() {
  // So no runtime Node: o Edge nao tem socket para o Redis.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { iniciarWorker } = await import("@/lib/queue/publicacao");
  iniciarWorker();

  // Canal do WhatsApp nao chega pelo webhook: o sistema vai buscar.
  // CANAIS_INTERVALO_MINUTOS=0 desliga.
  const minutos = Number(process.env.CANAIS_INTERVALO_MINUTOS ?? 5);
  if (minutos > 0) {
    const { iniciarBuscaDeCanais } = await import("@/lib/canais/publicacoes");
    iniciarBuscaDeCanais(minutos);
  }
}
