// ---------------------------------------------------------------------------
// Request Meta — extrai IP, User-Agent e parsing simples pra audit logs
// ---------------------------------------------------------------------------

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Extrai metadata do request (IP, User-Agent) pra registrar em audit logs.
 * Funciona com Next.js Request e NextRequest.
 */
export function extractRequestMeta(request: Request): RequestMeta {
  const headers = request.headers;
  const ipAddress =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    null;
  const userAgent = headers.get("user-agent") || null;
  return { ipAddress, userAgent };
}

/**
 * Resumo legivel do User-Agent. Pra exibicao na UI da auditoria.
 * Ex: "Chrome 120 · Windows 10"
 */
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Desconhecido";

  // Browser
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Opera|OPR\//i.test(ua)) browser = "Opera";

  // Versao do browser
  const verMatch = ua.match(
    /(?:Edg|Chrome|Firefox|Safari|OPR)\/(\d+)/i
  );
  const browserVer = verMatch?.[1];

  // OS
  let os = "Desconhecido";
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android (\d+(?:\.\d+)?)/);
    os = m ? `Android ${m[1]}` : "Android";
  } else if (/iPhone|iPad|iOS/i.test(ua)) {
    const m = ua.match(/OS (\d+_\d+)/);
    os = m ? `iOS ${m[1].replace("_", ".")}` : "iOS";
  } else if (/Mac OS X/i.test(ua)) {
    const m = ua.match(/Mac OS X (\d+[._]\d+)/);
    os = m ? `macOS ${m[1].replace("_", ".")}` : "macOS";
  } else if (/Windows NT 10/i.test(ua)) os = "Windows 10/11";
  else if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Linux/i.test(ua)) os = "Linux";

  // Modelo do dispositivo mobile (extraido se houver)
  let device: string | null = null;
  if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua)) device = "iPad";
  else {
    // Android: tenta capturar modelo
    const m = ua.match(/Android.*?;\s*([^)]+?)(?:\s*Build|\))/i);
    if (m && m[1] && !/Linux|wv/i.test(m[1])) {
      device = m[1].trim().split(";").pop()?.trim() || null;
    }
  }

  const browserPart = browserVer ? `${browser} ${browserVer}` : browser;
  return device ? `${browserPart} · ${device} · ${os}` : `${browserPart} · ${os}`;
}
