"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Pencil,
  Trash2,
  FileText,
  RefreshCw,
  BookOpen,
  CalendarDays,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StudentCardAction = {
  title: string;
  icon: LucideIcon;
  onClick?: () => void;
  className?: string;
};

type StudentCardProps = {
  name: string;
  turma: string;
  status: string;
  media: string;
  responsavel: string;
  responsavelId?: string;
  canOpenResponsavel?: boolean;
  imageUrl?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewDocumentos?: () => void;
  onViewBoletim?: () => void;
  onViewGradeHoraria?: () => void;
  onViewStatus?: () => void;
  showDocumentosAction?: boolean;
  showBoletimAction?: boolean;
  showGradeHorariaAction?: boolean;
  canEdit?: boolean;
  showStatusAction?: boolean;
  customActions?: StudentCardAction[];
};

export default function StudentCard({
  name,
  turma,
  status,
  media,
  responsavel,
  responsavelId,
  canOpenResponsavel = false,
  imageUrl,
  onEdit,
  onDelete,
  onViewDocumentos,
  onViewBoletim,
  onViewGradeHoraria,
  onViewStatus,
  showDocumentosAction = true,
  showBoletimAction = true,
  showGradeHorariaAction = true,
  canEdit = false,
  showStatusAction = false,
  customActions = [],
}: StudentCardProps) {
  const [imagemAberta, setImagemAberta] = useState(false);

  const statusNormalizado = String(status || "").toUpperCase();
  const isAtivo = statusNormalizado === "ATIVO";
  const initial = String(name || "").trim().charAt(0).toUpperCase();

  const mostrarLinkResponsavel =
    canOpenResponsavel && !!responsavelId && !!String(responsavel || "").trim();

  return (
    <>
      <div className="card-base p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (imageUrl) {
                  setImagemAberta(true);
                }
              }}
              title={imageUrl ? "Clique para ampliar a foto" : "Aluno sem foto"}
              className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-base font-bold text-white shadow-sm ${
                imageUrl ? "cursor-zoom-in" : "cursor-default"
              }`}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={`Foto de ${name}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                initial || "A"
              )}
            </button>

            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-slate-900">
                {name}
              </h3>
              <p className="truncate text-xs text-slate-500">{turma}</p>
            </div>
          </div>

          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              isAtivo
                ? "bg-emerald-50 text-emerald-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {isAtivo ? "ATIVO" : "INATIVO"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-500">Média</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {media}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-500">Responsável</p>

            {mostrarLinkResponsavel ? (
              <Link
                href={`/usuarios/${responsavelId}`}
                className="mt-1 line-clamp-2 text-sm font-semibold text-blue-600 transition hover:text-blue-700 hover:underline"
                title="Abrir detalhes do responsável"
              >
                {responsavel}
              </Link>
            ) : (
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
                {responsavel}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                title="Editar aluno"
                className="rounded-xl border border-blue-200 bg-white p-2 text-blue-600 transition hover:bg-blue-50"
              >
                <Pencil size={17} />
              </button>

              <button
                type="button"
                onClick={onDelete}
                title="Excluir aluno"
                className="rounded-xl border border-red-200 bg-white p-2 text-red-600 transition hover:bg-red-50"
              >
                <Trash2 size={17} />
              </button>
            </>
          ) : null}

          {showDocumentosAction ? (
          <button
            type="button"
            onClick={onViewDocumentos}
            title="Documentos do aluno"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-50"
          >
            <FileText size={17} />
          </button>
          ) : null}

          {showBoletimAction ? (
          <button
            type="button"
            onClick={onViewBoletim}
            title="Boletim do aluno"
            className="rounded-xl border border-violet-200 bg-white p-2 text-violet-700 transition hover:bg-violet-50"
          >
            <BookOpen size={17} />
          </button>
          ) : null}

          {showGradeHorariaAction ? (
          <button
            type="button"
            onClick={onViewGradeHoraria}
            title="Grade horária da turma"
            className="rounded-xl border border-emerald-200 bg-white p-2 text-emerald-700 transition hover:bg-emerald-50"
          >
            <CalendarDays size={17} />
          </button>
          ) : null}

          {customActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.title}
                type="button"
                onClick={action.onClick}
                title={action.title}
                className={
                  action.className ||
                  "rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-50"
                }
              >
                <Icon size={17} />
              </button>
            );
          })}

          {showStatusAction ? (
            <button
              type="button"
              onClick={onViewStatus}
              title="Alterar status"
              className="rounded-xl border border-amber-200 bg-white p-2 text-amber-700 transition hover:bg-amber-50"
            >
              <RefreshCw size={17} />
            </button>
          ) : null}
        </div>
      </div>

      {imagemAberta && imageUrl ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setImagemAberta(false)}
        >
          <div
            className="relative w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setImagemAberta(false)}
              className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 text-slate-700 shadow hover:bg-white"
              title="Fechar imagem"
            >
              <X size={18} />
            </button>

            <div className="overflow-hidden rounded-3xl bg-white p-3 shadow-2xl">
              <img
                src={imageUrl}
                alt={`Foto ampliada de ${name}`}
                className="max-h-[80vh] w-full rounded-2xl object-contain"
              />
              <p className="mt-3 text-center text-sm font-medium text-slate-700">
                {name}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
