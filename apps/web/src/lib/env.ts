const REQUIRED_ENV_PRODUCTION = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "UAZAPI_BASE_URL",
  "UAZAPI_TOKEN",
  "OPENAI_API_KEY",
  "WEBHOOK_SECRET",
  "HEALTH_MONITOR_SECRET",
  // Cifra a semente TOTP no banco. Ausente, ninguem liga nem confere o
  // segundo fator -- e falhar aqui e melhor que subir com o fator desligado.
  "TOTP_ENCRYPTION_KEY",
] as const;

/** Tamanho minimo de um segredo gerado por CSPRNG (openssl rand -hex 32 = 64 chars). */
const TAMANHO_MINIMO_SEGREDO = 32;

export function validateEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  for (const key of REQUIRED_ENV_PRODUCTION) {
    if (!process.env[key]) missing.push(key);
  }

  // Reject obvious dev secrets in production.
  // Placeholder OU curto demais: um segredo de 8 caracteres passava antes.
  const devSecretPatterns = [
    "change-in-production",
    "your-secret-here",
    "dev-secret",
    "gerar-com-openssl",
    "auditoria-local",
  ];
  const weakSecrets: string[] = [];
  for (const key of [
    "NEXTAUTH_SECRET",
    "WEBHOOK_SECRET",
    "HEALTH_MONITOR_SECRET",
    "TOTP_ENCRYPTION_KEY",
  ] as const) {
    const v = process.env[key];
    if (!v) continue;
    if (devSecretPatterns.some((p) => v.includes(p))) {
      weakSecrets.push(`${key} (valor de exemplo)`);
    } else if (v.length < TAMANHO_MINIMO_SEGREDO) {
      weakSecrets.push(`${key} (menos de ${TAMANHO_MINIMO_SEGREDO} caracteres)`);
    }
  }

  if (missing.length > 0 || weakSecrets.length > 0) {
    const msg = [
      missing.length > 0 ? `Missing required env vars: ${missing.join(", ")}` : null,
      weakSecrets.length > 0 ? `Weak/dev secrets detected: ${weakSecrets.join(", ")}` : null,
    ].filter(Boolean).join(" | ");
    throw new Error(`[ENV] ${msg}`);
  }
}

// Run at module load (server-only) — but skip during Next.js build
// Next.js build sets NEXT_PHASE to indicate it's collecting page data, env vars
// might not be wired yet at that point even though NODE_ENV=production.
const isNextBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-export";

if (typeof window === "undefined" && !isNextBuildPhase) {
  try {
    validateEnv();
  } catch (err) {
    console.error(err);
    // Don't crash dev — only crash prod runtime
    if (process.env.NODE_ENV === "production") throw err;
  }
}
