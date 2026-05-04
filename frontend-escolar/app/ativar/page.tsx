"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { apiUrl } from "@/lib/api";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function AtivarContaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleActivate() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        apiUrl("/auth/activate-account"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            newPassword: password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao ativar conta");
      }

      setMessage("Conta ativada com sucesso!");

    } catch (err) {
      setError(getErrorMessage(err, "Erro ao ativar conta"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white text-xl font-bold">
            E
          </div>

          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Ativar sua conta
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Defina uma senha para acessar o sistema.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {!token && (
            <p className="text-sm text-red-500 text-center">
              Token inválido ou não informado.
            </p>
          )}

          <input
            type="password"
            placeholder="Digite sua nova senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={handleActivate}
            disabled={loading || !token}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? "Ativando..." : "Ativar conta"}
          </button>

          {message && (
            <div className="text-green-600 text-sm text-center">
              {message}
            </div>
          )}

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          {message && (
            <button
              onClick={() => router.push("/login")}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition"
            >
              Ir para login
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export default function AtivarContaPage() {
  return (
    <Suspense fallback={null}>
      <AtivarContaContent />
    </Suspense>
  );
}
