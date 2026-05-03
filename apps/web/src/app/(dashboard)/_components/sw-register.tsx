"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // Only in production

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[SW] Registration failed:", err);
    });
  }, []);

  return null;
}
