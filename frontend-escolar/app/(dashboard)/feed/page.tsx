"use client";

import { MessageCircle, Radio, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";

export default function FeedPage() {
  const { token } = useAuth();
  const [badges, setBadges] = useState({ social: 0, chat: 0 });

  useEffect(() => {
    async function fetchResumo() {
      if (!token) return;

      try {
        const response = await fetch(apiUrl("/comunicacao/resumo"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();

        if (!response.ok) return;

        const social = Number(data?.social || 0);
        const chat = Number(data?.chat || 0);
        const seenSocial = Number(
          localStorage.getItem("gestclass_social_seen") || 0,
        );
        const seenChat = Number(localStorage.getItem("gestclass_chat_seen") || 0);

        setBadges({
          social: Math.max(social - seenSocial, 0),
          chat: Math.max(chat - seenChat, 0),
        });
      } catch {}
    }

    fetchResumo();
  }, [token]);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Comunicação"
        description="Acesse a rede social privada da escola ou o chat interno das turmas."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/feed/rede-social"
          className="card-base group relative flex min-h-48 flex-col justify-between p-6 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg"
        >
          {badges.social > 0 ? (
            <span className="absolute bottom-3 left-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
              {badges.social > 99 ? "99+" : badges.social}
            </span>
          ) : null}
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Radio size={22} />
            </div>
            <h2 className="mt-5 text-xl font-bold text-slate-900">
              Rede social privada
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Publique avisos, fotos, vídeos e mensagens para alunos,
              professores e membros autorizados de cada turma.
            </p>
          </div>
          <span className="mt-5 text-sm font-semibold text-blue-600 group-hover:text-blue-700">
            Entrar na comunidade
          </span>
        </Link>

        <Link
          href="/feed/chat"
          className="card-base group relative flex min-h-48 flex-col justify-between p-6 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg"
        >
          {badges.chat > 0 ? (
            <span className="absolute bottom-3 left-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
              {badges.chat > 99 ? "99+" : badges.chat}
            </span>
          ) : null}
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <MessageCircle size={22} />
            </div>
            <h2 className="mt-5 text-xl font-bold text-slate-900">
              Chat interno
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Converse com a turma, professores e gestão dentro dos grupos
              privados da plataforma.
            </p>
          </div>
          <span className="mt-5 text-sm font-semibold text-emerald-600 group-hover:text-emerald-700">
            Abrir chat
          </span>
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 text-slate-500" size={20} />
          <p className="text-sm leading-6 text-slate-600">
            Os grupos são formados pelos alunos da turma, professores e gestão.
            Professores e gestão podem incluir outros usuários ativos da mesma
            escola. Alunos participam, publicam e conversam, mas não adicionam
            membros.
          </p>
        </div>
      </div>
    </section>
  );
}
