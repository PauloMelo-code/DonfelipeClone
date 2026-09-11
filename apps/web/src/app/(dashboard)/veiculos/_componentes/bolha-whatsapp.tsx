"use client";

// ---------------------------------------------------------------------------
// As bolhas de conversa do WhatsApp.
//
// O operador decide olhando o preview, entao a bolha precisa parecer a coisa
// real: mesmo papel de parede, mesmo verde, mesmo tique duplo azul. O papel de
// parede e a bolha cinza apareciam copiados em tres lugares -- aqui ficam uma
// vez so.
// ---------------------------------------------------------------------------

/** Papel de parede do WhatsApp: losangos brancos quase invisiveis no fundo escuro. */
export const FUNDO_WHATSAPP = {
  backgroundColor: "#0B141A",
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
} as const;

/** Bolha verde, alinhada a direita: a mensagem que o Don Felipe vai enviar. */
export function BolhaEnviada({ text, photo, photoCount }: { text: string; photo?: string; photoCount: number }) {
  return (
    <div className="p-4 min-h-[140px] sm:min-h-[200px]" style={FUNDO_WHATSAPP}>
      <div className="max-w-[85%] ml-auto">
        <div className="bg-[#005C4B] rounded-lg overflow-hidden shadow-lg">
          {photo && (
            <div className="relative">
              <img src={photo} alt="" className="w-full h-36 sm:h-44 object-cover" />
              {photoCount > 1 && (
                <div className="absolute bottom-2 right-2 bg-black/60 rounded-full px-2 py-0.5 text-[10px] text-white">
                  1/{photoCount}
                </div>
              )}
            </div>
          )}
          <div className="px-2.5 py-1.5">
            <p className="text-[13.5px] text-[#E9EDEF] whitespace-pre-wrap leading-[19px]">{text}</p>
            <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
              <span className="text-[10.5px] text-[#8696A0]">
                {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <svg viewBox="0 0 16 11" className="h-[11px] w-4 text-[#53BDEB]" fill="currentColor">
                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.336-.153.457.457 0 0 0-.344.153l-.311.31a.445.445 0 0 0-.127.333c0 .137.042.247.127.332l2.762 2.876c.09.089.2.133.332.133a.457.457 0 0 0 .37-.178l6.833-8.43a.418.418 0 0 0 .102-.298.442.442 0 0 0-.127-.324l-.395-.371z" />
                <path d="M14.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.249-.406.5 1.2 1.249c.09.089.2.133.332.133a.457.457 0 0 0 .37-.178l6.833-8.43a.418.418 0 0 0 .102-.298.442.442 0 0 0-.127-.324l-.395-.371z" style={{opacity: 0.75}} />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Bolha cinza, alinhada a esquerda: a mensagem como chegou do grupo de repasse. */
export function BolhaRecebida({
  text,
  photo,
  capturedAt,
  alturaMinima = false,
}: {
  text: string;
  photo?: string;
  capturedAt: string;
  /** No preview lado a lado a bolha ganha piso de altura pra nao pular ao trocar de aba. */
  alturaMinima?: boolean;
}) {
  return (
    <div className={alturaMinima ? "p-4 min-h-[140px] sm:min-h-[200px]" : "p-4"} style={FUNDO_WHATSAPP}>
      <div className="max-w-[85%]">
        <div className="bg-[#1F2C34] rounded-lg overflow-hidden shadow-lg">
          {photo && <img src={photo} alt="" className="w-full h-40 object-cover" />}
          <div className="px-2.5 py-1.5">
            <p className="text-[13px] text-[#E9EDEF] whitespace-pre-wrap leading-[18px]">{text}</p>
            <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
              <span className="text-[10px] text-[#8696A0]">
                {new Date(capturedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
