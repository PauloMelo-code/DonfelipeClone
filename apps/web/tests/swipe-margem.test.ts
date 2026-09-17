#!/usr/bin/env tsx
/**
 * Trava da leitura de margem contra a tabela FIPE.
 *
 * E o numero que decide a compra na tela de triagem. Ja enganou o operador uma
 * vez: anuncio sem valor de oferta chegava com preco zerado e a tela mostrava
 * "-0% FIPE", que parece negocio ruim mas honesto -- quando nao havia preco
 * nenhum. As defesas contra isso estao cobertas abaixo.
 *
 * Antes da quebra do swipe-stack.tsx a conta morava dentro do componente e nao
 * dava pra testar sem renderizar a pilha inteira.
 *
 * Uso: pnpm --filter web exec tsx tests/swipe-margem.test.ts
 */
import assert from "node:assert/strict";
import {
  MARGEM_BOA,
  MARGEM_OTIMA,
  classificarMargem,
} from "../src/components/vehicles/swipe-stack/margem";
import { lerEstado, lerOrigem } from "../src/components/vehicles/swipe-stack/origem";
import { tipoDaOrigem } from "../src/lib/tipo-de-origem";
import type { SwipeVehicle } from "../src/components/vehicles/swipe-stack/tipos";

// ── Sem FIPE nao ha o que comparar ────────────────────────────────────────
{
  assert.equal(classificarMargem(50000, null), null, "sem FIPE, fica calado");
  assert.equal(classificarMargem(50000, undefined), null, "FIPE ausente idem");
  assert.equal(classificarMargem(50000, 0), null, "FIPE zerada nao serve de referencia");
  assert.equal(classificarMargem(50000, -1), null, "FIPE negativa idem");
}

// ── Os casos que ja enganaram o operador ──────────────────────────────────
{
  for (const precoRuim of [0, -1, NaN, Infinity]) {
    const m = classificarMargem(precoRuim, 60000);
    assert.equal(m?.nivel, "alerta", `preco ${precoRuim} vira aviso, nao conta`);
    assert.equal(m?.rotulo, "Sem oferta");
    assert.equal(m?.desconto, undefined, "aviso nao carrega desconto inventado");
  }

  const igual = classificarMargem(60000, 60000);
  assert.equal(igual?.nivel, "alerta", "preco identico a FIPE e suspeito");
  assert.equal(igual?.rotulo, "= FIPE (s/ oferta?)");
}

// ── As faixas de decisao ──────────────────────────────────────────────────
{
  const fipe = 100000;
  const comDesconto = (pct: number) => classificarMargem(fipe * (1 - pct / 100), fipe);

  assert.equal(comDesconto(30)?.nivel, "otima", "30% abaixo da FIPE e negocio otimo");
  assert.equal(comDesconto(MARGEM_OTIMA)?.nivel, "otima", "no limite de 15% ainda e otima");
  assert.equal(comDesconto(MARGEM_OTIMA - 1)?.nivel, "boa", "logo abaixo cai pra boa");
  assert.equal(comDesconto(MARGEM_BOA)?.nivel, "boa", "no limite de 8% ainda e boa");
  assert.equal(comDesconto(MARGEM_BOA - 1)?.nivel, "magra", "logo abaixo vira margem magra");
  assert.equal(comDesconto(1)?.nivel, "magra", "1% abaixo da FIPE e magra");

  const acimaDaFipe = classificarMargem(110000, fipe);
  assert.equal(acimaDaFipe?.nivel, "negativa", "pedir acima da FIPE e prejuizo");
  assert.equal(acimaDaFipe?.rotulo, "+10% FIPE", "e o rotulo mostra o sinal invertido");
}

// ── O rotulo que o operador le ────────────────────────────────────────────
{
  assert.equal(classificarMargem(48990, 57800)?.rotulo, "-15% FIPE", "caso real de anuncio bom");
  assert.equal(classificarMargem(48990, 57800)?.desconto, 15);
}

// ── De onde o carro veio ──────────────────────────────────────────────────
{
  const grupo = (extra: Partial<NonNullable<SwipeVehicle["sourceGroup"]>>) =>
    lerOrigem({ name: "Repasses Sul", groupId: "123@g.us", ...extra });

  assert.equal(grupo({}).rotulo, "Grupo");
  assert.equal(grupo({ isCommunity: true }).rotulo, "Comunidade");
  assert.equal(grupo({ groupId: "123@newsletter" }).rotulo, "Canal");
  assert.equal(grupo({ groupId: "123@broadcast" }).rotulo, "Lista de transmissão");
  assert.equal(grupo({ groupId: "5551999@s.whatsapp.net" }).rotulo, "Contato");
  assert.equal(grupo({ isContact: true }).rotulo, "Contato");
  // `@lid` e o endereco novo da conversa 1-1 -- e por onde chega a lista de
  // transmissao do fornecedor. Sem isso, a mensagem caia como "nao suportada".
  assert.equal(grupo({ groupId: "218812345678901@lid" }).rotulo, "Contato", "@lid e conversa");
  assert.equal(grupo({ kindOverride: "lista" }).rotulo, "Lista de transmissão", "a escolha manual vence");

  // O caso que confundiu o cliente: grupo restrito a admins e GRUPO. O card
  // dizia "Canal" e a aba Canais contava zero no mesmo dia.
  assert.equal(
    grupo({ isAnnounce: true }).rotulo,
    "Grupo",
    "grupo @g.us restrito a admins nao e canal",
  );
  assert.equal(
    tipoDaOrigem({ groupId: "123@g.us", isCommunity: false }),
    "grupo",
    "a tela de Grupos le a mesma regra",
  );

  // Lista de transmissao costuma chegar sem nome nenhum.
  assert.equal(
    lerOrigem({ name: "", groupId: "555199@broadcast", ownerPhone: "5551999998888" }).nome,
    "+5551999998888",
    "sem nome, o telefone do dono identifica",
  );
  assert.equal(
    lerOrigem({ name: "", groupId: "555199@broadcast", ownerPhone: null }).nome,
    "555199",
    "sem nome e sem telefone, sobra o JID sem o sufixo",
  );
}

// ── Estado do veiculo: extraido vence a tag do grupo ──────────────────────
{
  const base = { sourceGroup: { name: "g", groupId: "1@g.us", region: "SC" } } as SwipeVehicle;

  assert.deepEqual(
    lerEstado({ ...base, state: "RS" }),
    { uf: "RS", veioDoGrupo: false },
    "o que a IA extraiu do anuncio vale mais",
  );
  assert.deepEqual(
    lerEstado({ ...base, state: null }),
    { uf: "SC", veioDoGrupo: true },
    "sem extracao, cai pra regiao do grupo e avisa que e palpite",
  );
  assert.deepEqual(
    lerEstado({ state: null, sourceGroup: null } as SwipeVehicle),
    { uf: null, veioDoGrupo: false },
    "sem nenhum dos dois, nao mostra estado",
  );
}

console.log("OK — margem e origem da triagem travadas.");
