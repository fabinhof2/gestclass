type ReportCardProps = {
  aluno: string;
  turma: string;
  mediaGeral: string;
  frequencia: string;
  situacao: string;
};

export default function ReportCard({
  aluno,
  turma,
  mediaGeral,
  frequencia,
  situacao,
}: ReportCardProps) {
  const color =
    situacao === "Aprovado"
      ? "bg-emerald-50 text-emerald-700"
      : situacao === "Recuperação"
      ? "bg-amber-50 text-amber-700"
      : "bg-red-50 text-red-700";

  return (
    <div className="card-base p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{aluno}</h3>
          <p className="mt-1 text-sm text-slate-500">{turma}</p>
        </div>

        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${color}`}>
          {situacao}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Média geral</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{mediaGeral}</p>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Frequência</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{frequencia}</p>
        </div>
      </div>
    </div>
  );
}