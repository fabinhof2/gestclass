type GradeRow = {
  aluno: string;
  disciplina?: string;
  bimestre: string;
  nota: string;
  frequencia: string;
  status: string;
};

type GradesTableProps = {
  rows: GradeRow[];
  showDiscipline?: boolean;
  showActions?: boolean;
  actionLabel?: string;
};

export default function GradesTable({
  rows,
  showDiscipline = false,
  showActions = false,
  actionLabel = "Ver detalhes",
}: GradesTableProps) {
  return (
    <div className="card-base overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                Aluno
              </th>

              {showDiscipline && (
                <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                  Disciplina
                </th>
              )}

              <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                Período
              </th>
              <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                Nota
              </th>
              <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                Frequência
              </th>
              <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                Status
              </th>

              {showActions && (
                <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                  Ação
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.aluno}-${index}`} className="border-t border-slate-200">
                <td className="px-4 py-4 text-sm font-medium text-slate-900">
                  {row.aluno}
                </td>

                {showDiscipline && (
                  <td className="px-4 py-4 text-sm text-slate-600">
                    {row.disciplina}
                  </td>
                )}

                <td className="px-4 py-4 text-sm text-slate-600">{row.bimestre}</td>
                <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                  {row.nota}
                </td>
                <td className="px-4 py-4 text-sm text-slate-600">
                  {row.frequencia}
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      row.status === "Aprovado"
                        ? "bg-emerald-50 text-emerald-600"
                        : row.status === "Recuperação"
                        ? "bg-amber-50 text-amber-600"
                        : row.status === "Risco"
                        ? "bg-red-50 text-red-600"
                        : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>

                {showActions && (
                  <td className="px-4 py-4">
                    <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                      {actionLabel}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}