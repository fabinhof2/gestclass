"use client";

import { FormEvent, useEffect, useState } from "react";
import { IdCard, LockKeyhole, Moon, Palette, Save, Sun, UserCog } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import {
  applyGestClassTheme,
  THEME_STORAGE_KEY,
} from "@/components/theme/theme-provider";
import { apiUrl } from "@/lib/api";

type ConfigView = "inicio" | "senha" | "tema" | "acesso";
type ThemeMode = "light" | "dark";

const colorOptions = [
  { name: "Azul", primary: "#2563eb", secondary: "#7c3aed" },
  { name: "Verde", primary: "#059669", secondary: "#0f766e" },
  { name: "Roxo", primary: "#7c3aed", secondary: "#db2777" },
  { name: "Vermelho", primary: "#dc2626", secondary: "#f97316" },
  { name: "Ciano", primary: "#0891b2", secondary: "#2563eb" },
  { name: "Grafite", primary: "#334155", secondary: "#0f172a" },
];

export default function ConfiguracaoPage() {
  const { token } = useAuth();

  const [view, setView] = useState<ConfigView>("inicio");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessUsername, setAccessUsername] = useState("");
  const [accessCpf, setAccessCpf] = useState("");
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [primaryColor, setPrimaryColor] = useState(colorOptions[0].primary);
  const [secondaryColor, setSecondaryColor] = useState(colorOptions[0].secondary);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (!stored) return;

      const theme = JSON.parse(stored);
      setThemeMode(theme.mode || "light");
      setPrimaryColor(theme.primary || colorOptions[0].primary);
      setSecondaryColor(theme.secondary || colorOptions[0].secondary);
    } catch {
      return;
    }
  }, []);

  function showView(nextView: ConfigView) {
    setView(nextView);
    setError("");
    setSuccess("");

    if (nextView === "acesso") {
      void fetchAcesso();
    }
  }

  async function fetchAcesso() {
    if (!token) return;

    try {
      setLoadingAccess(true);

      const res = await fetch(apiUrl("/users/me/access"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar acesso");
      }

      setAccessEmail("");
      setAccessUsername("");
      setAccessCpf("");
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados de acesso.");
    } finally {
      setLoadingAccess(false);
    }
  }

  async function handleAlterarSenha(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setError("Preencha todos os campos.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setError("A confirmação de senha não confere.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(apiUrl("/users/change-password"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          senhaAtual,
          novaSenha,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao alterar senha");
      }

      setSuccess("Senha alterada com sucesso.");
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (err: any) {
      setError(err.message || "Erro ao alterar senha");
    } finally {
      setLoading(false);
    }
  }

  function handleSalvarTema() {
    const theme = {
      mode: themeMode,
      primary: primaryColor,
      secondary: secondaryColor,
    };

    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
    applyGestClassTheme(theme);
    setError("");
    setSuccess("Aparência atualizada.");
  }

  async function handleSalvarAcesso(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      setLoading(true);

      const payload: {
        username?: string;
        cpf?: string;
      } = {};

      if (accessUsername.trim()) {
        payload.username = accessUsername.trim();
      }

      if (accessCpf.trim()) {
        payload.cpf = accessCpf.trim();
      }

      if (!payload.username && !payload.cpf) {
        setError("Digite um CPF ou usuário para atualizar o acesso.");
        return;
      }

      const res = await fetch(apiUrl("/users/me/access"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao salvar acesso");
      }

      setAccessEmail("");
      setAccessUsername("");
      setAccessCpf("");
      setSuccess("Dados de acesso atualizados.");
    } catch (err: any) {
      setError(err.message || "Erro ao salvar dados de acesso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie segurança, aparência e preferências da conta."
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => showView("acesso")}
          className={`card-base flex items-center gap-4 p-5 text-left transition hover:border-blue-200 hover:bg-blue-50 ${
            view === "acesso" ? "ring-2 ring-blue-500" : ""
          }`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <UserCog size={20} />
          </span>
          <span>
            <span className="block text-base font-bold text-slate-900">
              Meu acesso
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              Configure CPF e usuário para entrar.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => showView("senha")}
          className={`card-base flex items-center gap-4 p-5 text-left transition hover:border-blue-200 hover:bg-blue-50 ${
            view === "senha" ? "ring-2 ring-blue-500" : ""
          }`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
            <LockKeyhole size={20} />
          </span>
          <span>
            <span className="block text-base font-bold text-slate-900">
              Alterar senha
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              Atualize sua senha de acesso.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => showView("tema")}
          className={`card-base flex items-center gap-4 p-5 text-left transition hover:border-blue-200 hover:bg-blue-50 ${
            view === "tema" ? "ring-2 ring-blue-500" : ""
          }`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Palette size={20} />
          </span>
          <span>
            <span className="block text-base font-bold text-slate-900">
              Ajuste de cores do site
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              Escolha cores e modo diurno ou noturno.
            </span>
          </span>
        </button>
      </div>

      {view === "inicio" ? (
        <div className="card-base p-5 text-sm text-slate-600">
          Selecione uma opção acima para configurar sua conta.
        </div>
      ) : null}

      {view === "acesso" ? (
        <form onSubmit={handleSalvarAcesso} className="card-base max-w-2xl p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Meu acesso
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Você poderá entrar usando e-mail, CPF ou usuário, junto com sua senha.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              E-mail atual
              <input
                type="email"
                value={accessEmail}
                disabled
                className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700"
                placeholder="E-mail salvo e oculto"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Usuário de acesso
              <div className="relative mt-2">
                <UserCog
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={accessUsername}
                  onChange={(event) => setAccessUsername(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 text-sm outline-none focus:border-slate-500"
                  placeholder="Usuário salvo e oculto. Digite outro para alterar."
                />
              </div>
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Use letras, números, ponto, hífen ou underline.
              </span>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              CPF de acesso
              <div className="relative mt-2">
                <IdCard
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={accessCpf}
                  onChange={(event) => setAccessCpf(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 text-sm outline-none focus:border-slate-500"
                  placeholder="CPF salvo e oculto. Digite outro para alterar."
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={loading || loadingAccess}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Save size={16} />
              {loading || loadingAccess ? "Salvando..." : "Salvar acesso"}
            </button>
          </div>
        </form>
      ) : null}

      {view === "senha" ? (
        <form onSubmit={handleAlterarSenha} className="card-base max-w-xl p-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Alterar senha
          </h2>

          <div className="space-y-4">
            <input
              type="password"
              placeholder="Senha atual"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />

            <input
              type="password"
              placeholder="Nova senha"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />

            <input
              type="password"
              placeholder="Confirmar nova senha"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar nova senha"}
            </button>
          </div>
        </form>
      ) : null}

      {view === "tema" ? (
        <div className="card-base max-w-3xl space-y-6 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Ajuste de cores do site
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A aparência fica salva neste navegador.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Modo</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setThemeMode("light")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                  themeMode === "light"
                    ? "bg-blue-600 text-white"
                    : "border border-slate-300 text-slate-700"
                }`}
              >
                <Sun size={16} />
                Diurno
              </button>
              <button
                type="button"
                onClick={() => setThemeMode("dark")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                  themeMode === "dark"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-700"
                }`}
              >
                <Moon size={16} />
                Noturno
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Paletas
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {colorOptions.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  onClick={() => {
                    setPrimaryColor(option.primary);
                    setSecondaryColor(option.secondary);
                  }}
                  className={`rounded-xl border p-3 text-left transition ${
                    primaryColor === option.primary
                      ? "border-blue-500 ring-2 ring-blue-100"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="mb-3 flex gap-2">
                    <span
                      className="h-7 w-7 rounded-full"
                      style={{ backgroundColor: option.primary }}
                    />
                    <span
                      className="h-7 w-7 rounded-full"
                      style={{ backgroundColor: option.secondary }}
                    />
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {option.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Cor principal
              <input
                type="color"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white p-1"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Cor secundária
              <input
                type="color"
                value={secondaryColor}
                onChange={(event) => setSecondaryColor(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white p-1"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleSalvarTema}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Save size={16} />
            Salvar aparência
          </button>
        </div>
      ) : null}
    </section>
  );
}
