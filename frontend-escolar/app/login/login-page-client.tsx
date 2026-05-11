"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { ArrowRight, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export default function LoginPageClient() {
  const { login } = useAuth();
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const data = await login(identifier, password);

      if (data.user.role === "SUPERUSUARIO") {
        router.push("/superusuario");
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#eef4ff_0%,#f6f9ff_46%,#dfeaff_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-4rem] top-[-2rem] h-40 w-40 rounded-full bg-[rgba(59,130,246,0.16)] blur-3xl sm:h-56 sm:w-56" />
        <div className="absolute bottom-[-3rem] right-[-2rem] h-52 w-52 rounded-full bg-[rgba(96,165,250,0.2)] blur-3xl sm:h-72 sm:w-72" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-5xl items-stretch overflow-hidden rounded-[2rem] border border-white/50 bg-[rgba(255,252,247,0.74)] shadow-[0_24px_70px_rgba(73,92,111,0.14)] backdrop-blur-xl lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)]">
          <section className="hidden min-w-0 flex-col justify-between bg-[linear-gradient(160deg,rgba(30,64,175,0.97),rgba(37,99,235,0.99))] px-8 py-10 text-white lg:flex xl:px-10">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-white/85">
                GestClass
              </div>
              <h1 className="mt-6 font-[var(--font-display)] text-5xl font-bold leading-none tracking-[-0.04em]">
                Gestão escolar com acesso claro em qualquer tela.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/78">
                Entre na sua plataforma para acompanhar escolas, turmas, comunicação,
                notas e rotinas administrativas com uma experiência mais organizada.
              </p>
            </div>

            <div className="grid gap-4">
              <FeatureItem
                icon={ShieldCheck}
                title="Acesso por perfil"
                description="Superusuário, gestão, secretaria, professores, responsáveis e alunos no mesmo ambiente."
              />
              <FeatureItem
                icon={ArrowRight}
                title="Navegação rápida"
                description="Fluxos pensados para uso no computador e no celular sem menus escondidos."
              />
            </div>
          </section>

          <section className="min-w-0 px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
            <div className="mx-auto flex w-full max-w-md flex-col">
              <div className="text-center lg:text-left">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[linear-gradient(135deg,#2563eb,#60a5fa)] text-xl font-black text-white shadow-[0_18px_32px_rgba(37,99,235,0.28)] lg:mx-0">
                  GC
                </div>

                <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-[color:var(--primary)]">
                  GestClass
                </p>
                <h2 className="mt-2 font-[var(--font-display)] text-4xl font-bold tracking-[-0.04em] text-slate-900">
                  Entrar na plataforma
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Use seu e-mail, CPF ou usuário para acessar o painel da escola.
                </p>
              </div>

              <form onSubmit={handleLogin} className="mt-8 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">
                    Identificação
                  </span>
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
                    <UserRound size={18} className="shrink-0 text-slate-400" />
                    <input
                      type="text"
                      placeholder="E-mail, CPF ou usuário"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="block w-full min-w-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">
                    Senha
                  </span>
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
                    <KeyRound size={18} className="shrink-0 text-slate-400" />
                    <input
                      type="password"
                      placeholder="Sua senha"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full min-w-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </label>

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#2563eb,#1d4ed8)] px-4 py-3.5 text-sm font-bold text-white shadow-[0_18px_30px_rgba(37,99,235,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Entrando..." : "Entrar"}
                  {loading ? null : <ArrowRight size={16} />}
                </button>
              </form>

              <div className="mt-6 rounded-2xl border border-[rgba(37,99,235,0.12)] bg-[rgba(255,255,255,0.72)] px-4 py-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Acesso protegido por perfil</p>
                <p className="mt-1 leading-6">
                  O sistema direciona automaticamente cada usuário para a área correta após o login.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function FeatureItem({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-white/16 bg-white/10 px-5 py-4 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/14 text-white">
          <Icon size={18} />
        </div>
        <div>
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-1 text-sm leading-6 text-white/72">{description}</p>
        </div>
      </div>
    </div>
  );
}
