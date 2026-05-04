type RowData = {
  col1: string;
  col2: string;
  col3: string;
  col4: string;
};

type SimpleDataTableProps = {
  title: string;
  col1Label: string;
  col2Label: string;
  col3Label: string;
  col4Label: string;
  rows: RowData[];
  actionLabel?: string;
};

export default function SimpleDataTable({
  title,
  col1Label,
  col2Label,
  col3Label,
  col4Label,
  rows,
  actionLabel = "Editar",
}: SimpleDataTableProps) {
  return (
    <div className="card-base overflow-hidden">
      <div className="border-b border-slate-200 px-6 py-4">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                {col1Label}
              </th>
              <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                {col2Label}
              </th>
              <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                {col3Label}
              </th>
              <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                {col4Label}
              </th>
              <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                Ação
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-200">
                <td className="px-4 py-4 text-sm font-medium text-slate-900">
                  {row.col1}
                </td>
                <td className="px-4 py-4 text-sm text-slate-600">{row.col2}</td>
                <td className="px-4 py-4 text-sm text-slate-600">{row.col3}</td>
                <td className="px-4 py-4 text-sm text-slate-600">{row.col4}</td>
                <td className="px-4 py-4">
                  <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                    {actionLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}