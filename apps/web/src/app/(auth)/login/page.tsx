"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useSuporteAPasskey } from "@/lib/suporte-a-passkey";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Lock, Eye, EyeOff, ShieldCheck, Sparkles, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [entrandoPorPasskey, setEntrandoPorPasskey] = useState(false);
  // O botao so aparece onde o navegador sabe o que fazer com ele.
  const temPasskey = useSuporteAPasskey();

  /**
   * Entrada por passkey: sem e-mail e sem senha.
   *
   * O autenticador oferece as contas que ele mesmo guarda, entao a tela nao
   * pergunta de quem e a conta -- e o servidor so descobre depois de conferir
   * a assinatura. E o que impede o botao de virar consulta de "esse e-mail
   * existe?".
   */
  const entrarComPasskey = async () => {
    setError("");
    setEntrandoPorPasskey(true);
    try {
      const desafio = await fetch("/api/auth/passkey/desafio", { method: "POST" });
      if (!desafio.ok) throw new Error("Não foi possível começar agora.");

      const assinatura = await startAuthentication({ optionsJSON: await desafio.json() });

      const result = await signIn("credentials", {
        passkey: JSON.stringify(assinatura),
        redirect: false,
      });
      if (result?.ok) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/";
        return;
      }
      setError("Credenciais inválidas");
    } catch (e) {
      // Cancelar o pedido do sistema operacional cai aqui, e nao e erro.
      const cancelou = e instanceof Error && /NotAllowed|abort/i.test(e.name + e.message);
      if (!cancelou) setError("Não foi possível entrar com a passkey");
    } finally {
      setEntrandoPorPasskey(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        // Os tres campos vao juntos. Confirmar a senha primeiro e so entao
        // pedir o codigo criaria uma resposta intermediaria que diz "esta
        // senha esta certa" a quem ainda nao entrou.
        codigo,
        redirect: false,
      });

      if (result?.error) {
        // Mensagem unica para toda recusa, igual a do servidor: separar os
        // casos aqui devolveria pela tela a enumeracao de contas que a
        // resposta uniforme fechou.
        setError("Credenciais inválidas");
        setLoading(false);
      } else if (result?.ok) {
        // Conta que ainda nao cadastrou o autenticador vai para o cadastro --
        // a sessao dela nao alcanca mais nada. Quem barra e o servidor, em
        // toda rota; isto aqui so evita cair num painel que so daria 403.
        const estado = await fetch("/api/me/2fa")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        window.location.href = estado && estado.ativo === false ? "/2fa" : "/";
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
          className="absolute left-1/2 top-[-10%] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-brand-gold/[0.10] blur-[140px]"
        />
        <motion.div
          animate={{
            x: [0, -40, 20, 0],
            y: [0, 30, -10, 0],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-15%] left-[-10%] h-[500px] w-[600px] rounded-full bg-amber-600/[0.06] blur-[120px]"
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
            className="absolute h-1 w-1 rounded-full bg-brand-gold/40 shadow-[0_0_8px_rgba(201, 151, 61,0.5)]"
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
              src="/logo-don-felipe.png"
              alt="Don Felipe Repasses"
              fill
              className="object-contain drop-shadow-[0_0_30px_rgba(201, 151, 61,0.25)]"
              priority
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70"
          >
            <Sparkles className="h-3 w-3 text-brand-gold/70" />
            <span>Plataforma de Repasses</span>
            <Sparkles className="h-3 w-3 text-brand-gold/70" />
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
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-brand-gold/30 via-white/[0.04] to-transparent opacity-60" />
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-[radial-gradient(circle_at_top,rgba(201, 151, 61,0.15),transparent_60%)]" />

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
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40 transition-colors peer-focus:text-brand-gold" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="voce@donfelipe.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="peer h-12 pl-10 bg-white/[0.02] border-white/[0.06] text-foreground placeholder:text-muted-foreground/30 focus:border-brand-gold/50 focus:ring-1 focus:ring-brand-gold/20 transition-all duration-200"
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
                    className="h-12 pl-10 pr-11 bg-white/[0.02] border-white/[0.06] text-foreground placeholder:text-muted-foreground/30 focus:border-brand-gold/50 focus:ring-1 focus:ring-brand-gold/20 transition-all duration-200"
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

              {/* Codigo do segundo fator */}
              <div className="space-y-1.5">
                <label
                  htmlFor="codigo"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50"
                >
                  Código do autenticador
                </label>
                <div className="relative">
                  <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
                  <Input
                    id="codigo"
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    autoComplete="one-time-code"
                    maxLength={12}
                    className="h-12 pl-10 tracking-[0.35em] bg-white/[0.02] border-white/[0.06] text-foreground placeholder:tracking-[0.35em] placeholder:text-muted-foreground/30 focus:border-brand-gold/50 focus:ring-1 focus:ring-brand-gold/20 transition-all duration-200"
                  />
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground/40">
                  Do seu aplicativo autenticador. Serve também um código de
                  resgate. Deixe em branco na primeira entrada, antes de
                  cadastrar.
                </p>
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
                  "relative h-12 w-full overflow-hidden gradient-gold text-white font-semibold tracking-wide",
                  "transition-all duration-200",
                  "hover:shadow-[0_8px_30px_rgba(201, 151, 61,0.35)] hover:scale-[1.01]",
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

              {/* Passkey: sem e-mail e sem senha */}
              {temPasskey && (
                <>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="h-px flex-1 bg-white/[0.06]" />
                    <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/35">
                      ou
                    </span>
                    <span className="h-px flex-1 bg-white/[0.06]" />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={entrarComPasskey}
                    disabled={entrandoPorPasskey || loading}
                    className="h-12 w-full border-white/[0.08] bg-white/[0.02] font-medium text-foreground hover:bg-white/[0.05]"
                  >
                    {entrandoPorPasskey ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Aguardando o autenticador...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Fingerprint className="h-4 w-4 text-brand-gold" />
                        Entrar com passkey
                      </span>
                    )}
                  </Button>
                </>
              )}
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
