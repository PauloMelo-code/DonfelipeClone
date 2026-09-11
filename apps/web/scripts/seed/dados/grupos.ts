import type { NovoGrupoWhatsapp } from "../../../src/lib/db/schema";

// ---------------------------------------------------------------------------
// Os grupos da demonstracao.
//
// FONTE e de onde os anuncios chegam -- grupos de repasse de terceiros, com
// filtros proprios de ano e preco. DESTINO e para onde o Don Felipe publica.
// Um dos grupos fonte fica desligado de proposito, pra a tela mostrar tambem
// como um grupo inativo aparece.
// ---------------------------------------------------------------------------

export const GRUPOS_FONTE: NovoGrupoWhatsapp[] = [
  {
    groupId: "120363044556789@g.us",
    name: "Repasses PR/SC - Premium",
    role: "SOURCE",
    active: true,
    filters: JSON.stringify({ minYear: 2015, maxPrice: 250000 }),
  },
  {
    groupId: "120363055667788@g.us",
    name: "Repasses SUL - Seminovos",
    role: "SOURCE",
    active: true,
    filters: JSON.stringify({ minYear: 2012, maxPrice: 200000 }),
  },
  {
    groupId: "120363066778899@g.us",
    name: "Repasses Curitiba e Regiao",
    role: "SOURCE",
    active: true,
    filters: JSON.stringify({ minYear: 2014 }),
  },
  {
    groupId: "120363077889900@g.us",
    name: "Repasses SC - Floripa/Joinville",
    role: "SOURCE",
    active: false,
    filters: null,
  },
];

export const GRUPOS_DESTINO: NovoGrupoWhatsapp[] = [
  {
    groupId: "120363088990011@g.us",
    name: "Don Felipe Repasses - Ofertas",
    role: "TARGET",
    active: true,
  },
  {
    groupId: "120363099001122@g.us",
    name: "Don Felipe Repasses - Premium",
    role: "TARGET",
    active: true,
  },
  {
    groupId: "120363011223344@g.us",
    name: "Don Felipe Repasses - SUL",
    role: "TARGET",
    active: true,
  },
];

/** Parametros iniciais do sistema. */
export const CONFIGURACOES = [
  { key: "profit_margin_percent", value: "10" },
  { key: "delay_min_seconds", value: "5" },
  { key: "delay_max_seconds", value: "15" },
  { key: "filter_min_year", value: "2018" },
  { key: "filter_min_price", value: "30000" },
  { key: "auction_emoji", value: "🚗" },
];

/** Margem aplicada sobre o preco captado nos anuncios da demonstracao. */
export const MARGEM = 10;
