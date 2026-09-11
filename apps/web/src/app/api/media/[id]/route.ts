import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, arquivosMidia, vivos } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Serve uma foto guardada no banco.
//
// Exige SESSAO. Antes nao exigia: a rota estava na lista publica do middleware
// e o handler nao tinha guarda nenhuma, entao qualquer um com o identificador
// baixava a imagem. O identificador e um uuid v4, imprevisivel -- mas isso e
// segredo-na-URL, e URL vaza por historico, por `Referer` e por print
// compartilhado. As fotos trazem placa e, as vezes, documento e pessoas.
//
// Nada externo quebra com isso: quem publica no WhatsApp le a linha do banco e
// manda o conteudo em base64 (`lib/publisher.ts`), e a analise de imagem faz o
// mesmo (`lib/ai/index.ts`). O unico consumidor da URL e a propria tela, e o
// navegador manda o cookie porque a origem e a mesma.
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;

  const [media] = await db
    .select({ data: arquivosMidia.data, mimeType: arquivosMidia.mimeType })
    .from(arquivosMidia)
    .where(and(eq(arquivosMidia.id, id), vivos(arquivosMidia)))
    .limit(1);

  if (!media) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = Buffer.from(media.data, "base64");

  // Remendo antigo: parte do acervo foi gravada como `application/octet-stream`.
  // A correcao vira imagem, e nunca um tipo executavel -- e o `nosniff` abaixo
  // impede o navegador de adivinhar outra coisa a partir do conteudo.
  let contentType = media.mimeType;
  if (contentType === "application/octet-stream" || contentType.startsWith("application/")) {
    contentType = "image/jpeg";
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      // `private`: o navegador de quem tem a sessao pode guardar; o proxy da
      // rede, nao. Antes era `public`, o que autorizava qualquer intermediario
      // a manter copia da foto por um ano.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Length": buffer.length.toString(),
    },
  });
}
