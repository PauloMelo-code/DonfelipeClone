// ---------------------------------------------------------------------------
// Quem esta do outro lado: IP e User-Agent.
//
// UMA implementacao, e esta. Havia tres copias -- aqui, no funil de login e no
// webhook -- e as tres pegavam o valor da ESQUERDA do `x-forwarded-for`, que e
// exatamente o pedaco que o cliente escolhe. Com isso o limitador por IP virava
// enfeite: bastava mandar um cabecalho novo a cada tentativa para zerar o
// contador, e foi assim que a auditoria de 2026-09-10 chegou a 12 tentativas
// contra a mesma conta sem esbarrar em nada.
//
// O `x-forwarded-for` e ANEXADO por cada proxy, da esquerda para a direita:
//
//     x-forwarded-for: <o que o cliente disse>, <visto pelo proxy 1>, <pelo 2>
//
// O que o cliente escreve fica na frente e nao vale nada. O que vale e contado
// de TRAS para frente, pulando exatamente os proxies que nos mesmos rodamos --
// e por isso o numero deles precisa ser configurado, nao adivinhado.
// ---------------------------------------------------------------------------

/**
 * Quantos proxies NOSSOS ficam na frente da aplicacao.
 *
 * 1 e o padrao da infraestrutura da casa: um Nginx na frente do Next. Dois se
 * houver balanceador antes dele; zero se a aplicacao estiver exposta direto --
 * e nesse caso nenhum cabecalho e confiavel, porque nao ha ninguem no caminho
 * para escrever a verdade.
 *
 * Errar para MAIS devolve o endereco de um proxy interno, o que junta todo
 * mundo num balde so. Errar para MENOS devolve o que o cliente escreveu, que e
 * pior: cada atacante ganha um balde novo.
 */
const SALTOS_CONFIAVEIS = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? "1") || 0);

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Como ler um cabecalho, seja de um `Request` ou de um objeto simples. */
export type LeitorDeCabecalho = (nome: string) => string | null | undefined;

/**
 * Limpa e valida um endereco.
 *
 * Sem isto, um `x-forwarded-for` com texto qualquer vira chave de limitador e
 * linha de auditoria. Porta e colchetes de IPv6 saem porque alguns proxies os
 * anexam, e `1.2.3.4:5678` seria uma chave diferente de `1.2.3.4`.
 */
function normalizarIp(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  let valor = bruto.trim();
  if (!valor) return null;

  // [::1]:443 -> ::1
  const comColchetes = valor.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (comColchetes) valor = comColchetes[1];
  // 1.2.3.4:5678 -> 1.2.3.4 (so quando ha um unico ":", senao e IPv6 cru)
  else if (valor.split(":").length === 2) valor = valor.split(":")[0];

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(valor);
  if (ipv4) {
    return ipv4.slice(1).every((n) => Number(n) <= 255) ? valor : null;
  }
  // IPv6: hexadecimais, dois-pontos e o sufixo IPv4 embutido.
  if (/^[0-9a-fA-F:.]+$/.test(valor) && valor.includes(":")) return valor;

  return null;
}

/**
 * O endereco de quem realmente falou com a gente.
 *
 * Devolve null quando nao da para saber -- cadeia mais curta que o esperado,
 * valor invalido, ou nenhum proxy configurado. Null e melhor que um palpite:
 * quem chama junta todo mundo num balde so, o que e ruim mas honesto, em vez de
 * dar ao atacante um balde novo a cada cabecalho inventado.
 */
export function lerIp(ler: LeitorDeCabecalho, saltos = SALTOS_CONFIAVEIS): string | null {
  if (saltos <= 0) return null;

  const encadeado = ler("x-forwarded-for");
  if (encadeado) {
    const partes = encadeado
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    // Contado de TRAS para frente. Cadeia mais curta que o configurado
    // significa que alguem chegou por um caminho que nao e o nosso.
    if (partes.length >= saltos) {
      const confiavel = normalizarIp(partes[partes.length - saltos]);
      if (confiavel) return confiavel;
    }
  }

  // Estes o proxy SOBRESCREVE, em vez de anexar, entao valem quando ha proxy.
  return normalizarIp(ler("cf-connecting-ip")) ?? normalizarIp(ler("x-real-ip"));
}

/** IP e User-Agent a partir de um `Request` (rotas de API e Server Actions). */
export function extractRequestMeta(request: Request): RequestMeta {
  const ler: LeitorDeCabecalho = (nome) => request.headers.get(nome);
  return { ipAddress: lerIp(ler), userAgent: request.headers.get("user-agent") || null };
}

/**
 * O mesmo, a partir do objeto de cabecalhos do next-auth.
 *
 * O `authorize` do provider nao recebe um `Request`, recebe um objeto simples.
 * Sem esta porta, o funil de login teria a propria copia da leitura -- que era
 * justamente o defeito.
 */
export function metaDeCabecalhos(
  headers: Record<string, string | string[] | undefined> | undefined
): RequestMeta {
  const ler: LeitorDeCabecalho = (nome) => {
    const valor = headers?.[nome] ?? headers?.[nome.toLowerCase()];
    return Array.isArray(valor) ? valor[0] : valor;
  };
  return { ipAddress: lerIp(ler), userAgent: ler("user-agent") || null };
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
