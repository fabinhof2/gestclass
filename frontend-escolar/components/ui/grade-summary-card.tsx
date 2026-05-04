type GradeSummaryCardProps = {
  disciplina: string;
  media: string;
  frequencia: string;
  status: string;
};

export default function GradeSummaryCard({
  disciplina,
  media,
  frequencia,
  status,
}: GradeSummaryCardProps) {
  const statusColor =
    status === "Aprovado"
      ? "bg-emerald-50 text-emerald-600"
      : status === "Recuperação"
      ? "bg-amber-50 text-amber-600"
      : "bg-red-50 text-red-600";

  return (
    <div className="card-base p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{disciplina}</h3>
          <p className="mt-1 text-sm text-slate-500">
            Frequência: {frequencia}
          </p>
        </div>

        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>
          {status}
        </span>
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 p-4">
        <p className="text-xs text-slate-500">Média atual</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{media}</p>
      </div>

      <div className="mt-4 flex gap-2">
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Ver detalhes
        </button>

        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
          Lançar nota
        </button>
      </div>
    </div>
  );
}