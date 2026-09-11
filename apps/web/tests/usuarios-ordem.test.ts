#!/usr/bin/env tsx
/**
 * Trava da ordem e do filtro da lista de usuarios.
 *
 * A regra menos obvia da tela: ativos vem sempre antes de inativos, e so
 * dentro de cada grupo vale a ordem alfabetica. O motivo e operacional --
 * quem esta ativo opera o sistema hoje, e quem esta inativo so continua na
 * base porque a trilha de auditoria aponta pra ele.
 *
 * Antes da quebra do usuarios/page.tsx isso morava num useMemo dentro do
 * componente e nao dava pra testar sem renderizar a tela.
 *
 * Uso: pnpm --filter web exec tsx tests/usuarios-ordem.test.ts
 */
import assert from "node:assert/strict";
import { ordenarEFiltrar, type User } from "../src/app/(dashboard)/usuarios/_componentes/tipos";

const criar = (name: string, email: string, active: boolean): User => ({
  id: name, name, email, role: "OPERATOR", active,
  createdAt: "2026-01-01T00:00:00.000Z", _count: { auditLogs: 0 },
});

const BASE: User[] = [
  criar("Zeca", "zeca@exemplo.test", true),
  criar("Ana", "ana@exemplo.test", false),
  criar("Bruno", "bruno@exemplo.test", true),
  criar("Ícaro", "icaro@exemplo.test", true),
  criar("Carlos", "carlos@exemplo.test", false),
];

const nomes = (us: User[]) => us.map((u) => u.name);

// ── Ativos primeiro, depois alfabetico ────────────────────────────────────
{
  const r = ordenarEFiltrar(BASE, "", "all");
  assert.deepEqual(
    nomes(r),
    ["Bruno", "Ícaro", "Zeca", "Ana", "Carlos"],
    "os tres ativos vem primeiro em ordem, depois os dois inativos em ordem",
  );

  const ativos = r.filter((u) => u.active).length;
  assert.ok(
    r.slice(0, ativos).every((u) => u.active),
    "nenhum inativo se infiltra no bloco dos ativos",
  );
}

// ── Acento nao joga o nome pro fim ────────────────────────────────────────
{
  const r = ordenarEFiltrar(
    [criar("Icaro", "i@x.test", true), criar("Ícaro", "i2@x.test", true), criar("Hugo", "h@x.test", true)],
    "", "all",
  );
  assert.deepEqual(
    nomes(r).slice(0, 2),
    ["Hugo", "Icaro"],
    "colacao pt-BR: 'Í' fica junto de 'I', nao no fim do alfabeto",
  );
}

// ── Filtro de status ──────────────────────────────────────────────────────
{
  assert.deepEqual(nomes(ordenarEFiltrar(BASE, "", "active")), ["Bruno", "Ícaro", "Zeca"]);
  assert.deepEqual(nomes(ordenarEFiltrar(BASE, "", "inactive")), ["Ana", "Carlos"]);
  assert.equal(ordenarEFiltrar(BASE, "", "all").length, 5, "'todos' nao descarta ninguem");
}

// ── Busca por nome e por email ────────────────────────────────────────────
{
  assert.deepEqual(nomes(ordenarEFiltrar(BASE, "bru", "all")), ["Bruno"], "acha por pedaco do nome");
  assert.deepEqual(nomes(ordenarEFiltrar(BASE, "carlos@", "all")), ["Carlos"], "acha por email");
  assert.deepEqual(nomes(ordenarEFiltrar(BASE, "ZEC", "all")), ["Zeca"], "busca ignora caixa");
  assert.deepEqual(nomes(ordenarEFiltrar(BASE, "  bruno  ", "all")), ["Bruno"], "espaco em volta nao atrapalha");
  assert.deepEqual(nomes(ordenarEFiltrar(BASE, "exemplo.test", "all")).length, 5, "termo comum casa com todos");
  assert.deepEqual(ordenarEFiltrar(BASE, "ninguem", "all"), [], "sem resultado devolve lista vazia");
}

// ── Busca e status se somam ───────────────────────────────────────────────
{
  assert.deepEqual(
    nomes(ordenarEFiltrar(BASE, "a", "inactive")),
    ["Ana", "Carlos"],
    "os dois filtros valem ao mesmo tempo",
  );
  assert.deepEqual(
    nomes(ordenarEFiltrar(BASE, "a", "active")),
    ["Ícaro", "Zeca"],
    "e o mesmo termo em 'ativos' traz outro conjunto",
  );
}

// ── Nao mexe na lista original ────────────────────────────────────────────
{
  const copia = [...BASE];
  ordenarEFiltrar(BASE, "", "all");
  assert.deepEqual(nomes(BASE), nomes(copia), "a ordenacao nao reordena o array de entrada");
}

console.log("OK — ordem e filtro da lista de usuarios travados.");
