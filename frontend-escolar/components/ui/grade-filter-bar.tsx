type GradeFilterBarProps = {
  turmaLabel?: string;
  disciplinaLabel?: string;
  bimestreLabel?: string;
  buttonLabel?: string;
};

export default function GradeFilterBar({
  turmaLabel = "Turma",
  disciplinaLabel = "Disciplina",
  bimestreLabel = "Bimestre",
  buttonLabel = "Aplicar filtros",
}: GradeFilterBarProps) {
  return (
    <div className="card-base p-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <select className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none">
          <option>{turmaLabel}</option>
          <option>6º Ano C</option>
          <option>7º Ano B</option>
          <option>8º Ano A</option>
          <option>9º Ano A</option>
        </select>

        <select className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none">
          <option>{disciplinaLabel}</option>
          <option>Matemática</option>
          <option>Português</option>
          <option>História</option>
          <option>Ciências</option>
        </select>

        <select className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none">
          <option>{bimestreLabel}</option>
          <option>1º Bimestre</option>
          <option>2º Bimestre</option>
          <option>3º Bimestre</option>
          <option>4º Bimestre</option>
          <option>Resumo anual</option>
        </select>

        <button className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition">
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}