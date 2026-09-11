import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Content-Security-Policy.
//
// DIVIDA ESCRITA, e nao esquecimento: `script-src` carrega `'unsafe-inline'`
// porque o Next injeta script inline na hidratacao, e tirar isso exige nonce
// por requisicao -- o que nao cabe com `output: "standalone"` e paginas
// estaticas. Enquanto essa parte for fraca, o que esta diretiva entrega de
// verdade sao as outras quatro:
//
//   frame-ancestors 'none'  fecha clickjacking (dobra o X-Frame-Options)
//   base-uri 'self'         impede injetar <base> e sequestrar todo caminho relativo
//   form-action 'self'      impede que um formulario injetado poste noutro lugar
//   object-src 'none'       fecha plugin legado
//
// `'unsafe-eval'` fica so em desenvolvimento, onde o recarregamento rapido
// precisa dele. Producao nao leva.
// ---------------------------------------------------------------------------
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // `data:` e `blob:` sao o editor de fotos, que desenha em canvas.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: CSP },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
