"use client";

import { PageContainer } from "@/components/ui/page-container";
import { CartaoDoFator } from "./_componentes/cartao-do-fator";
import { CartaoDePasskeys } from "./_componentes/cartao-de-passkeys";
import { CartaoDeSenha } from "./_componentes/cartao-de-senha";
import { CartaoDeSessoes } from "./_componentes/cartao-de-sessoes";

// ---------------------------------------------------------------------------
// Meu perfil > Seguranca.
//
// Toda acao daqui mira a SESSAO CORRENTE. Nenhuma delas aceita `userId`: uma
// tela de seguranca que recebe o alvo pelo corpo do pedido e uma tela de
// administrador com outro nome, e a primeira coisa que um cookie roubado usa.
//
// O que esta tela deliberadamente NAO tem:
//   - botao de desligar o segundo fator;
//   - os codigos de resgate a cada carregamento (so a contagem);
//   - qualquer coisa que se pareca com o token da sessao.
//
// O identificador de sessao que a lista mostra NAO e o token: e o numero da
// linha no banco, e sem o cookie assinado ele nao abre nada. A tela precisa
// dele para dizer qual e a sua e para encerrar as outras.
// ---------------------------------------------------------------------------

export default function SegurancaPage() {
  return (
    <PageContainer className="mx-auto max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-foreground">
          Segurança
        </h1>
        <p className="text-[13px] text-muted-foreground/60">
          Como você prova que é você. Toda mudança aqui pede o fator atual.
        </p>
      </header>

      <CartaoDePasskeys />
      <CartaoDoFator />
      <CartaoDeSenha />
      <CartaoDeSessoes />
    </PageContainer>
  );
}
