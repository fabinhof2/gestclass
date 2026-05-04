const days = [
  { day: "03/02", label: "Aula", status: "pending" },
  { day: "05/02", label: "Aula", status: "planned" },
  { day: "10/02", label: "Aula", status: "pending" },
  { day: "12/02", label: "Aula", status: "planned" },
  { day: "17/02", label: "Aula", status: "pending" },
  { day: "19/02", label: "Aula", status: "planned" },
  { day: "24/02", label: "Aula", status: "pending" },
  { day: "26/02", label: "Aula", status: "planned" },
  { day: "03/03", label: "Aula", status: "pending" },
  { day: "05/03", label: "Aula", status: "planned" },
  { day: "10/03", label: "Aula", status: "pending" },
  { day: "12/03", label: "Aula", status: "planned" },
];

export default function PlanningCalendar() {
  return (
    <div className="card-base p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Calendário anual da turma
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Os dias em azul faltam planejamento. Os dias em verde já estão planejados.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full bg-blue-600"></span>
            <span className="text-sm text-slate-600">Falta planejar</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full bg-emerald-600"></span>
            <span className="text-sm text-slate-600">Planejado</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {days.map((item) => (
          <button
            key={item.day}
            className={`rounded-2xl p-4 text-left transition ${
              item.status === "planned"
                ? "bg-emerald-50 border border-emerald-200"
                : "bg-blue-50 border border-blue-200"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                item.status === "planned" ? "text-emerald-700" : "text-blue-700"
              }`}
            >
              {item.day}
            </p>
            <p className="mt-1 text-xs text-slate-500">{item.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}