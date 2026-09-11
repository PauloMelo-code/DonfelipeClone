"use client";

import { Loader2, Save, Send, Smartphone } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { CamposDeNegocio } from "./_componentes/campos-de-negocio";
import { CartaoDeConexao } from "./_componentes/cartao-de-conexao";
import { Ferramentas } from "./_componentes/ferramentas";
import { useConexaoWhatsApp } from "./_ganchos/use-conexao-whatsapp";
import { useConfiguracoes } from "./_ganchos/use-configuracoes";
import { useFerramentas } from "./_ganchos/use-ferramentas";

export default function ConfiguracoesPage() {
  const cfg = useConfiguracoes();
  const ferramentas = useFerramentas();

  const captura = useConexaoWhatsApp({
    status: "/api/whatsapp/status",
    qr: "/api/whatsapp/qr",
    rotuloDoErro: "Erro ao buscar QR code",
  });

  const envio = useConexaoWhatsApp({
    status: "/api/whatsapp/send-status",
    qr: "/api/whatsapp/send-qr",
    rotuloDoErro: "Erro ao buscar QR code de envio",
  });

  return (
    <>
      <Header title="Configurações" subtitle="Parâmetros do sistema" />

      <PageContainer className="max-w-2xl">
        <CartaoDeConexao
          icone={<Smartphone />}
          titulo="Celular de Captura (WhatsApp)"
          conexao={captura}
          textoConectado="O celular está conectado e monitorando os grupos de captura."
          altDoQr="QR Code WhatsApp"
          iconeDoBotao={<Smartphone className="h-4 w-4" />}
        />

        <CartaoDeConexao
          icone={<Send />}
          titulo="Celular de Envio (WhatsApp)"
          conexao={envio}
          textoConectado="O celular de envio está conectado e publicando nos grupos de destino."
          altDoQr="QR Code WhatsApp Envio"
          iconeDoBotao={<Send className="h-4 w-4" />}
          podeFaltarConfiguracao
        />

        <CamposDeNegocio cfg={cfg} />

        <Ferramentas ferramentas={ferramentas} />

        <Button onClick={cfg.salvar} disabled={cfg.salvando} className="gap-2 gradient-gold text-black">
          {cfg.salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </Button>
      </PageContainer>
    </>
  );
}
