// Curingas do LIKE escapados: quem digita "%" na busca nao varre a tabela
// inteira. Nao e injecao (o driver parametriza), e abuso de padrao.
const CURINGAS = /([%_\\])/g;

export function comoTermoLike(q: string): string {
  return `%${q.replace(CURINGAS, "\\$1")}%`;
}
