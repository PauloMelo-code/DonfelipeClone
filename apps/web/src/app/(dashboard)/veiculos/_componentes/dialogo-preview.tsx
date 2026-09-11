"use client";

import { Copy, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BolhaEnviada } from "./bolha-whatsapp";
import { parseArray, textoDePreview, type Vehicle } from "./tipos";

// ---------------------------------------------------------------------------
// Preview so-leitura: como o anuncio vai chegar no grupo.
// ---------------------------------------------------------------------------

export function DialogoPreview({ veiculo, aoFechar }: { veiculo: Vehicle | null; aoFechar: () => void }) {
  const texto = veiculo ? textoDePreview(veiculo) : "";
  const fotos = veiculo ? parseArray(veiculo.photos) : [];

  return (
    <Dialog open={!!veiculo} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md p-0 overflow-hidden bg-transparent ring-0">
        <div className="rounded-xl overflow-hidden">
          <div className="bg-[#1F2C34] px-4 py-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[#2A3942] flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-[#8696A0]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#E9EDEF] truncate">Grupo de Vendas</p>
              <p className="text-[11px] text-[#8696A0]">Preview da mensagem</p>
            </div>
            <button onClick={aoFechar} className="text-[#8696A0] hover:text-[#E9EDEF] transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <BolhaEnviada text={texto} photo={fotos[0]} photoCount={fotos.length} />
          <div className="bg-[#1F2C34] px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-[#8696A0]">Assim aparecera no WhatsApp</span>
            <button
              onClick={() => {
                if (!veiculo) return;
                navigator.clipboard.writeText(texto);
                toast.success("Texto copiado!");
              }}
              className="flex items-center gap-1.5 text-xs text-[#00A884] hover:text-[#06CF9C] transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar texto
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
