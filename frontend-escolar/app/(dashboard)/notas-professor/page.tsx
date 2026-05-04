"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type MinhaDisciplina = {
  id: string;
  disciplina: string;
  cargaHoraria: number;
  turma: {
    id: string;
    name: string;
    turno?: string;
    school: {
      tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL";
    };
  };
};

type Aluno = {
  id: string;
  name: string;
  matricula?: string | null;
  status?: string;
};

type TipoComposicao = "MEDIA_ARITMETICA" | "SOMATORIO";
type TipoAtividade =
  | "TESTE"
  | "PROVA"
  | "TRABALHO"
  | "ATIVIDADE"
  | "PARTICIPACAO"
  | "OUTRO";

type Periodo = "PRIMEIRO" | "SEGUNDO" | "TERCEIRO" | "QUARTO";

type AtividadeModelo = {
  localId: string;
  ordem: number;
  tipoAtividade: TipoAtividade;
  titulo: string;
  valorMaximo: string;
  permiteRecuperacao: boolean;
};

type AtividadeModeloBackend = {
  id: string;
  periodo: Periodo;
  tipoComposicao: TipoComposicao;
  tipoAtividade: TipoAtividade;
  titulo: string;
  valorMaximo: number;
  ordem: number;
  permiteRecuperacao: boolean;
  enviadoBoletim: boolean;
};

type ItemExistente = {
  id: string;
  alunoId: string;
  atividadeModeloId: string;
  periodo: Periodo;
  nota: number;
  notaRecuperacao: number | null;
  notaConsiderada: number;
  observacao?: string | null;
  enviadoBoletim: boolean;
  atividadeModelo: {
    id: string;
    titulo: string;
    tipoAtividade: TipoAtividade;
    tipoComposicao: TipoComposicao;
    valorMaximo: number;
    ordem: number;
    permiteRecuperacao: boolean;
    enviadoBoletim: boolean;
  };
};

type NotaBoletimExistente = {
  id: string;
  alunoId: string;
  tipoComposicao: TipoComposicao;
  notaFinal: number;
  enviadoBoletim: boolean;
  observacao?: string | null;
};

type NotaAlunoItemForm = {
  ordem: number;
  nota: string;
  notaRecuperacao: string;
  observacao: string;
};

function gerarIdLocal() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function criarAtividadeVazia(ordem: number): AtividadeModelo {
  return {
    localId: gerarIdLocal(),
    ordem,
    tipoAtividade: "ATIVIDADE",
    titulo: "",
    valorMaximo: "10",
    permiteRecuperacao: false,
  };
}

function formatarNota(valor: number) {
  return valor.toFixed(2).replace(".", ",");
}

function converterNumero(valor: string) {
  const numero = Number(String(valor || "").replace(",", "."));
  return Number.isNaN(numero) ? NaN : numero;
}

function labelPeriodo(tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL", periodo: Periodo) {
  if (tipoAvaliacao === "TRIMESTRAL") {
    switch (periodo) {
      case "PRIMEIRO":
        return "1º Trimestre";
      case "SEGUNDO":
        return "2º Trimestre";
      case "TERCEIRO":
        return "3º Trimestre";
      default:
        return periodo;
    }
  }

  switch (periodo) {
    case "PRIMEIRO":
      return "1º Bimestre";
    case "SEGUNDO":
      return "2º Bimestre";
    case "TERCEIRO":
      return "3º Bimestre";
    case "QUARTO":
      return "4º Bimestre";
    default:
      return periodo;
  }
}

function calcularNotaConsiderada(nota: number, notaRecuperacao?: number | null) {
  if (typeof notaRecuperacao !== "number" || Number.isNaN(notaRecuperacao)) {
    return nota;
  }

  return notaRecuperacao > nota ? notaRecuperacao : nota;
}

function calcularNotaFinalAluno(
  itensAluno: NotaAlunoItemForm[],
  atividades: AtividadeModelo[],
  tipoComposicao: TipoComposicao
) {
  const valores: number[] = [];

  for (const item of itensAluno) {
    const atividade = atividades.find((atv) => atv.ordem === item.ordem);
    if (!atividade) continue;

    const nota = converterNumero(item.nota);
    if (Number.isNaN(nota)) continue;

    const notaRecuperacao = atividade.permiteRecuperacao
      ? converterNumero(item.notaRecuperacao)
      : NaN;

    const considerada = calcularNotaConsiderada(
      nota,
      Number.isNaN(notaRecuperacao) ? null : notaRecuperacao
    );

    valores.push(considerada);
  }

  if (!valores.length) return 0;

  const soma = valores.reduce((acc, valor) => acc + valor, 0);

  if (tipoComposicao === "SOMATORIO") {
    return Number(soma.toFixed(2));
  }

  return Number((soma / valores.length).toFixed(2));
}

export default function NotasProfessorPage() {
  const { token, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [minhasDisciplinas, setMinhasDisciplinas] = useState<MinhaDisciplina[]>([]);
  const [turmaProfessorId, setTurmaProfessorId] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("PRIMEIRO");
  const [tipoComposicao, setTipoComposicao] =
    useState<TipoComposicao>("MEDIA_ARITMETICA");
  const [observacaoGeral, setObservacaoGeral] = useState("");

  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [atividades, setAtividades] = useState<AtividadeModelo[]>([
    criarAtividadeVazia(1),
  ]);
  const [notasPorAluno, setNotasPorAluno] = useState<
    Record<string, NotaAlunoItemForm[]>
  >({});
  const [notasBoletim, setNotasBoletim] = useState<NotaBoletimExistente[]>([]);

  const disciplinaSelecionada = useMemo(() => {
    return minhasDisciplinas.find((item) => item.id === turmaProfessorId) || null;
  }, [minhasDisciplinas, turmaProfessorId]);

  const periodosDisponiveis = useMemo(() => {
    if (!disciplinaSelecionada) return [];

    if (disciplinaSelecionada.turma.school.tipoAvaliacao === "TRIMESTRAL") {
      return [
        { value: "PRIMEIRO" as Periodo, label: "1º Trimestre" },
        { value: "SEGUNDO" as Periodo, label: "2º Trimestre" },
        { value: "TERCEIRO" as Periodo, label: "3º Trimestre" },
      ];
    }

    return [
      { value: "PRIMEIRO" as Periodo, label: "1º Bimestre" },
      { value: "SEGUNDO" as Periodo, label: "2º Bimestre" },
      { value: "TERCEIRO" as Periodo, label: "3º Bimestre" },
      { value: "QUARTO" as Periodo, label: "4º Bimestre" },
    ];
  }, [disciplinaSelecionada]);

  const tudoEnviado = useMemo(() => {
    if (!notasBoletim.length) return false;
    return notasBoletim.every((item) => item.enviadoBoletim);
  }, [notasBoletim]);

  const mediaTurma = useMemo(() => {
    const notasFinais = alunos
      .map((aluno) =>
        calcularNotaFinalAluno(
          notasPorAluno[aluno.id] || [],
          atividades,
          tipoComposicao
        )
      )
      .filter((item) => !Number.isNaN(item));

    if (!notasFinais.length) return "-";

    const media =
      notasFinais.reduce((acc, valor) => acc + valor, 0) / notasFinais.length;

    return formatarNota(media);
  }, [alunos, atividades, notasPorAluno, tipoComposicao]);

  async function fetchMinhasDisciplinas() {
    if (!token) return;

    try {
      setLoading(true);
      setError("");

      const res = await fetch(apiUrl("/notas/minhas-disciplinas"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar disciplinas.");
      }

      const lista = Array.isArray(data) ? data : [];
      setMinhasDisciplinas(lista);

      if (lista.length > 0) {
        setTurmaProfessorId(lista[0].id);
        setPeriodo("PRIMEIRO");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar disciplinas.");
    } finally {
      setLoading(false);
    }
  }

  function montarNotasVaziasParaAluno(alunoId: string, atividadesBase: AtividadeModelo[]) {
    return atividadesBase
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((atividade) => ({
        ordem: atividade.ordem,
        nota: "",
        notaRecuperacao: "",
        observacao: "",
      }));
  }

  async function fetchAlunosDaDisciplina() {
    if (!token || !turmaProfessorId || !periodo) {
      setAlunos([]);
      setAtividades([criarAtividadeVazia(1)]);
      setNotasPorAluno({});
      setNotasBoletim([]);
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        apiUrl(`/notas/turma-professor/${turmaProfessorId}/alunos?periodo=${periodo}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar dados.");
      }

      const alunosRecebidos: Aluno[] = Array.isArray(data.alunos) ? data.alunos : [];
      const atividadesBackend: AtividadeModeloBackend[] = Array.isArray(data.atividadesModelos)
        ? data.atividadesModelos
        : [];
      const itensRecebidos: ItemExistente[] = Array.isArray(data.itens) ? data.itens : [];
      const notasRecebidas: NotaBoletimExistente[] = Array.isArray(data.notasBoletim)
        ? data.notasBoletim
        : [];

      setAlunos(alunosRecebidos);
      setNotasBoletim(notasRecebidas);

      const tipoComposicaoBackend =
        atividadesBackend[0]?.tipoComposicao ||
        notasRecebidas[0]?.tipoComposicao ||
        "MEDIA_ARITMETICA";

      setTipoComposicao(tipoComposicaoBackend);

      const atividadesMapeadas: AtividadeModelo[] = atividadesBackend.length
        ? atividadesBackend
            .slice()
            .sort((a, b) => a.ordem - b.ordem)
            .map((atividade) => ({
              localId: atividade.id,
              ordem: atividade.ordem,
              tipoAtividade: atividade.tipoAtividade,
              titulo: atividade.titulo,
              valorMaximo: String(atividade.valorMaximo).replace(".", ","),
              permiteRecuperacao: atividade.permiteRecuperacao,
            }))
        : [criarAtividadeVazia(1)];

      setAtividades(atividadesMapeadas);

      const novoMapaNotas: Record<string, NotaAlunoItemForm[]> = {};
      let observacaoGeralEncontrada = "";

      for (const aluno of alunosRecebidos) {
        const itensAluno = itensRecebidos
          .filter((item) => item.alunoId === aluno.id)
          .sort((a, b) => a.atividadeModelo.ordem - b.atividadeModelo.ordem);

        const notaBoletimAluno = notasRecebidas.find((item) => item.alunoId === aluno.id);

        if (!observacaoGeralEncontrada && notaBoletimAluno?.observacao) {
          observacaoGeralEncontrada = notaBoletimAluno.observacao;
        }

        if (itensAluno.length) {
          novoMapaNotas[aluno.id] = atividadesMapeadas.map((atividade) => {
            const itemExistente = itensAluno.find(
              (item) => item.atividadeModelo.ordem === atividade.ordem
            );

            return {
              ordem: atividade.ordem,
              nota: itemExistente ? String(itemExistente.nota).replace(".", ",") : "",
              notaRecuperacao:
                itemExistente && itemExistente.notaRecuperacao !== null
                  ? String(itemExistente.notaRecuperacao).replace(".", ",")
                  : "",
              observacao: itemExistente?.observacao || "",
            };
          });
        } else {
          novoMapaNotas[aluno.id] = montarNotasVaziasParaAluno(aluno.id, atividadesMapeadas);
        }
      }

      setObservacaoGeral(observacaoGeralEncontrada);
      setNotasPorAluno(novoMapaNotas);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  function sincronizarNotasComAtividades(atividadesAtualizadas: AtividadeModelo[]) {
    setNotasPorAluno((prev) => {
      const novoEstado: Record<string, NotaAlunoItemForm[]> = {};

      for (const aluno of alunos) {
        const atuais = prev[aluno.id] || [];

        novoEstado[aluno.id] = atividadesAtualizadas
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .map((atividade) => {
            const existente = atuais.find((item) => item.ordem === atividade.ordem);

            return {
              ordem: atividade.ordem,
              nota: existente?.nota || "",
              notaRecuperacao: atividade.permiteRecuperacao
                ? existente?.notaRecuperacao || ""
                : "",
              observacao: existente?.observacao || "",
            };
          });
      }

      return novoEstado;
    });
  }

  function adicionarAtividade() {
    const proximaOrdem =
      atividades.length > 0
        ? Math.max(...atividades.map((atividade) => atividade.ordem)) + 1
        : 1;

    const novasAtividades = [...atividades, criarAtividadeVazia(proximaOrdem)];
    setAtividades(novasAtividades);
    sincronizarNotasComAtividades(novasAtividades);
  }

  function removerAtividade(localId: string) {
    const filtradas = atividades.filter((atividade) => atividade.localId !== localId);

    const novasAtividades =
      filtradas.length > 0
        ? filtradas.map((atividade, index) => ({
            ...atividade,
            ordem: index + 1,
          }))
        : [criarAtividadeVazia(1)];

    setAtividades(novasAtividades);
    sincronizarNotasComAtividades(novasAtividades);
  }

  function atualizarAtividade(
    localId: string,
    campo: keyof Omit<AtividadeModelo, "localId" | "ordem">,
    valor: string | boolean
  ) {
    const novasAtividades = atividades.map((atividade) =>
      atividade.localId === localId
        ? {
            ...atividade,
            [campo]: valor,
          }
        : atividade
    );

    setAtividades(novasAtividades);
    sincronizarNotasComAtividades(novasAtividades);
  }

  function atualizarNotaAluno(
    alunoId: string,
    ordem: number,
    campo: keyof Omit<NotaAlunoItemForm, "ordem">,
    valor: string
  ) {
    setNotasPorAluno((prev) => ({
      ...prev,
      [alunoId]: (prev[alunoId] || []).map((item) =>
        item.ordem === ordem ? { ...item, [campo]: valor } : item
      ),
    }));
  }

  async function handleSalvarRascunho() {
    if (!token || !turmaProfessorId) return;

    setError("");
    setSuccess("");

    const atividadesValidas = atividades
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((atividade, index) => ({
        ordem: index + 1,
        tipoAtividade: atividade.tipoAtividade,
        titulo: atividade.titulo.trim(),
        valorMaximoNumero: converterNumero(atividade.valorMaximo),
        permiteRecuperacao: atividade.permiteRecuperacao,
      }));

    if (!atividadesValidas.length) {
      setError("Informe pelo menos uma atividade.");
      return;
    }

    for (const atividade of atividadesValidas) {
      if (!atividade.titulo) {
        setError("Toda atividade precisa ter um nome.");
        return;
      }

      if (Number.isNaN(atividade.valorMaximoNumero) || atividade.valorMaximoNumero <= 0) {
        setError(`Informe um valor máximo válido para a atividade "${atividade.titulo}".`);
        return;
      }
    }

    if (!alunos.length) {
      setError("Nenhum aluno encontrado para lançar notas.");
      return;
    }

    const lancamentos = [];

    for (const aluno of alunos) {
      const itensAluno = notasPorAluno[aluno.id] || [];

      const itensNormalizados = atividadesValidas.map((atividade) => {
        const itemAluno = itensAluno.find((item) => item.ordem === atividade.ordem);

        const notaNumero = converterNumero(itemAluno?.nota || "");
        const notaRecuperacaoNumero = atividade.permiteRecuperacao
          ? converterNumero(itemAluno?.notaRecuperacao || "")
          : NaN;

        if (Number.isNaN(notaNumero)) {
          throw new Error(`Preencha uma nota válida para o aluno ${aluno.name} na atividade "${atividade.titulo}".`);
        }

        if (notaNumero < 0 || notaNumero > atividade.valorMaximoNumero) {
          throw new Error(
            `A nota do aluno ${aluno.name} na atividade "${atividade.titulo}" deve estar entre 0 e ${atividade.valorMaximoNumero}.`
          );
        }

        if (
          atividade.permiteRecuperacao &&
          itemAluno?.notaRecuperacao &&
          (Number.isNaN(notaRecuperacaoNumero) ||
            notaRecuperacaoNumero < 0 ||
            notaRecuperacaoNumero > atividade.valorMaximoNumero)
        ) {
          throw new Error(
            `A recuperação do aluno ${aluno.name} na atividade "${atividade.titulo}" deve estar entre 0 e ${atividade.valorMaximoNumero}.`
          );
        }

        return {
          ordem: atividade.ordem,
          nota: notaNumero,
          notaRecuperacao:
            atividade.permiteRecuperacao && itemAluno?.notaRecuperacao
              ? notaRecuperacaoNumero
              : null,
          observacao: itemAluno?.observacao || "",
        };
      });

      lancamentos.push({
        alunoId: aluno.id,
        observacao: observacaoGeral,
        itens: itensNormalizados,
      });
    }

    try {
      setSaving(true);

      const res = await fetch(apiUrl("/notas/rascunho-em-massa"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          turmaProfessorId,
          periodo,
          tipoComposicao,
          observacaoGeral,
          atividades: atividadesValidas.map((atividade) => ({
            ordem: atividade.ordem,
            tipoAtividade: atividade.tipoAtividade,
            titulo: atividade.titulo,
            valorMaximo: atividade.valorMaximoNumero,
            permiteRecuperacao: atividade.permiteRecuperacao,
          })),
          lancamentos,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao salvar rascunho.");
      }

      setSuccess("Rascunho salvo com sucesso.");
      await fetchAlunosDaDisciplina();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao salvar rascunho.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnviarParaBoletim() {
    if (!token || !turmaProfessorId) return;

    try {
      setSending(true);
      setError("");
      setSuccess("");

      const res = await fetch(apiUrl("/notas/enviar-em-massa"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          turmaProfessorId,
          periodo,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao enviar notas ao boletim.");
      }

      setSuccess("Notas enviadas ao boletim com sucesso.");
      await fetchAlunosDaDisciplina();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao enviar notas.");
    } finally {
      setSending(false);
    }
  }

    async function handleCancelarEnvioParaBoletim() {
    if (!token || !turmaProfessorId) return;

    try {
      setCanceling(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        apiUrl("/notas/cancelar-envio-em-massa"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            turmaProfessorId,
            periodo,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message || "Erro ao cancelar envio das notas ao boletim."
        );
      }

      setSuccess(
        "Envio ao boletim cancelado com sucesso. As notas voltaram para edição."
      );
      await fetchAlunosDaDisciplina();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao cancelar envio.");
    } finally {
      setCanceling(false);
    }
  }

  useEffect(() => {
    fetchMinhasDisciplinas();
  }, [token]);

  useEffect(() => {
    if (!turmaProfessorId || !periodo) return;
    fetchAlunosDaDisciplina();
  }, [turmaProfessorId, periodo]);

  useEffect(() => {
    if (!disciplinaSelecionada) return;

    if (
      disciplinaSelecionada.turma.school.tipoAvaliacao === "TRIMESTRAL" &&
      periodo === "QUARTO"
    ) {
      setPeriodo("PRIMEIRO");
    }
  }, [disciplinaSelecionada, periodo]);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Lançamento de Notas"
        description="Crie atividades para toda a turma, lance as notas em massa, use recuperação quando necessário e só depois envie ao boletim."
      />

      {user?.role !== "PROFESSOR" ? (
        <div className="card-base p-6">
          <p className="text-sm text-red-600">
            Esta página é exclusiva para professores.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Disciplina selecionada</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">
            {disciplinaSelecionada?.disciplina || "-"}
          </h3>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Turma</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">
            {disciplinaSelecionada?.turma?.name || "-"}
          </h3>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Período</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">
            {disciplinaSelecionada
              ? labelPeriodo(disciplinaSelecionada.turma.school.tipoAvaliacao, periodo)
              : "-"}
          </h3>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Média da turma</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">{mediaTurma}</h3>
        </div>
      </div>

      <div className="card-base p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Minha disciplina / turma
            </label>
            <select
              value={turmaProfessorId}
              onChange={(e) => setTurmaProfessorId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">Selecione</option>
              {minhasDisciplinas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.disciplina} - {item.turma.name}
                  {item.turma.turno ? ` (${formatTurno(item.turma.turno)})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Período</label>
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as Periodo)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              {periodosDisponiveis.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Cálculo da nota final
            </label>
            <select
              value={tipoComposicao}
              onChange={(e) => setTipoComposicao(e.target.value as TipoComposicao)}
              disabled={tudoEnviado}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
            >
              <option value="MEDIA_ARITMETICA">Média aritmética</option>
              <option value="SOMATORIO">Somatório</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card-base p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Atividades da turma</h3>
            <p className="text-sm text-slate-500">
              Crie as atividades uma vez e depois lance as notas de todos os alunos.
            </p>
          </div>

          <button
            type="button"
            onClick={adicionarAtividade}
            disabled={tudoEnviado}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Adicionar atividade
          </button>
        </div>

        <div className="space-y-4">
          {atividades.map((atividade, index) => (
            <div
              key={atividade.localId}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  Atividade {index + 1}
                </h4>

                <button
                  type="button"
                  onClick={() => removerAtividade(atividade.localId)}
                  disabled={tudoEnviado}
                  className="text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Remover
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                <div>
                  <label className="text-sm font-medium text-slate-700">Tipo</label>
                  <select
                    value={atividade.tipoAtividade}
                    onChange={(e) =>
                      atualizarAtividade(
                        atividade.localId,
                        "tipoAtividade",
                        e.target.value
                      )
                    }
                    disabled={tudoEnviado}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  >
                    <option value="TESTE">Teste</option>
                    <option value="PROVA">Prova</option>
                    <option value="TRABALHO">Trabalho</option>
                    <option value="ATIVIDADE">Atividade</option>
                    <option value="PARTICIPACAO">Participação</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">
                    Nome da atividade
                  </label>
                  <input
                    type="text"
                    value={atividade.titulo}
                    onChange={(e) =>
                      atualizarAtividade(atividade.localId, "titulo", e.target.value)
                    }
                    placeholder="Ex.: Teste 1, Prova 2, Trabalho..."
                    disabled={tudoEnviado}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Valor máximo
                  </label>
                  <input
                    type="text"
                    value={atividade.valorMaximo}
                    onChange={(e) =>
                      atualizarAtividade(
                        atividade.localId,
                        "valorMaximo",
                        e.target.value
                      )
                    }
                    placeholder="Ex.: 10"
                    disabled={tudoEnviado}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={atividade.permiteRecuperacao}
                      onChange={(e) =>
                        atualizarAtividade(
                          atividade.localId,
                          "permiteRecuperacao",
                          e.target.checked
                        )
                      }
                      disabled={tudoEnviado}
                    />
                    Permitir recuperação
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-base p-5">
        <label className="text-sm font-medium text-slate-700">
          Observação geral do período
        </label>
        <input
          type="text"
          value={observacaoGeral}
          onChange={(e) => setObservacaoGeral(e.target.value)}
          placeholder="Observação geral da disciplina neste período"
          disabled={tudoEnviado}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        />
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="card-base p-6">
            <p className="text-sm text-slate-500">Carregando...</p>
          </div>
        ) : alunos.length === 0 ? (
          <div className="card-base p-6">
            <p className="text-sm text-slate-500">
              Nenhum aluno encontrado para esta disciplina/turma.
            </p>
          </div>
        ) : (
          alunos.map((aluno) => {
            const itensAluno = notasPorAluno[aluno.id] || [];
            const notaFinal = calcularNotaFinalAluno(
              itensAluno,
              atividades,
              tipoComposicao
            );

            return (
              <div key={aluno.id} className="card-base p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{aluno.name}</p>
                    <p className="text-sm text-slate-500">
                      Matrícula: {aluno.matricula || "Não informada"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        String(aluno.status || "").toUpperCase() === "ATIVO"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {String(aluno.status || "").toUpperCase() || "SEM STATUS"}
                    </span>

                    {tudoEnviado ? (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        Enviado ao boletim
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        Rascunho do professor
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Nota final calculada</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {formatarNota(notaFinal)}
                  </p>
                </div>

                <div className="space-y-3">
                  {atividades
                    .slice()
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((atividade) => {
                      const itemAluno = itensAluno.find(
                        (item) => item.ordem === atividade.ordem
                      );

                      const notaNumero = converterNumero(itemAluno?.nota || "");
                      const notaRecuperacaoNumero = atividade.permiteRecuperacao
                        ? converterNumero(itemAluno?.notaRecuperacao || "")
                        : NaN;

                      const notaConsiderada =
                        !Number.isNaN(notaNumero)
                          ? calcularNotaConsiderada(
                              notaNumero,
                              Number.isNaN(notaRecuperacaoNumero)
                                ? null
                                : notaRecuperacaoNumero
                            )
                          : null;

                      return (
                        <div
                          key={`${aluno.id}-${atividade.localId}`}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">
                                {atividade.titulo || `Atividade ${atividade.ordem}`}
                              </h4>
                              <p className="text-xs text-slate-500">
                                Tipo: {atividade.tipoAtividade} • Valor máximo:{" "}
                                {atividade.valorMaximo || "0"}
                                {atividade.permiteRecuperacao
                                  ? " • Com recuperação"
                                  : " • Sem recuperação"}
                              </p>
                            </div>

                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                              Nota considerada:{" "}
                              {notaConsiderada === null
                                ? "-"
                                : formatarNota(notaConsiderada)}
                            </div>
                          </div>

                          <div
                            className={`grid grid-cols-1 gap-4 ${
                              atividade.permiteRecuperacao
                                ? "md:grid-cols-4"
                                : "md:grid-cols-3"
                            }`}
                          >
                            <div>
                              <label className="text-sm font-medium text-slate-700">
                                Nota
                              </label>
                              <input
                                type="text"
                                value={itemAluno?.nota || ""}
                                onChange={(e) =>
                                  atualizarNotaAluno(
                                    aluno.id,
                                    atividade.ordem,
                                    "nota",
                                    e.target.value
                                  )
                                }
                                placeholder="Ex.: 8,5"
                                disabled={tudoEnviado}
                                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                              />
                            </div>

                            {atividade.permiteRecuperacao ? (
                              <div>
                                <label className="text-sm font-medium text-slate-700">
                                  Recuperação
                                </label>
                                <input
                                  type="text"
                                  value={itemAluno?.notaRecuperacao || ""}
                                  onChange={(e) =>
                                    atualizarNotaAluno(
                                      aluno.id,
                                      atividade.ordem,
                                      "notaRecuperacao",
                                      e.target.value
                                    )
                                  }
                                  placeholder="Opcional"
                                  disabled={tudoEnviado}
                                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                                />
                              </div>
                            ) : null}

                            <div className={atividade.permiteRecuperacao ? "" : "md:col-span-2"}>
                              <label className="text-sm font-medium text-slate-700">
                                Observação
                              </label>
                              <input
                                type="text"
                                value={itemAluno?.observacao || ""}
                                onChange={(e) =>
                                  atualizarNotaAluno(
                                    aluno.id,
                                    atividade.ordem,
                                    "observacao",
                                    e.target.value
                                  )
                                }
                                placeholder="Opcional"
                                disabled={tudoEnviado}
                                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })
        )}
      </div>

            <div className="card-base p-5">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSalvarRascunho}
            disabled={saving || sending || canceling || tudoEnviado || loading}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar rascunho em massa"}
          </button>

          <button
            type="button"
            onClick={handleEnviarParaBoletim}
            disabled={sending || saving || canceling || tudoEnviado || loading}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending
              ? "Enviando..."
              : tudoEnviado
              ? "Já enviado ao boletim"
              : "Enviar tudo ao boletim"}
          </button>

          {tudoEnviado ? (
            <button
              type="button"
              onClick={handleCancelarEnvioParaBoletim}
              disabled={canceling || saving || sending || loading}
              className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {canceling ? "Cancelando..." : "Cancelar envio ao boletim"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
