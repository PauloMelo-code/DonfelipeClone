"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-background">
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-10%] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-cugini-orange/[0.06] blur-[150px]" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[500px] rounded-full bg-cugini-orange/[0.03] blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(9,9,11,0.8)_70%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-[380px] px-6"
      >
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="relative mb-4 h-20 w-48">
            <Image
              src="/logo-cugini.png"
              alt="Cugini Repasses"
              fill
              className="object-contain"
              priority
            />
          </div>
          <p className="text-[13px] text-muted-foreground/60 font-light tracking-wide">
            Acesse sua conta para continuar
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 bg-white/[0.03] border-white/[0.06] focus:border-cugini-orange/40 focus:ring-cugini-orange/15 transition-colors duration-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 bg-white/[0.03] border-white/[0.06] focus:border-cugini-orange/40 focus:ring-cugini-orange/15 transition-colors duration-200"
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-destructive"
            >
              {error}
            </motion.p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full gradient-orange text-white font-semibold tracking-wide hover:opacity-90 transition-all duration-200 hover:shadow-[0_4px_20px_rgba(232,115,26,0.3)]"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Entrar"
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
