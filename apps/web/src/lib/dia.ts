// ---------------------------------------------------------------------------
// O dia do cliente.
//
// O Dashboard mostrava "Capturas hoje" e "Publicacoes hoje" errados: o corte
// do dia saia do fuso do PROCESSO, e o container roda em UTC. Na pratica o
// "hoje" comecava as 21h do dia anterior -- justo o horario de pico dos
// grupos --, e o numero nunca batia com o que o operador via.
//
// O Dockerfile agora fixa TZ=America/Sao_Paulo, mas o dia nao pode depender
// disso: rodando em outra maquina, sem a variavel, a conta voltaria a errar
// em silencio. Aqui o fuso e explicito.
// ---------------------------------------------------------------------------

export const FUSO = "America/Sao_Paulo";

const PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function campos(data: Date): Record<string, number> {
  const r: Record<string, number> = {};
  for (const p of PARTES.formatToParts(data)) {
    if (p.type !== "literal") r[p.type] = Number(p.value);
  }
  // 24 e a meia-noite em `hourCycle` h23/h24 conforme o runtime.
  if (r.hour === 24) r.hour = 0;
  return r;
}

/** O dia civil do cliente, "2026-09-22", para agrupar por data. */
export function diaLocal(data: Date): string {
  const c = campos(data);
  return `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}

/** O instante em que o dia do cliente comecou (meia-noite em Sao Paulo). */
export function inicioDoDia(agora: Date = new Date()): Date {
  const c = campos(agora);
  const desdeAMeiaNoite = (c.hour * 60 * 60 + c.minute * 60 + c.second) * 1000;
  const inicio = new Date(agora.getTime() - desdeAMeiaNoite);
  // Zera o resto de milissegundos do proprio instante.
  inicio.setMilliseconds(0);
  return inicio;
}

/** O instante em que comecou o dia de N dias atras, no fuso do cliente. */
export function inicioDeDiasAtras(dias: number, agora: Date = new Date()): Date {
  const inicio = inicioDoDia(agora);
  // Volta por dias civis: 24h fixas erram na virada do horario de verao.
  return inicioDoDia(new Date(inicio.getTime() - dias * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000));
}
