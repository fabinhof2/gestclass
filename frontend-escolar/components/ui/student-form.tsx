export default function StudentForm() {
  return (
    <div className="card-base p-6">
      <h3 className="text-lg font-bold text-slate-900">Cadastrar aluno</h3>
      <p className="mt-1 text-sm text-slate-500">
        Preencha os dados básicos para cadastrar um novo aluno no sistema.
      </p>

      <form className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Nome completo
          </label>
          <input
            type="text"
            placeholder="Digite o nome do aluno"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            E-mail
          </label>
          <input
            type="email"
            placeholder="aluno@escola.com"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Turma
          </label>
          <select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none">
            <option>Selecione a turma</option>
            <option>6º Ano C</option>
            <option>7º Ano B</option>
            <option>8º Ano A</option>
            <option>9º Ano A</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Responsável
          </label>
          <input
            type="text"
            placeholder="Nome do responsável"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none">
            <option>Ativo</option>
            <option>Em atenção</option>
            <option>Inativo</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Matrícula
          </label>
          <input
            type="text"
            placeholder="Número da matrícula"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div className="md:col-span-2 flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            Salvar aluno
          </button>

          <button
            type="button"
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}