import type { VehicleData } from "./tipos";
import { normalizarEstado } from "../estados";

// ---------------------------------------------------------------------------
// O contrato com o modelo de linguagem.
//
// Instrucao, schema de resposta e leitura do JSON de volta. Junto vem a
// lista de padroes que denunciam modelo errado -- quando o GPT devolve a
// chamada da loja no lugar do nome do carro, o Gemini e acionado.
// ---------------------------------------------------------------------------

export const EXTRACTION_SYSTEM_PROMPT = `Voce e um especialista em extrair dados de veiculos de anuncios brasileiros de repasse.

Extraia os seguintes campos do texto ou imagem fornecida:
- model: nome do modelo REAL do carro (ex: "CIVIC EXL 2.0", "BMW i7", "RENEGADE LONGITUDE 1.3").
  NUNCA use chamadas promocionais como modelo. Exemplos do que NAO E modelo:
    * "Menor valor Brasil" -> e CHAMADA, o modelo verdadeiro vem na linha seguinte
    * "Oportunidade", "Imperdivel", "Promoção"
    * "VAAPTY ITAJAI", "REPASSES SUL", "GO REPASSES" -> e nome da loja
    * "Historico Premium", "Avaliacao Superficial"
    * "Carro de Garagem", "Para seu showroom"
  Se a primeira linha do anuncio for desse tipo, pule e use a SEGUNDA linha
  (que geralmente tem o modelo real, ex: "BMW i7", "TORO RANCH 2.0").
- brand: marca (ex: "HONDA")
- year: ano de fabricacao (numero inteiro)
- yearModel: ano do modelo (numero inteiro, pode ser diferente do ano de fabricacao)
- km: quilometragem (numero inteiro)
- price: PRECO DE VENDA / OFERTA em reais (numero decimal) -- ver regras criticas abaixo
- fipePrice: preco da TABELA FIPE em reais se mencionado (numero decimal ou null)
- transmission: tipo de cambio - "AUTOMATICO", "MANUAL" ou "CVT".
  "Manual do proprietario", "manual e chave reserva", "sem manual" sao ITENS
  de documentacao, NAO cambio. So use MANUAL se o anuncio disser que o
  cambio e manual. "Ar automatico" e "farol automatico" tambem nao sao cambio.
  Carro eletrico e sempre AUTOMATICO.
- fuel: tipo de combustivel - "GASOLINA", "ETANOL", "FLEX", "DIESEL", "HIBRIDO" ou "ELETRICO"
- color: cor do veiculo
- plate: placa se mencionada (formato ABC1D23 ou ABC-1234)
- location: cidade/regiao mencionada
- state: sigla (UF) do estado SOMENTE se o anuncio disser o estado ou a cidade
  (ex.: "Vitória - ES" -> "ES", "Curitiba" -> "PR"). Se disser so a regiao
  ("Nordeste", "Norte", "Sudeste", "Centro-Oeste", "Sul"), use o nome da
  regiao em maiusculas (ex.: "NORDESTE"). NUNCA deduza pelo DDD do telefone,
  pelo nome da loja ou do grupo. Sem informacao de local, null.
- features: lista de opcionais/caracteristicas como array de strings
- sellerPhone: telefone do vendedor se mencionado

=== REGRAS CRITICAS SOBRE PRECO vs FIPE ===
1. "price" e "fipePrice" sao DUAS COISAS DIFERENTES e quase nunca iguais.
   - fipePrice = valor da tabela FIPE (referencia de mercado).
   - price = o que o vendedor esta PEDINDO pelo carro (a oferta real).
2. A FIPE aparece SEMPRE perto da palavra "FIPE". O preco de venda aparece
   perto de "por", "valor", "pedido", "vendo", "R$" SEM a palavra fipe.
3. NUNCA copie o valor da FIPE para o campo price. Se a unica cifra do
   anuncio estiver na linha da FIPE (ex: "Fipe R$ 169.302" e nada mais),
   entao o anuncio NAO TEM preco de venda -> retorne price = null.
4. Em repasse o preco de venda quase sempre eh MENOR que a FIPE. Se voce
   extrair um price IGUAL ou MAIOR que a fipePrice, releia: provavelmente
   confundiu os dois. Na duvida, deixe price = null.
5. DUAS FIPES: as vezes o anuncio traz "Fipe 0km" (do carro novo) e "Fipe
   usado" (do usado). Como o carro de repasse eh USADO, fipePrice deve ser
   a "Fipe usado". Ignore a "Fipe 0km". E cuidado: "Fipe 0km" tem o "0"
   que NAO eh o valor -- o valor vem depois do R$.
6. Exemplos:
   - "Fipe R$ 169.302" (so isso)        -> fipePrice=169302, price=null
   - "Fipe 80mil / Por 72mil"           -> fipePrice=80000, price=72000
   - "Valor 65.000 - Fipe da 71.000"    -> price=65000, fipePrice=71000
   - "Vendo por 90 mil"                 -> price=90000, fipePrice=null
   - "Fipe 0km R$180.000 / Fipe usado R$159.000 / Por R$149.000"
        -> fipePrice=159000 (a do usado), price=149000

7. DOIS VALORES SEM ROTULO 'FIPE' (caso comum):
   Vendedor escreve 2 valores no final, o de cima maior e o de baixo
   menor (geralmente em negrito *...*). Sem palavra 'Fipe' explicita:
     R\$ 94.673,00
     *R\$ 79.990,00*
   Interprete: o MAIOR e a FIPE (ou tabela), o MENOR (especialmente
   se em negrito) e o preco de VENDA.
   Resultado: fipePrice=94673, price=79990
   Aplique SO se a diferenca entre os 2 estiver entre 3% e 50% (faixa
   tipica de repasse). Se diferenca > 50%, sao precos diferentes
   (talvez de carros diferentes ou erro), ignore.

7. FORMATO BRASILEIRO DE NUMEROS:
   - "78.200,00" = 78200 (ponto = milhar, virgula = decimal)
   - "78.200.00" = 78200 (ponto duplo: o ultimo eh DECIMAL, NAO milhar!)
   - "78.200.000" = 78200000 (ultimo grupo com 3 digitos = milhar)
   - "65.500" = 65500 (1 ponto + 3 digitos = milhar)
   - NUNCA retorne valores absurdos (carro de R\$ 7 milhoes nao existe em
     repasse). Se extrair >R\$ 800.000 verifique se nao tirou virgula errada.

=== REGRAS CRITICAS SOBRE KM ===
1. "km" = QUILOMETRAGEM rodada (Ex: 50.000 km, 29.940 Km, 80mil km)
2. NUNCA confundir com:
   - CV (cavalos de potencia): "900 CV", "600cv" -> e POTENCIA, NAO KM
   - HP (horsepower): "500 HP" -> POTENCIA
   - cilindradas: "2.0", "1.6", "3.0 V6"
   - litragem tanque: "60L"
3. Procure linhas com explicitamente "km", "quilometragem", "rodados",
   "Km rodados". Se nao houver linha explicita de km, retorne null.
4. Exemplos:
   - "29.940 Km" -> km=29940
   - "900 CV" -> NAO E KM, pule
   - "Suspensao FOX, 900 cv, Volante carbono, 29mil km" -> km=29000
   - "Ram TRX 6.2L Supercharged V8" -> NAO E KM (6.2L = cilindrada)

=== REGRAS CRITICAS SOBRE O ANO ===
1. "year" e "yearModel" sao o ano de FABRICACAO e MODELO do veiculo.
2. NUNCA confunda com o ano do IPVA/licenciamento. Frases como
   "IPVA 2026 pago", "IPVA 26 PG", "licenciado 2025", "seguro ate 2026"
   referem-se a documentos, NAO ao ano do carro.
3. O ano do carro costuma aparecer sozinho ("2019"), apos "Ano:", ou no
   formato fabricacao/modelo ("2019/2020"). Geralmente perto do modelo
   ou da quilometragem.
4. Exemplos:
   - "Compass 2019 / IPVA 2026 pago"     -> year=2019 (NAO 2026)
   - "Civic 2020/2021 - Licenciado 2025" -> year=2020, yearModel=2021
   - "Onix 2022 IPVA 25 PG"              -> year=2022 (NAO 2025)

REGRAS DE FORMATO BRASILEIRO:
- "127.000" ou "127 mil" = 127000
- "R$ 85.000" ou "85mil" = 85000
- Ano: "2020/2021" significa year=2020, yearModel=2021

Se um campo nao puder ser extraido com certeza, use null.
Retorne APENAS o JSON valido.`;

export const VEHICLE_JSON_SCHEMA = {
  name: "vehicle_data",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      model: { type: ["string", "null"] as const },
      brand: { type: ["string", "null"] as const },
      year: { type: ["number", "null"] as const },
      yearModel: { type: ["number", "null"] as const },
      km: { type: ["number", "null"] as const },
      price: { type: ["number", "null"] as const },
      fipePrice: { type: ["number", "null"] as const },
      transmission: { type: ["string", "null"] as const, enum: ["AUTOMATICO", "MANUAL", "CVT", null] },
      fuel: { type: ["string", "null"] as const, enum: ["GASOLINA", "ETANOL", "FLEX", "DIESEL", "HIBRIDO", "ELETRICO", null] },
      color: { type: ["string", "null"] as const },
      plate: { type: ["string", "null"] as const },
      location: { type: ["string", "null"] as const },
      state: { type: ["string", "null"] as const },
      features: { type: "array" as const, items: { type: "string" as const } },
      sellerPhone: { type: ["string", "null"] as const },
    },
    required: ["model", "brand", "year", "yearModel", "km", "price", "fipePrice", "transmission", "fuel", "color", "plate", "location", "state", "features", "sellerPhone"],
    additionalProperties: false,
  },
};

export function parseGptResponse(raw: string): VehicleData | null {
  try {
    const parsed = JSON.parse(raw);
    // Salvaguarda dupla: se o GPT extraiu price igual a fipePrice, ele
    // confundiu os dois campos. Descarta o price (anuncio sem oferta real).
    if (
      parsed.price != null &&
      parsed.fipePrice != null &&
      parsed.price === parsed.fipePrice
    ) {
      console.log("[ai] GPT: price == fipePrice, descartando price");
      parsed.price = null;
    }
    if (!parsed.model || parsed.year == null || parsed.km == null || !parsed.price) return null;
    return {
      model: parsed.model, brand: parsed.brand ?? undefined,
      year: parsed.year, yearModel: parsed.yearModel ?? undefined,
      km: parsed.km, price: parsed.price, fipePrice: parsed.fipePrice ?? undefined,
      transmission: parsed.transmission ?? undefined, fuel: parsed.fuel ?? undefined,
      color: parsed.color ?? undefined, plate: parsed.plate ?? undefined,
      location: parsed.location ?? undefined, state: normalizarEstado(parsed.state) ?? undefined,
      features: parsed.features ?? [], photos: [],
      rawDescription: undefined, sellerPhone: parsed.sellerPhone ?? undefined,
    };
  } catch { return null; }
}

// Padroes que indicam modelo ERRADO (chamada/loja em vez do modelo real).
// Se GPT retornar modelo casando com esses padroes, considera erro semantico
// e tenta Gemini como fallback.
export const BAD_MODEL_PATTERNS_EXTRACT: RegExp[] = [
  /menor\s*(valor|pre[çc]o)/i,
  /oportunidade|imperd[ií]vel|promo[çc][ãa]o/i,
  /\b(vaapty|caarpix|repassey)\b/i,
  /go\s*repasses|repasses?\s+(sul|brasil|porto\s*alegre|premium|vip)/i,
  /\bporto\s*alegre\b/i,
  /historico\s*premium|aval[ií]a[çc][aã]o\s*superficial/i,
  /baixou+|abaixo\s*da\s*(tabela|fipe)/i,
  /para\s*seu\s*showroom/i,
  /^exclusividade|edicao\s*(limitada|especial|exclusiva)|lan[çc]amento|reservad[ao]/i,
];
export const isModelLikelyBad = (model?: string | null) =>
  !!model && BAD_MODEL_PATTERNS_EXTRACT.some((p) => p.test(model));
