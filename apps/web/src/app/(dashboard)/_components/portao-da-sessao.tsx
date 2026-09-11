"use client";

import { useEffect } from "react";

/**
 * Manda para onde a conta precisa ir: cadastrar o fator, ou entrar de novo.
 *
 * Isto e ROTEAMENTO, nao controle. Quem barra de verdade e `conferirSessao`,
 * no servidor, em toda rota e toda action -- uma tela nunca e a barreira,
 * porque `curl` nao renderiza tela nenhuma. O que este componente evita e a
 * conta cair num painel onde cada painel devolve 401 ou 403 sem explicar por
 * que.
 *
 * O 401 aqui e o caso novo: com a sessao no banco, ela pode ter sido encerrada
 * -- pelo dono noutro aparelho, pela troca do fator, pelo teto de 24 horas ou
 * por uma hora de silencio. O cookie continua no navegador e parece valido; so
 * o servidor sabe que nao vale mais.
 *
 * ponytail: a checagem roda ao montar o painel. Uma aba ja aberta e parada so
 * percebe na proxima navegacao ou chamada de API. Fechar isso de verdade pede
 * um tratador global de 401 no cliente — quando incomodar, nao antes.
 */
export function PortaoDaSessao() {
  useEffect(() => {
    fetch("/api/me/2fa")
      .then(async (r) => {
        if (r.status === 401) return { destino: "/login" };
        if (!r.ok) return null;
        const estado = await r.json();
        return estado?.ativo === false ? { destino: "/2fa" } : null;
      })
      .then((ida) => {
        // Navegacao DURA: um `push` manteria o painel montado com as
        // buscas dele em voo, todas destinadas a falhar.
        if (ida) window.location.href = ida.destino;
      })
      .catch(() => {
        // Rede caida nao redireciona ninguem: o servidor continua barrando.
      });
  }, []);

  return null;
}
