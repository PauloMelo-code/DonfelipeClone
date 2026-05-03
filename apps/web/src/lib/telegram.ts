/**
 * Send a message to a Telegram chat via Bot API.
 * Configured via env: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
 */
export async function sendTelegramAlert(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[telegram] Error:", err);
    return false;
  }
}

/**
 * Critical alerts that warrant immediate notification.
 */
export async function alertWhatsAppDisconnected(label: string) {
  await sendTelegramAlert(`🚨 <b>WhatsApp ${label} desconectado!</b>\n\nReconecte em: cugini.bahflash.tech/configuracoes`);
}

export async function alertVipCaptured(model: string, year: number, price: number) {
  await sendTelegramAlert(`⭐ <b>Carro VIP capturado:</b>\n${model} ${year}\nR$ ${price.toLocaleString("pt-BR")}\n\nRevise em: cugini.bahflash.tech/veiculos`);
}

export async function alertHighScore(model: string, year: number, score: number) {
  await sendTelegramAlert(`🔥 <b>Oportunidade alta detectada:</b>\nScore ${score}/10\n${model} ${year}\n\nRevise em: cugini.bahflash.tech/veiculos`);
}

export async function alertSystemError(error: string) {
  await sendTelegramAlert(`💥 <b>Erro no sistema:</b>\n${error}`);
}
