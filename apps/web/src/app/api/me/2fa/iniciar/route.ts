import { NextResponse } from "next/server";
import { requireSessaoParaCadastrarFator } from "@/lib/auth";
import { iniciarCadastro } from "@/lib/segundo-fator";

// ---------------------------------------------------------------------------
// Comeca o cadastro do segundo fator: semente nova, ainda sem valer.
//
// O alvo e SEMPRE a sessao corrente. Esta rota nao aceita `userId` -- fosse
// assim, qualquer pessoa autenticada trocaria o autenticador de outra.
//
// A semente sai daqui uma vez, para a tela mostrar o QR. Ela nao volta em
// nenhuma leitura posterior: quem fechou a tela no meio chama de novo e
// recebe outra, e a anterior deixa de existir.
// ---------------------------------------------------------------------------

export async function POST() {
  const auth = await requireSessaoParaCadastrarFator();
  if (!auth.success) return auth.response;

  try {
    const cadastro = await iniciarCadastro(auth.user.id, auth.user.email);
    return NextResponse.json(cadastro);
  } catch (erro) {
    // O caso esperado e "o fator ja esta ativo": para trocar de autenticador
    // existe `/api/me/2fa/girar`, que exige provar o atual.
    const mensagem = erro instanceof Error ? erro.message : "Erro ao iniciar o cadastro";
    console.error("[Me/2fa] iniciar:", erro);
    return NextResponse.json({ error: mensagem }, { status: 400 });
  }
}
