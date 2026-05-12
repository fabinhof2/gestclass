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

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: "24px 16px",
    background:
      "linear-gradient(135deg, rgb(238, 244, 255) 0%, rgb(246, 249, 255) 46%, rgb(223, 234, 255) 100%)",
    position: "relative",
    overflowX: "hidden",
    fontFamily: '"Segoe UI", "Inter", sans-serif',
  };

  const shellStyle: React.CSSProperties = {
    position: "relative",
    margin: "0 auto",
    maxWidth: "1100px",
    minHeight: "calc(100vh - 48px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "980px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 420px)",
    overflow: "hidden",
    borderRadius: "32px",
    border: "1px solid rgba(255,255,255,0.5)",
    background: "rgba(255, 252, 247, 0.82)",
    boxShadow: "0 24px 70px rgba(73,92,111,0.14)",
    backdropFilter: "blur(18px)",
  };

  const heroStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "40px 32px",
    color: "#fff",
    background:
      "linear-gradient(160deg, rgba(30,64,175,0.97), rgba(37,99,235,0.99))",
  };

  const formWrapStyle: React.CSSProperties = {
    padding: "40px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
  };

  const inputRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    borderRadius: "18px",
    border: "1px solid rgb(226,232,240)",
    background: "rgba(255,255,255,0.92)",
    padding: "14px 16px",
    boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: "14px",
    color: "#1e293b",
  };

  const primaryButtonStyle: React.CSSProperties = {
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    border: "none",
    borderRadius: "18px",
    background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
    padding: "14px 16px",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 700,
    boxShadow: "0 18px 30px rgba(37,99,235,0.24)",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.6 : 1,
  };

  return (
    <main style={pageStyle}>
      <style>
        {`
          .login-shell {
            position: relative;
            margin: 0 auto;
            max-width: 1100px;
            min-height: calc(100vh - 48px);
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .login-card {
            width: 100%;
            max-width: 980px;
            display: grid;
            grid-template-columns: minmax(0, 1.1fr) minmax(320px, 420px);
            overflow: hidden;
            border-radius: 32px;
            border: 1px solid rgba(255,255,255,0.5);
            background: rgba(255, 252, 247, 0.82);
            box-shadow: 0 24px 70px rgba(73,92,111,0.14);
            backdrop-filter: blur(18px);
          }

          .login-hero {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 40px 32px;
            color: #fff;
            background: linear-gradient(160deg, rgba(30,64,175,0.97), rgba(37,99,235,0.99));
          }

          .login-form-wrap {
            padding: 40px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-width: 0;
          }

          .login-title {
            margin-top: 8px;
            margin-bottom: 0;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 48px;
            font-weight: 700;
            letter-spacing: -0.04em;
            color: #0f172a;
            line-height: 0.95;
          }

          @media (max-width: 767px) {
            .login-shell {
              min-height: auto;
              align-items: stretch;
            }

            .login-card {
              grid-template-columns: minmax(0, 1fr);
              border-radius: 24px;
            }

            .login-hero {
              display: none;
            }

            .login-form-wrap {
              padding: 28px 20px;
            }

            .login-title {
              font-size: 34px;
              line-height: 1;
            }
          }
        `}
      </style>
      <div aria-hidden style={{ pointerEvents: "none", position: "absolute", inset: 0 }}>
        <div
          style={{
            position: "absolute",
            left: "-64px",
            top: "-32px",
            width: "224px",
            height: "224px",
            borderRadius: "999px",
            background: "rgba(59,130,246,0.16)",
            filter: "blur(56px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "-32px",
            bottom: "-48px",
            width: "288px",
            height: "288px",
            borderRadius: "999px",
            background: "rgba(96,165,250,0.2)",
            filter: "blur(64px)",
          }}
        />
      </div>

      <div className="login-shell" style={shellStyle}>
        <div className="login-card" style={{ ...cardStyle, gridTemplateColumns: undefined }}>
          <section className="login-hero" style={{ ...heroStyle, display: undefined, flexDirection: undefined, justifyContent: undefined, padding: undefined, background: undefined }}>
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.1)",
                  padding: "6px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.24em",
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                GestClass
              </div>
              <h1
                style={{
                  marginTop: "24px",
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: "56px",
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  marginBottom: 0,
                }}
              >
                Gestão escolar com acesso claro em qualquer tela.
              </h1>
              <p
                style={{
                  marginTop: "20px",
                  maxWidth: "520px",
                  fontSize: "16px",
                  lineHeight: 1.75,
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                Entre na sua plataforma para acompanhar escolas, turmas, comunicação,
                notas e rotinas administrativas com uma experiência mais organizada.
              </p>
            </div>

            <div style={{ display: "grid", gap: "16px" }}>
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

          <section className="login-form-wrap" style={{ ...formWrapStyle, padding: undefined, display: undefined, flexDirection: undefined, justifyContent: undefined }}>
            <div style={{ margin: "0 auto", display: "flex", width: "100%", maxWidth: "420px", flexDirection: "column" }}>
              <div>
                <div
                  style={{
                    display: "flex",
                    width: "64px",
                    height: "64px",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "22px",
                    background: "linear-gradient(135deg,#2563eb,#60a5fa)",
                    color: "#fff",
                    fontSize: "20px",
                    fontWeight: 900,
                    boxShadow: "0 18px 32px rgba(37,99,235,0.28)",
                  }}
                >
                  GC
                </div>

                <p style={{ marginTop: "20px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.28em", color: "#2f6c67" }}>
                  GestClass
                </p>
                <h2 className="login-title">
                  Entrar na plataforma
                </h2>
                <p style={{ marginTop: "12px", fontSize: "14px", lineHeight: 1.7, color: "#64748b" }}>
                  Use seu e-mail, CPF ou usuário para acessar o painel da escola.
                </p>
              </div>

              <form onSubmit={handleLogin} style={{ marginTop: "32px", display: "grid", gap: "16px" }}>
                <label style={{ display: "block" }}>
                  <span style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                    Identificação
                  </span>
                  <div style={inputRowStyle}>
                    <UserRound size={18} style={{ flexShrink: 0, color: "#94a3b8" }} />
                    <input
                      type="text"
                      placeholder="E-mail, CPF ou usuário"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </label>

                <label style={{ display: "block" }}>
                  <span style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                    Senha
                  </span>
                  <div style={inputRowStyle}>
                    <KeyRound size={18} style={{ flexShrink: 0, color: "#94a3b8" }} />
                    <input
                      type="password"
                      placeholder="Sua senha"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </label>

                {error ? (
                  <div style={{ borderRadius: "18px", border: "1px solid #fecaca", background: "#fef2f2", padding: "12px 16px", fontSize: "14px", fontWeight: 600, color: "#b91c1c" }}>
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  style={primaryButtonStyle}
                >
                  {loading ? "Entrando..." : "Entrar"}
                  {loading ? null : <ArrowRight size={16} />}
                </button>
              </form>

              <div style={{ marginTop: "24px", borderRadius: "18px", border: "1px solid rgba(37,99,235,0.12)", background: "rgba(255,255,255,0.72)", padding: "16px", fontSize: "14px", color: "#475569" }}>
                <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>Acesso protegido por perfil</p>
                <p style={{ marginTop: "4px", lineHeight: 1.7 }}>
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
    <div style={{ borderRadius: "26px", border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.1)", padding: "16px 20px", backdropFilter: "blur(8px)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ display: "flex", width: "44px", height: "44px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "18px", background: "rgba(255,255,255,0.14)", color: "#fff" }}>
          <Icon size={18} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#fff" }}>{title}</p>
          <p style={{ marginTop: "4px", fontSize: "14px", lineHeight: 1.7, color: "rgba(255,255,255,0.72)" }}>{description}</p>
        </div>
      </div>
    </div>
  );
}
