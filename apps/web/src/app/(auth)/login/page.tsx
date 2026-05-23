"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Lock, Eye, EyeOff, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Email ou senha incorretos");
        setLoading(false);
      } else if (result?.ok) {
        window.location.href = "/";
      }
    } catch {
      setError("Erro ao conectar ao servidor");
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070709]">
      {/* ── Background layers ─────────────────────────────────────── */}
      {/* Mesh gradient orbs */}
      <div className="pointer-events-none fixed inset-0">
        <motion.div
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -20, 30, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-[-10%] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-cugini-orange/[0.10] blur-[140px]"
        />
        <motion.div
          animate={{
            x: [0, -40, 20, 0],
            y: [0, 30, -10, 0],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-15%] left-[-10%] h-[500px] w-[600px] rounded-full bg-orange-600/[0.06] blur-[120px]"
        />
        <motion.div
          animate={{
            x: [0, 40, -30, 0],
            y: [0, 20, -20, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-[-10%] top-[20%] h-[400px] w-[500px] rounded-full bg-amber-500/[0.04] blur-[140px]"
        />
        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(7,7,9,0.85)_75%)]" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      {/* ── Floating particles (subtle) ──────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ y: "100vh", x: `${20 + i * 30}vw`, opacity: 0 }}
            animate={{
              y: "-10vh",
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: 12 + i * 3,
              repeat: Infinity,
              delay: i * 4,
              ease: "linear",
            }}
            className="absolute h-1 w-1 rounded-full bg-cugini-orange/40 shadow-[0_0_8px_rgba(232,115,26,0.5)]"
          />
        ))}
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[420px] px-6"
      >
        {/* Logo + Brand */}
        <div className="mb-10 flex flex-col items-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative mb-5 h-20 w-52"
          >
            <Image
              src="/logo-cugini.png"
              alt="Cugini Repasses"
              fill
              className="object-contain drop-shadow-[0_0_30px_rgba(232,115,26,0.25)]"
              priority
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70"
          >
            <Sparkles className="h-3 w-3 text-cugini-orange/70" />
            <span>Plataforma de Repasses</span>
            <Sparkles className="h-3 w-3 text-cugini-orange/70" />
          </motion.div>
        </div>

        {/* Form card with orbit glow */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="relative"
        >
          {/* Glow border (animated) */}
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-cugini-orange/30 via-white/[0.04] to-transparent opacity-60" />
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-[radial-gradient(circle_at_top,rgba(232,115,26,0.15),transparent_60%)]" />

          <form
            onSubmit={handleSubmit}
            className="relative glass-strong rounded-2xl p-7 space-y-5"
          >
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground">
                Bem-vindo de volta
              </h1>
              <p className="text-[13px] text-muted-foreground/60">
                Entre na sua conta para continuar
              </p>
            </div>

            <div className="space-y-4 pt-1">
              {/* Email */}
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40 transition-colors peer-focus:text-cugini-orange" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="voce@cugini.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="peer h-12 pl-10 bg-white/[0.02] border-white/[0.06] text-foreground placeholder:text-muted-foreground/30 focus:border-cugini-orange/50 focus:ring-1 focus:ring-cugini-orange/20 transition-all duration-200"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50"
                >
                  Senha
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-12 pl-10 pr-11 bg-white/[0.02] border-white/[0.06] text-foreground placeholder:text-muted-foreground/30 focus:border-cugini-orange/50 focus:ring-1 focus:ring-cugini-orange/20 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive animate-pulse" />
                  <p className="text-[13px] text-destructive">{error}</p>
                </motion.div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading || !email || !password}
                className={cn(
                  "relative h-12 w-full overflow-hidden gradient-orange text-white font-semibold tracking-wide",
                  "transition-all duration-200",
                  "hover:shadow-[0_8px_30px_rgba(232,115,26,0.35)] hover:scale-[1.01]",
                  "active:scale-[0.99]",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                )}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Entrar
                    <span aria-hidden className="text-sm">→</span>
                  </span>
                )}
                {/* Shine effect on hover */}
                {!loading && (
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 hover:translate-x-full" />
                )}
              </Button>
            </div>
          </form>
        </motion.div>

        {/* Footer security badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.45 }}
          className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/40"
        >
          <ShieldCheck className="h-3 w-3" />
          <span>Conexão segura · Acesso restrito</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
