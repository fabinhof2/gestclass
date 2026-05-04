export default function ClassForm() {
  return (
    <div className="card-base p-6">
      <h3 className="text-lg font-bold text-slate-900">Cadastrar turma</h3>
      <p className="mt-1 text-sm text-slate-500">
        Preencha os dados da turma para organização acadêmica.
      </p>

      <form className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Nome da turma
          </label>
          <input
            type="text"
            placeholder="Ex.: 8º Ano A"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Turno
          </label>
          <select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none">
            <option>Selecione o turno</option>
            <option>Matutino</option>
            <option>Vespertino</option>
            <option>Noturno</option>
            <option>Integral</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Professor responsável
          </label>
          <input
            type="text"
            placeholder="Nome do professor"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Capacidade máxima
          </label>
          <input
            type="number"
            placeholder="Ex.: 35"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Ano letivo
          </label>
          <input
            type="text"
            placeholder="Ex.: 2026"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none">
            <option>Ativa</option>
            <option>Em planejamento</option>
            <option>Encerrada</option>
          </select>
        </div>

        <div className="md:col-span-2 flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            Salvar turma
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
