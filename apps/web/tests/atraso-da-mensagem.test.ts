#!/usr/bin/env tsx
/**
 * Hora do post no WhatsApp, para o log de atraso do webhook.
 *
 * Cliente, 03/10/2026: carro postado ontem de manha apareceu "capturado ha
 * menos de uma hora". O log de atraso precisa ler a hora nos dois formatos de
 * payload -- UAZAPI em milissegundos, padrao em segundos.
 *
 * Uso: pnpm --filter web exec tsx tests/atraso-da-mensagem.test.ts
 */
import assert from "node:assert/strict";
import { idadeDaMensagemMs } from "../src/lib/webhook/normalizar";

const agora = Date.UTC(2026, 9, 3, 12, 0, 0);
const ontem = agora - 26 * 60 * 60 * 1000;

// UAZAPI: milissegundos em `message.messageTimestamp`.
assert.equal(idadeDaMensagemMs({ message: { messageTimestamp: ontem } }, agora), 26 * 60 * 60 * 1000);

// Formato padrao: segundos em `data.messageTimestamp`, as vezes como texto.
assert.equal(idadeDaMensagemMs({ data: { messageTimestamp: ontem / 1000 } }, agora), 26 * 60 * 60 * 1000);
assert.equal(idadeDaMensagemMs({ data: { messageTimestamp: String(ontem / 1000) } }, agora), 26 * 60 * 60 * 1000);

// Sem hora no payload: nao inventa atraso.
assert.equal(idadeDaMensagemMs({}, agora), null);
assert.equal(idadeDaMensagemMs({ message: { messageTimestamp: 0 } }, agora), null);
assert.equal(idadeDaMensagemMs({ message: { messageTimestamp: "abc" } }, agora), null);

console.log("ok: atraso da mensagem");
