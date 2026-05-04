export default function PlanningForm() {
  return (
    <div className="card-base p-6">
      <h3 className="text-lg font-bold text-slate-900">
        Planejamento da aula selecionada
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Preencha o planejamento base da turma e depois replique para outras turmas da mesma série, se quiser.
      </p>

      <form className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Turma base
          </label>
          <select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none">
            <option>8º Ano A</option>
            <option>8º Ano B</option>
            <option>8º Ano C</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Data da aula
          </label>
          <input
            type="text"
            placeholder="Ex.: 10/03/2026"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Conteúdo
          </label>
          <textarea
            placeholder="Descreva o conteúdo trabalhado"
            className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Objetivos
          </label>
          <textarea
            placeholder="Descreva os objetivos da aula"
            className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Metodologia
          </label>
          <textarea
            placeholder="Descreva a metodologia"
            className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Atividade
          </label>
          <textarea
            placeholder="Descreva a atividade da aula"
            className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Anexo da atividade
          </label>
          <input
            type="file"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            Aceitar DOC, PDF ou JPG.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Link do YouTube
          </label>
          <input
            type="text"
            placeholder="Cole o link do vídeo"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Replicar para outras turmas da mesma série
          </label>
          <select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none">
            <option>Não replicar</option>
            <option>Replicar para 8º Ano B</option>
            <option>Replicar para 8º Ano C</option>
            <option>Replicar para todas do 8º ano</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Status da aula
          </label>
          <select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none">
            <option>Planejada</option>
            <option>Realizada</option>
            <option>Replanejada</option>
          </select>
        </div>

        <div className="md:col-span-2 flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            Salvar planejamento
          </button>

          <button
            type="button"
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Marcar como realizada
          </button>

          <button
            type="button"
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Replicar planejamento
          </button>
        </div>
      </form>
    </div>
  );
}