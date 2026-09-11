// ---------------------------------------------------------------------------
// As travas que impedem este seed de causar estrago.
//
// Ele APAGA usuarios, veiculos e a trilha de auditoria antes de popular. Ja
// rodava sozinho no entrypoint do container sempre que o banco estava vazio, e
// criava um admin com senha fixa que estava escrita no CLAUDE.md e no README
// versionados. As duas coisas foram desfeitas; o que sobrou esta aqui.
// ---------------------------------------------------------------------------

/** Tamanho minimo da senha do primeiro administrador. */
const TAMANHO_MINIMO_DA_SENHA = 15;

/**
 * A senha do primeiro administrador, sempre vinda do ambiente.
 *
 * E lida ANTES de qualquer apagamento: se faltar, o seed para com a base
 * intacta em vez de deixar o banco vazio e sem ninguem pra entrar.
 */
export function senhaDoAdmin(): string {
  const senha = process.env.SEED_ADMIN_PASSWORD;
  if (!senha || senha.length < TAMANHO_MINIMO_DA_SENHA) {
    throw new Error(
      `SEED_ADMIN_PASSWORD ausente ou com menos de ${TAMANHO_MINIMO_DA_SENHA} caracteres. ` +
        "Gere uma senha forte e exporte a variavel antes de rodar o seed."
    );
  }
  return senha;
}

/** Recusa rodar em producao sem uma autorizacao explicita e separada. */
export function conferirAmbiente(): void {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "1") {
    throw new Error(
      "Recusando rodar o seed com NODE_ENV=production: ele apaga users, audit_logs e vehicles. " +
        "Se e realmente o que voce quer, exporte SEED_ALLOW_PRODUCTION=1."
    );
  }
}
