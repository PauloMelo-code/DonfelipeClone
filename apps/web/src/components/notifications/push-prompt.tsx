"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";

export function PushPrompt() {
  const [show, setShow] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
    // Show prompt only if default and after 5s of usage
    if (Notification.permission === "default") {
      const dismissed = localStorage.getItem("donfelipe_push_dismissed");
      if (!dismissed) {
        const t = setTimeout(() => setShow(true), 5000);
        return () => clearTimeout(t);
      }
    }
  }, []);

  const enable = async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      // Show test
      new Notification("Don Felipe Repasses", {
        body: "Notificações ativadas! Você será avisado de novos veículos VIP.",
        icon: "/icon.svg",
      });
      toast.success("Notificações ativadas");

      // TODO: Subscribe to push (requires VAPID keys, deferred)
      // For now we just request permission so the browser allows future Notifications
    } else {
      toast.error("Permissão negada");
    }
    setShow(false);
  };

  const dismiss = () => {
    localStorage.setItem("donfelipe_push_dismissed", "1");
    setShow(false);
  };

  if (!show || permission !== "default") return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 z-50 max-w-sm rounded-2xl bg-card border border-border shadow-2xl p-4">
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="rounded-full bg-brand-gold/15 p-2">
          <Bell className="h-5 w-5 text-brand-gold" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Receber alertas?</p>
          <p className="text-xs text-muted-foreground mt-1">
            Saiba na hora quando chegar um carro VIP ou veículo de oportunidade.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={enable}
              className="rounded-lg bg-brand-gold text-white px-3 py-1.5 text-xs font-medium hover:bg-brand-gold/90"
            >
              Ativar
            </button>
            <button
              onClick={dismiss}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
