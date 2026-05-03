const REQUIRED_ENV_PRODUCTION = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "UAZAPI_BASE_URL",
  "UAZAPI_TOKEN",
  "OPENAI_API_KEY",
  "WEBHOOK_SECRET",
] as const;

export function validateEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  for (const key of REQUIRED_ENV_PRODUCTION) {
    if (!process.env[key]) missing.push(key);
  }

  // Reject obvious dev secrets in production
  const devSecretPatterns = ["change-in-production", "your-secret-here", "dev-secret"];
  const weakSecrets: string[] = [];
  for (const key of ["NEXTAUTH_SECRET", "WEBHOOK_SECRET"] as const) {
    const v = process.env[key];
    if (v && devSecretPatterns.some((p) => v.includes(p))) {
      weakSecrets.push(key);
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

// Run at module load (server-only)
if (typeof window === "undefined") {
  try {
    validateEnv();
  } catch (err) {
    console.error(err);
    // Don't crash dev — only crash prod
    if (process.env.NODE_ENV === "production") throw err;
  }
}
