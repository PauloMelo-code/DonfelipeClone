import { lookup as dnsLookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import type { LookupFunction } from "node:net";

// ---------------------------------------------------------------------------
// Guarda de SSRF para URL vinda de fora.
//
// O webhook recebe a URL da foto de um terceiro e o servidor baixa aquilo. Sem
// guarda, quem controla o payload aponta para a rede interna da VPS
// (169.254.169.254 de metadados de nuvem, Postgres em 127.0.0.1, o proprio
// health monitor) e le a resposta em /api/media/<id>, que e rota publica.
//
// Duas metades, e as duas importam:
//   1. resolver o nome e RECUSAR se qualquer endereco for privado;
//   2. conectar NAQUELE endereco. Sem a segunda, o dominio pode responder um
//      IP publico na checagem e 127.0.0.1 no request seguinte -- o ataque
//      classico de DNS rebinding.
// ---------------------------------------------------------------------------

/** Sufixos de host permitidos, separados por virgula. Vazio = qualquer host publico. */
const ALLOWLIST = (process.env.MEDIA_HOST_ALLOWLIST ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

/** Converte "a.b.c.d" no inteiro de 32 bits correspondente. */
function paraInteiro(ipv4: string): number {
  const p = ipv4.split(".").map(Number);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

/** Faixas IPv4 que nunca devem ser alcancadas a partir de URL de terceiro. */
const FAIXAS_IPV4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "este" host
  ["10.0.0.0", 8], // privada
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (metadados de nuvem)
  ["172.16.0.0", 12], // privada
  ["192.0.0.0", 24], // protocolo IETF
  ["192.168.0.0", 16], // privada
  ["198.18.0.0", 15], // benchmark
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservada + broadcast
];

function ehIPv4Privado(ip: string): boolean {
  const n = paraInteiro(ip);
  return FAIXAS_IPV4.some(([base, bits]) => {
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mascara) === (paraInteiro(base) & mascara);
  });
}

function ehIPv6Privado(ip: string): boolean {
  const s = ip.toLowerCase().split("%")[0]; // descarta zone id
  if (s === "::1" || s === "::") return true;
  // IPv4 mapeado (::ffff:127.0.0.1) — avalia a parte v4
  const mapeado = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapeado) return ehIPv4Privado(mapeado[1]);
  const primeiro = parseInt(s.split(":")[0] || "0", 16);
  if ((primeiro & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((primeiro & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  return false;
}

export function ehEnderecoPrivado(ip: string): boolean {
  if (isIPv4(ip)) return ehIPv4Privado(ip);
  if (isIPv6(ip)) return ehIPv6Privado(ip);
  return true; // nao sei o que e: recusa
}

export type UrlVerificada =
  | { ok: true; endereco: string; familia: 4 | 6 }
  | { ok: false; motivo: string };

/**
 * Confere que a URL aponta para um host publico e devolve o endereco IP que
 * deve ser usado na conexao.
 */
export async function verificarUrlExterna(bruta: string): Promise<UrlVerificada> {
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    return { ok: false, motivo: "url_invalida" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, motivo: `protocolo_recusado:${url.protocol}` };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (ALLOWLIST.length > 0) {
    const permitido = ALLOWLIST.some((s) => host === s || host.endsWith(`.${s}`));
    if (!permitido) return { ok: false, motivo: "host_fora_da_allowlist" };
  }

  // Host que ja e IP literal: confere direto, sem DNS.
  if (isIPv4(host) || isIPv6(host)) {
    if (ehEnderecoPrivado(host)) return { ok: false, motivo: "endereco_privado" };
    return { ok: true, endereco: host, familia: isIPv4(host) ? 4 : 6 };
  }

  let enderecos: Array<{ address: string; family: number }>;
  try {
    enderecos = await dnsLookup(host, { all: true });
  } catch {
    return { ok: false, motivo: "dns_falhou" };
  }
  if (enderecos.length === 0) return { ok: false, motivo: "dns_vazio" };

  // UM endereco privado ja reprova: um nome pode devolver varios, e o cliente
  // escolheria qualquer um deles.
  for (const e of enderecos) {
    if (ehEnderecoPrivado(e.address)) return { ok: false, motivo: "endereco_privado" };
  }

  // IPv4 primeiro. O CDN do WhatsApp responde IPv6 antes, e o container
  // (node:20-alpine) nao tem rota IPv6: a conexao presa nesse endereco falha.
  const escolhido = enderecos.find((e) => e.family === 4) ?? enderecos[0];
  return {
    ok: true,
    endereco: escolhido.address,
    familia: escolhido.family === 6 ? 6 : 4,
  };
}

/**
 * Lookup fixo: faz o cliente HTTP conectar no endereco que ja foi validado,
 * fechando a janela de DNS rebinding entre a checagem e a conexao.
 */
export function lookupFixo(endereco: string, familia: 4 | 6): LookupFunction {
  return ((_host: string, opcoes: unknown, callback: unknown) => {
    const cb = (typeof opcoes === "function" ? opcoes : callback) as (
      erro: NodeJS.ErrnoException | null,
      endereco: string | Array<{ address: string; family: number }>,
      familia?: number
    ) => void;
    const querTodos =
      typeof opcoes === "object" && opcoes !== null && (opcoes as { all?: boolean }).all === true;
    if (querTodos) cb(null, [{ address: endereco, family: familia }]);
    else cb(null, endereco, familia);
  }) as unknown as LookupFunction;
}
