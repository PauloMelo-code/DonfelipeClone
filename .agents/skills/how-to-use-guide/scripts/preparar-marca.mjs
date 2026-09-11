// Prepara .tmp_guia/marca/ para o montar-guia.mjs.
//
// O modelo da BahTech resolvia a marca pela tag do plano (brandIdentity.ts).
// Este projeto tem UMA marca, entao os ativos ja vivem em assets/marca/ e este
// script so os copia para o lugar que o montador procura.
//
//   node .claude/skills/how-to-use-guide/scripts/preparar-marca.mjs
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ORIGEM = join(AQUI, '../assets/marca')
const DESTINO = '.tmp_guia/marca'

// LIMPA antes de copiar. cpSync sobrepoe, mas NAO remove o que sobrou de uma
// preparacao anterior -- e o montador prefere logo-negativo.svg a .png. Um SVG
// velho esquecido aqui faz o guia sair com a marca ERRADA, sem erro nenhum.
rmSync(DESTINO, { recursive: true, force: true })
mkdirSync(DESTINO, { recursive: true })
cpSync(ORIGEM, DESTINO, { recursive: true })
console.log(`marca copiada: ${ORIGEM} -> ${DESTINO}`)
console.log('Falta o logo? Ver assets/marca/LEIA-ME.md.')
