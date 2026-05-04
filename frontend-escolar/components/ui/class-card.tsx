import { formatTurno } from "@/lib/turno";

type ClassCardProps = {
  nome: string;
  turno: string;
  alunos: string;
  professor: string;
};

export default function ClassCard({
  nome,
  turno,
  alunos,
  professor,
}: ClassCardProps) {
  return (
    <div className="card-base p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{nome}</h3>
          <p className="mt-1 text-sm text-slate-500">{formatTurno(turno)}</p>
        </div>

        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
          Ativa
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Quantidade de alunos</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{alunos}</p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Professor responsável</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {professor}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Ver turma
        </button>
        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
          Editar
        </button>
      </div>
    </div>
  );
}
