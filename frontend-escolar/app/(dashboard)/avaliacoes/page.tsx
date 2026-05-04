
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type TipoComposicao = "MEDIA_ARITMETICA" | "SOMATORIO";
type Periodo = "PRIMEIRO" | "SEGUNDO" | "TERCEIRO" | "QUARTO";
type TipoQuestaoOnline =
  | "MULTIPLA_ESCOLHA"
  | "VERDADEIRO_FALSO"
  | "DESCRITIVA";

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

type AlunoResponsavel = {
  id: string;
  name: string;
  matricula?: string | null;
  status?: string | null;
  turma?: {
    id: string;
    name: string;
    turno?: string | null;
  } | null;
};

type AvaliacaoOnlineListItem = {
  id: string;
  titulo: string;
  descricao?: string | null;
  instrucoes?: string | null;
  valor: number | string;
  periodo: Periodo;
  tipoComposicao: TipoComposicao;
  ativo: boolean;
  publicada: boolean;
  corrigeAutomaticamente: boolean;
  lancadaNoSistemaNotas: boolean;
  publicadaEm?: string | null;
  encerradaEm?: string | null;
  lancadaEm?: string | null;
  createdAt: string;
  turmaProfessor: {
    id: string;
    disciplina: string;
    professor?: {
      id: string;
      name: string;
    };
    turma: {
      id: string;
      name: string;
      turno?: string | null;
      school: {
        tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL";
      };
    };
  };
  perguntas?: Array<{ id: string; tipoQuestao?: TipoQuestaoOnline }>;
  tentativas?: Array<{
    id: string;
    finalizada: boolean;
    notaObjetiva?: number | null;
    notaDescritiva?: number | null;
    notaFinal?: number | null;
    totalAcertos?: number;
    totalQuestoes?: number;
    finalizadaEm?: string | null;
    refazerAutorizado?: boolean;
  }>;
};

type CorrecaoDescritivaForm = Record<
  string,
  {
    notaManual: string;
    feedbackProfessor: string;
  }
>;

type AlternativaForm = {
  texto: string;
  correta: boolean;
};

type PerguntaForm = {
  tipoQuestao: TipoQuestaoOnline;
  enunciado: string;
  imagemUrl: string;
  imagemFile: File | null;
  peso: string;
  quantidadeAlternativas: string;
  alternativas: AlternativaForm[];
};

type RespostaAlunoMap = Record<
  string,
  {
    alternativaId?: string;
    respostaTexto?: string;
  }
>;

function formatarValor(valor: number | string) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return "0,00";
  return numero.toFixed(2).replace(".", ",");
}

function normalizarImagemUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return apiUrl(url);
}

function labelPeriodo(
  tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL",
  periodo: Periodo
) {
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

function formatarData(data?: string | null) {
  if (!data) return "-";

  const date = new Date(data);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("pt-BR");
}

function criarAlternativasMultiplaEscolha(
  quantidade: number,
  atuais?: AlternativaForm[]
) {
  const quantidadeFinal = Math.max(2, Number(quantidade) || 2);

  return Array.from({ length: quantidadeFinal }).map((_, index) => ({
    texto: atuais?.[index]?.texto || "",
    correta: atuais?.[index]?.correta || index === 0,
  }));
}

function criarAlternativasVerdadeiroFalso() {
  return [
    { texto: "Verdadeiro", correta: true },
    { texto: "Falso", correta: false },
  ];
}

function criarPerguntaInicial(): PerguntaForm {
  return {
    tipoQuestao: "MULTIPLA_ESCOLHA",
    enunciado: "",
    imagemUrl: "",
    imagemFile: null,
    peso: "1",
    quantidadeAlternativas: "4",
    alternativas: criarAlternativasMultiplaEscolha(4),
  };
}

function perguntaParaForm(pergunta: any): PerguntaForm {
  if (pergunta?.tipoQuestao === "DESCRITIVA") {
    return {
      tipoQuestao: "DESCRITIVA",
      enunciado: pergunta.enunciado || "",
      imagemUrl: pergunta.imagemUrl || "",
      imagemFile: null,
      peso: String(pergunta.peso || "1").replace(".", ","),
      quantidadeAlternativas: "0",
      alternativas: [],
    };
  }

  if (pergunta?.tipoQuestao === "VERDADEIRO_FALSO") {
    const alternativas = Array.isArray(pergunta.alternativas)
      ? pergunta.alternativas
      : criarAlternativasVerdadeiroFalso();

    return {
      tipoQuestao: "VERDADEIRO_FALSO",
      enunciado: pergunta.enunciado || "",
      imagemUrl: pergunta.imagemUrl || "",
      imagemFile: null,
      peso: String(pergunta.peso || "1").replace(".", ","),
      quantidadeAlternativas: "2",
      alternativas: [
        {
          texto: alternativas[0]?.texto || "Verdadeiro",
          correta: Boolean(alternativas[0]?.correta),
        },
        {
          texto: alternativas[1]?.texto || "Falso",
          correta: Boolean(alternativas[1]?.correta),
        },
      ],
    };
  }

  const alternativas = Array.isArray(pergunta.alternativas)
    ? pergunta.alternativas.map((alternativa: any, index: number) => ({
        texto: alternativa?.texto || "",
        correta: Boolean(alternativa?.correta || index === 0),
      }))
    : criarAlternativasMultiplaEscolha(4);

  return {
    tipoQuestao: "MULTIPLA_ESCOLHA",
    enunciado: pergunta.enunciado || "",
    imagemUrl: pergunta.imagemUrl || "",
    imagemFile: null,
    peso: String(pergunta.peso || "1").replace(".", ","),
    quantidadeAlternativas: String(alternativas.length || 4),
    alternativas,
  };
}

export default function AvaliacoesPage() {
  const { token, user } = useAuth();

  const isProfessor = user?.role === "PROFESSOR";
  const isAluno = user?.role === "ALUNO";
  const isResponsavel = user?.role === "RESPONSAVEL";
  const isGestor = user?.role === "GESTOR";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingDetalheId, setLoadingDetalheId] = useState<string | null>(null);
  const [savingPergunta, setSavingPergunta] = useState(false);
  const [uploadingImagemPerguntaId, setUploadingImagemPerguntaId] = useState<
    string | null
  >(null);
  const [deletingPerguntaId, setDeletingPerguntaId] = useState<string | null>(
    null
  );

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [minhasDisciplinas, setMinhasDisciplinas] = useState<MinhaDisciplina[]>(
    []
  );
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoOnlineListItem[]>([]);
  const [avaliacaoDetalhada, setAvaliacaoDetalhada] = useState<any | null>(null);
  const [alunosResponsavel, setAlunosResponsavel] = useState<AlunoResponsavel[]>(
    []
  );
  const [alunoResponsavelId, setAlunoResponsavelId] = useState("");

  const [turmaProfessorId, setTurmaProfessorId] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("PRIMEIRO");
  const [tipoComposicao, setTipoComposicao] =
    useState<TipoComposicao>("MEDIA_ARITMETICA");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [instrucoes, setInstrucoes] = useState("");
  const [valor, setValor] = useState("10");
  const [corrigeAutomaticamente, setCorrigeAutomaticamente] = useState(true);
  const [publicada, setPublicada] = useState(false);
  const [search, setSearch] = useState("");
  const [serieFiltro, setSerieFiltro] = useState("");
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const [perguntaForm, setPerguntaForm] = useState<PerguntaForm>(
    criarPerguntaInicial()
  );
  const [editingPerguntaId, setEditingPerguntaId] = useState<string | null>(
    null
  );

  const [tentativaAlunoId, setTentativaAlunoId] = useState<string | null>(null);
  const [savingRespostasAluno, setSavingRespostasAluno] = useState(false);
  const [concluindoAluno, setConcluindoAluno] = useState(false);
  const [respostasAluno, setRespostasAluno] = useState<RespostaAlunoMap>({});
  const [alunosAvaliacao, setAlunosAvaliacao] = useState<any[]>([]);
  const [loadingAlunosAvaliacao, setLoadingAlunosAvaliacao] = useState(false);
  const [alunoResultadoFiltro, setAlunoResultadoFiltro] = useState("");
  const [alunosSelecionadosRefazer, setAlunosSelecionadosRefazer] = useState<
    string[]
  >([]);
  const [autorizandoRefazer, setAutorizandoRefazer] = useState(false);
  const [correcoesDescritivas, setCorrecoesDescritivas] =
    useState<CorrecaoDescritivaForm>({});
  const [savingCorrecaoRespostaId, setSavingCorrecaoRespostaId] = useState<
    string | null
  >(null);

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

  function extrairSerieDaTurma(nomeTurma?: string | null) {
    const nome = String(nomeTurma || "").trim();
    if (!nome) return "Não informada";

    const match = nome.match(
      /^(\d+\s*(?:º|°)?\s*(?:ano|serie|série)|maternal|jardim|pré(?:-|\s)?\w*)/i
    );

    if (match?.[1]) {
      return match[1].trim();
    }

    const partes = nome.split(" - ");
    return partes[0]?.trim() || nome;
  }

  const seriesDisponiveis = useMemo(() => {
    const unicas = Array.from(
      new Set(
        avaliacoes
          .map((item) => extrairSerieDaTurma(item.turmaProfessor?.turma?.name))
          .filter(Boolean)
      )
    );

    return unicas.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [avaliacoes]);

  const turmasDisponiveis = useMemo(() => {
    const filtradas = avaliacoes.filter((item) => {
      if (!serieFiltro) return true;
      return (
        extrairSerieDaTurma(item.turmaProfessor?.turma?.name) === serieFiltro
      );
    });

    const mapa = new Map<string, { id: string; nome: string }>();

    filtradas.forEach((item) => {
      const turmaId = item.turmaProfessor?.turma?.id;
      const turmaNome = item.turmaProfessor?.turma?.name;
      if (!turmaId || !turmaNome || mapa.has(turmaId)) return;

      mapa.set(turmaId, {
        id: turmaId,
        nome: `${turmaNome}${
          item.turmaProfessor?.turma?.turno
            ? ` (${formatTurno(item.turmaProfessor.turma.turno)})`
            : ""
        }`,
      });
    });

    return Array.from(mapa.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })
    );
  }, [avaliacoes, serieFiltro]);

  const avaliacoesFiltradas = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return avaliacoes.filter((item) => {
      const serieAtual = extrairSerieDaTurma(item.turmaProfessor?.turma?.name);
      const turmaIdAtual = item.turmaProfessor?.turma?.id || "";
      const texto = [
        item.titulo,
        item.descricao || "",
        item.turmaProfessor?.disciplina || "",
        item.turmaProfessor?.turma?.name || "",
        item.turmaProfessor?.professor?.name || "",
      ]
        .join(" ")
        .toLowerCase();

      const combinaBusca = !termo || texto.includes(termo);
      const combinaSerie = !serieFiltro || serieAtual === serieFiltro;
      const combinaTurma = !turmaFiltro || turmaIdAtual === turmaFiltro;

      return combinaBusca && combinaSerie && combinaTurma;
    });
  }, [avaliacoes, search, serieFiltro, turmaFiltro]);

  const resumoProfessor = useMemo(() => {
    const total = avaliacoes.length;
    const publicadas = avaliacoes.filter((item) => item.publicada).length;
    const autocorrecao = avaliacoes.filter(
      (item) => item.corrigeAutomaticamente
    ).length;
    const pendentesLancamento = avaliacoes.filter(
      (item) => !item.lancadaNoSistemaNotas
    ).length;

    return {
      total,
      publicadas,
      autocorrecao,
      pendentesLancamento,
    };
  }, [avaliacoes]);

  const resumoAluno = useMemo(() => {
    const total = avaliacoes.length;
    const finalizadas = avaliacoes.filter(
      (item) => item.tentativas?.[0]?.finalizada
    ).length;
    const pendentes = total - finalizadas;
    const comQuestoes = avaliacoes.filter(
      (item) => (item.perguntas?.length || 0) > 0
    ).length;

    return {
      total,
      finalizadas,
      pendentes,
      comQuestoes,
    };
  }, [avaliacoes]);

  const alunoResponsavelSelecionado = useMemo(
    () => alunosResponsavel.find((aluno) => aluno.id === alunoResponsavelId) || null,
    [alunosResponsavel, alunoResponsavelId]
  );

  const alunoResultadoSelecionado = useMemo(
    () => alunosAvaliacao.find((aluno) => aluno.id === alunoResultadoFiltro) || null,
    [alunosAvaliacao, alunoResultadoFiltro]
  );

  const tentativaResultadoSelecionado = useMemo(() => {
    if (!alunoResultadoFiltro) return null;

    return (
      avaliacaoDetalhada?.tentativas?.find(
        (tentativa: any) => tentativa?.aluno?.id === alunoResultadoFiltro
      ) || null
    );
  }, [avaliacaoDetalhada, alunoResultadoFiltro]);

  async function fetchMinhasDisciplinas() {
    if (!token || !isProfessor) return;

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
      setTurmaProfessorId((current) => current || lista[0].id);
    }
  }

  async function fetchAvaliacoesProfessor() {
    if (!token) return;

    const res = await fetch(apiUrl("/avaliacoes-online/minhas"), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Erro ao carregar avaliações.");
    }

    setAvaliacoes(Array.isArray(data) ? data : []);
  }

  async function fetchAvaliacoesAluno() {
    if (!token) return;

    const res = await fetch(apiUrl("/avaliacoes-online/disponiveis-aluno"), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Erro ao carregar avaliações do aluno.");
    }

    setAvaliacoes(Array.isArray(data) ? data : []);
  }

  async function fetchAvaliacoesGestao() {
    if (!token) return;

    const res = await fetch(apiUrl("/avaliacoes-online/gestao"), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Erro ao carregar avaliações da gestão.");
    }

    setAvaliacoes(Array.isArray(data) ? data : []);
  }

  async function fetchAlunosResponsavel() {
    if (!token || !isResponsavel) return;

    const res = await fetch(apiUrl("/avaliacoes-online/responsavel/alunos"), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Erro ao carregar alunos vinculados.");
    }

    const lista = Array.isArray(data) ? data : [];
    setAlunosResponsavel(lista);
    setAlunoResponsavelId((atual) => atual || lista[0]?.id || "");
  }

  async function fetchAvaliacoesResponsavel(alunoId: string) {
    if (!token || !alunoId) {
      setAvaliacoes([]);
      return;
    }

    const res = await fetch(
      apiUrl(`/avaliacoes-online/responsavel/alunos/${alunoId}`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Erro ao carregar avaliações do aluno.");
    }

    setAvaliacoes(Array.isArray(data) ? data : []);
  }

  async function fetchDadosIniciais() {
    if (!token || !user?.role) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      if (isProfessor) {
        await Promise.all([fetchMinhasDisciplinas(), fetchAvaliacoesProfessor()]);
      } else if (isGestor) {
        await fetchAvaliacoesGestao();
      } else if (isAluno) {
        await fetchAvaliacoesAluno();
      } else if (isResponsavel) {
        await fetchAlunosResponsavel();
      } else {
        setAvaliacoes([]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar a página de avaliações.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (!turmaProfessorId) {
        throw new Error("Selecione a disciplina/turma.");
      }

      if (!titulo.trim()) {
        throw new Error("Informe o título da avaliação.");
      }

      const valorNumero = Number(String(valor).replace(",", "."));
      if (Number.isNaN(valorNumero) || valorNumero <= 0) {
        throw new Error("Informe um valor válido para a avaliação.");
      }

      const res = await fetch(apiUrl("/avaliacoes-online"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          turmaProfessorId,
          periodo,
          tipoComposicao,
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          instrucoes: instrucoes.trim(),
          valor: valorNumero,
          corrigeAutomaticamente,
          publicada,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao criar avaliação online.");
      }

      setSuccess("Avaliação online criada com sucesso.");
      setTitulo("");
      setDescricao("");
      setInstrucoes("");
      setValor("10");
      setCorrigeAutomaticamente(true);
      setPublicada(false);
      setAvaliacaoDetalhada(null);

      await fetchAvaliacoesProfessor();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao criar avaliação online.");
    } finally {
      setSaving(false);
    }
  }

  async function fetchAlunosDaAvaliacaoProfessor(avaliacaoId: string) {
    if (!token) return;

    try {
      setLoadingAlunosAvaliacao(true);

      const res = await fetch(
        apiUrl(`/avaliacoes-online/${avaliacaoId}/alunos`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar alunos da avaliação.");
      }

      setAlunosAvaliacao(Array.isArray(data?.alunos) ? data.alunos : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar alunos da avaliação.");
    } finally {
      setLoadingAlunosAvaliacao(false);
    }
  }

  async function fetchAlunosDaAvaliacaoGestao(avaliacaoId: string) {
    if (!token) return;

    try {
      setLoadingAlunosAvaliacao(true);

      const res = await fetch(
        apiUrl(`/avaliacoes-online/gestao/${avaliacaoId}/alunos`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar alunos da avaliacao.");
      }

      setAlunosAvaliacao(Array.isArray(data?.alunos) ? data.alunos : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar alunos da avaliacao.");
    } finally {
      setLoadingAlunosAvaliacao(false);
    }
  }

  async function handleVerDetalhesProfessor(avaliacaoId: string) {
    if (!token) return;

    try {
      setLoadingDetalheId(avaliacaoId);
      setError("");
      setSuccess("");

      const res = await fetch(apiUrl(`/avaliacoes-online/${avaliacaoId}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar detalhes.");
      }

      setAvaliacaoDetalhada(data);
      setPerguntaForm(criarPerguntaInicial());
      setEditingPerguntaId(null);

      const mapaCorrecoes: CorrecaoDescritivaForm = {};
      for (const tentativa of data?.tentativas || []) {
        for (const resposta of tentativa?.respostas || []) {
          if (resposta?.pergunta?.tipoQuestao === "DESCRITIVA") {
            mapaCorrecoes[resposta.id] = {
              notaManual:
                resposta?.notaManual != null
                  ? String(resposta.notaManual).replace(".", ",")
                  : "",
              feedbackProfessor: resposta?.feedbackProfessor || "",
            };
          }
        }
      }

      setCorrecoesDescritivas(mapaCorrecoes);
      await fetchAlunosDaAvaliacaoProfessor(avaliacaoId);
      setAlunosSelecionadosRefazer([]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar detalhes da avaliação.");
    } finally {
      setLoadingDetalheId(null);
    }
  }

  async function handleVerDetalhesAluno(avaliacaoId: string) {
    if (!token) return;

    try {
      setLoadingDetalheId(avaliacaoId);
      setError("");
      setSuccess("");

      const res = await fetch(
        apiUrl(`/avaliacoes-online/disponiveis-aluno/${avaliacaoId}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar avaliação.");
      }

      setAvaliacaoDetalhada(data);

      const tentativa = data?.tentativas?.[0] || null;
      setTentativaAlunoId(tentativa?.id || null);

      const respostasMap: RespostaAlunoMap = {};

      if (tentativa?.respostas?.length) {
        for (const resposta of tentativa.respostas) {
          respostasMap[resposta.perguntaId] = {
            alternativaId: resposta.alternativaId || undefined,
            respostaTexto: resposta.respostaTexto || "",
          };
        }
      }

      setRespostasAluno(respostasMap);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar avaliação do aluno.");
    } finally {
      setLoadingDetalheId(null);
    }
  }

  async function handleVerDetalhesGestor(avaliacaoId: string) {
    if (!token) return;

    try {
      setLoadingDetalheId(avaliacaoId);
      setError("");
      setSuccess("");

      const res = await fetch(apiUrl(`/avaliacoes-online/gestao/${avaliacaoId}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar detalhes.");
      }

      setAvaliacaoDetalhada(data);
      await fetchAlunosDaAvaliacaoGestao(avaliacaoId);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar detalhes da avaliacao.");
    } finally {
      setLoadingDetalheId(null);
    }
  }

  function alterarTipoQuestao(tipoQuestao: TipoQuestaoOnline) {
    setPerguntaForm((prev) => {
      if (tipoQuestao === "DESCRITIVA") {
        return {
          ...prev,
          tipoQuestao,
          quantidadeAlternativas: "0",
          alternativas: [],
        };
      }

      if (tipoQuestao === "VERDADEIRO_FALSO") {
        return {
          ...prev,
          tipoQuestao,
          quantidadeAlternativas: "2",
          alternativas: criarAlternativasVerdadeiroFalso(),
        };
      }

      return {
        ...prev,
        tipoQuestao,
        quantidadeAlternativas: "4",
        alternativas: criarAlternativasMultiplaEscolha(4),
      };
    });
  }

  function alterarQuantidadeAlternativas(valorQuantidade: string) {
    setPerguntaForm((prev) => {
      const quantidade = Math.max(2, Number(valorQuantidade) || 2);

      return {
        ...prev,
        quantidadeAlternativas: String(quantidade),
        alternativas: criarAlternativasMultiplaEscolha(
          quantidade,
          prev.alternativas
        ),
      };
    });
  }

  function atualizarAlternativaTexto(index: number, texto: string) {
    setPerguntaForm((prev) => ({
      ...prev,
      alternativas: prev.alternativas.map((alternativa, currentIndex) =>
        currentIndex === index ? { ...alternativa, texto } : alternativa
      ),
    }));
  }

  function marcarAlternativaCorreta(index: number) {
    setPerguntaForm((prev) => ({
      ...prev,
      alternativas: prev.alternativas.map((alternativa, currentIndex) => ({
        ...alternativa,
        correta: currentIndex === index,
      })),
    }));
  }

  function limparFormularioPergunta() {
    setPerguntaForm(criarPerguntaInicial());
    setEditingPerguntaId(null);
  }

  async function uploadImagemGenerica(file: File) {
    if (!token) {
      throw new Error("Usuário não autenticado.");
    }

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(
      apiUrl("/avaliacoes-online/perguntas/imagens/upload"),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Erro ao enviar imagem.");
    }

    return data.imagemUrl as string;
  }

  async function handleAdicionarOuEditarPergunta(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!token || !avaliacaoDetalhada?.id) return;

    try {
      setSavingPergunta(true);
      setError("");
      setSuccess("");

      const enunciado = perguntaForm.enunciado.trim();
      if (!enunciado) {
        throw new Error("Informe o enunciado da pergunta.");
      }

      const pesoNumero = Number(String(perguntaForm.peso).replace(",", "."));
      if (Number.isNaN(pesoNumero) || pesoNumero <= 0) {
        throw new Error("Informe um peso válido para a pergunta.");
      }

      let imagemUrlFinal = perguntaForm.imagemUrl.trim();

      if (perguntaForm.imagemFile) {
        imagemUrlFinal = await uploadImagemGenerica(perguntaForm.imagemFile);
      }

      let alternativas = perguntaForm.alternativas.map((alternativa) => ({
        texto: alternativa.texto.trim(),
        correta: alternativa.correta,
      }));

      if (perguntaForm.tipoQuestao === "DESCRITIVA") {
        alternativas = [];
      } else if (perguntaForm.tipoQuestao === "VERDADEIRO_FALSO") {
        alternativas = [
          {
            texto: "Verdadeiro",
            correta: perguntaForm.alternativas[0]?.correta ?? true,
          },
          {
            texto: "Falso",
            correta: perguntaForm.alternativas[1]?.correta ?? false,
          },
        ];
      } else {
        if (alternativas.some((alternativa) => !alternativa.texto)) {
          throw new Error("Preencha o texto de todas as alternativas.");
        }
      }

      if (perguntaForm.tipoQuestao !== "DESCRITIVA") {
        const quantidadeCorretas = alternativas.filter(
          (alternativa) => alternativa.correta
        ).length;

        if (quantidadeCorretas !== 1) {
          throw new Error("Selecione exatamente uma alternativa correta.");
        }
      }

      const endpoint = editingPerguntaId
        ? apiUrl(`/avaliacoes-online/perguntas/${editingPerguntaId}`)
        : apiUrl(`/avaliacoes-online/${avaliacaoDetalhada.id}/perguntas`);

      const method = editingPerguntaId ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipoQuestao: perguntaForm.tipoQuestao,
          enunciado,
          imagemUrl: imagemUrlFinal,
          peso: pesoNumero,
          alternativas,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message ||
            (editingPerguntaId
              ? "Erro ao editar pergunta."
              : "Erro ao adicionar pergunta.")
        );
      }

      setSuccess(
        editingPerguntaId
          ? "Pergunta editada com sucesso."
          : "Pergunta adicionada com sucesso."
      );

      limparFormularioPergunta();
      await fetchAvaliacoesProfessor();
      await handleVerDetalhesProfessor(avaliacaoDetalhada.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao salvar pergunta.");
    } finally {
      setSavingPergunta(false);
    }
  }

  function iniciarEdicaoPergunta(pergunta: any) {
    setPerguntaForm(perguntaParaForm(pergunta));
    setEditingPerguntaId(pergunta.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleExcluirPergunta(perguntaId: string) {
    if (!token || !avaliacaoDetalhada?.id) return;

    const confirmar = window.confirm(
      "Deseja realmente excluir esta pergunta?"
    );
    if (!confirmar) return;

    try {
      setDeletingPerguntaId(perguntaId);
      setError("");
      setSuccess("");

      const res = await fetch(
        apiUrl(`/avaliacoes-online/perguntas/${perguntaId}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao excluir pergunta.");
      }

      setSuccess("Pergunta excluída com sucesso.");

      if (editingPerguntaId === perguntaId) {
        limparFormularioPergunta();
      }

      await fetchAvaliacoesProfessor();
      await handleVerDetalhesProfessor(avaliacaoDetalhada.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao excluir pergunta.");
    } finally {
      setDeletingPerguntaId(null);
    }
  }

  async function handleUploadImagemPergunta(
    perguntaId: string,
    file: File | null
  ) {
    if (!token || !avaliacaoDetalhada?.id || !file) return;

    try {
      setUploadingImagemPerguntaId(perguntaId);
      setError("");
      setSuccess("");

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        apiUrl(`/avaliacoes-online/perguntas/${perguntaId}/imagem`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao enviar imagem.");
      }

      setSuccess("Imagem da pergunta enviada com sucesso.");

      if (editingPerguntaId === perguntaId) {
        setPerguntaForm((prev) => ({
          ...prev,
          imagemUrl: data.imagemUrl || prev.imagemUrl,
          imagemFile: null,
        }));
      }

      await fetchAvaliacoesProfessor();
      await handleVerDetalhesProfessor(avaliacaoDetalhada.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao enviar imagem da pergunta.");
    } finally {
      setUploadingImagemPerguntaId(null);
    }
  }

  async function iniciarTentativaAluno(avaliacaoId: string) {
    if (!token) return null;

    try {
      setError("");
      setSuccess("");

      const res = await fetch(
        apiUrl(`/avaliacoes-online/disponiveis-aluno/${avaliacaoId}/iniciar`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao iniciar tentativa.");
      }

      setTentativaAlunoId(data.id);
      return data;
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao iniciar tentativa.");
      return null;
    }
  }

  async function salvarRespostasAluno() {
    if (!token || !tentativaAlunoId) return null;

    try {
      setSavingRespostasAluno(true);
      setError("");
      setSuccess("");

      const respostas = Object.entries(respostasAluno)
        .map(([perguntaId, valor]) => ({
          perguntaId,
          alternativaId: valor.alternativaId || null,
          respostaTexto: valor.respostaTexto?.trim() || null,
        }))
        .filter((resposta) => resposta.alternativaId || resposta.respostaTexto);

      if (!respostas.length) {
        setError("Preencha pelo menos uma questao antes de salvar.");
        return null;
      }

      const res = await fetch(
        apiUrl(`/avaliacoes-online/tentativas/${tentativaAlunoId}/respostas`),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ respostas }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao salvar respostas.");
      }

      setSuccess("Respostas salvas com sucesso.");
      return data;
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao salvar respostas.");
      return null;
    } finally {
      setSavingRespostasAluno(false);
    }
  }

  async function concluirAvaliacaoAluno() {
    if (!token || !tentativaAlunoId) return;

    try {
      setConcluindoAluno(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        apiUrl(`/avaliacoes-online/tentativas/${tentativaAlunoId}/concluir`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao concluir avaliação.");
      }

      setSuccess("Avaliação concluída com sucesso.");
      await fetchAvaliacoesAluno();
      if (avaliacaoDetalhada?.id) {
        await handleVerDetalhesAluno(avaliacaoDetalhada.id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao concluir avaliação.");
    } finally {
      setConcluindoAluno(false);
    }
  }

  async function autorizarRefazerProfessor() {
    if (!token || !avaliacaoDetalhada?.id) return;

    try {
      setAutorizandoRefazer(true);
      setError("");
      setSuccess("");

      if (!alunosSelecionadosRefazer.length) {
        throw new Error("Selecione pelo menos um aluno para liberar refazer.");
      }

      const res = await fetch(
        apiUrl(`/avaliacoes-online/${avaliacaoDetalhada.id}/autorizar-refazer`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            alunoIds: alunosSelecionadosRefazer,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao autorizar refazer.");
      }

      setSuccess("Refazer autorizado com sucesso.");
      setAlunosSelecionadosRefazer([]);
      await fetchAlunosDaAvaliacaoProfessor(avaliacaoDetalhada.id);
      await fetchAvaliacoesProfessor();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao autorizar refazer.");
    } finally {
      setAutorizandoRefazer(false);
    }
  }

  async function corrigirRespostaDescritiva(
    respostaId: string,
    pesoMaximo: number | string
  ) {
    if (!token || !avaliacaoDetalhada?.id) return;

    try {
      setSavingCorrecaoRespostaId(respostaId);
      setError("");
      setSuccess("");

      const notaManualTexto = correcoesDescritivas[respostaId]?.notaManual || "";
      const feedbackProfessor =
        correcoesDescritivas[respostaId]?.feedbackProfessor || "";

      const notaManual = Number(String(notaManualTexto).replace(",", "."));
      const pesoNumero = Number(pesoMaximo);

      if (Number.isNaN(notaManual) || notaManual < 0) {
        throw new Error("Informe uma nota manual válida.");
      }

      if (!Number.isNaN(pesoNumero) && notaManual > pesoNumero) {
        throw new Error(
          `A nota não pode ser maior que o peso da questão (${pesoNumero}).`
        );
      }

      const res = await fetch(
        apiUrl(`/avaliacoes-online/respostas/${respostaId}/correcao-descritiva`),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            notaManual,
            feedbackProfessor,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message || "Erro ao salvar correção descritiva."
        );
      }

      setSuccess("Correção descritiva salva com sucesso.");
      await fetchAvaliacoesProfessor();
      await handleVerDetalhesProfessor(avaliacaoDetalhada.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao salvar correção descritiva.");
    } finally {
      setSavingCorrecaoRespostaId(null);
    }
  }

  useEffect(() => {
    fetchDadosIniciais();
  }, [token, user?.role]);

  useEffect(() => {
    if (!isResponsavel || !alunoResponsavelId) return;

    setLoading(true);
    setError("");
    fetchAvaliacoesResponsavel(alunoResponsavelId)
      .catch((err: any) => {
        console.error(err);
        setError(err.message || "Erro ao carregar avaliações do aluno.");
      })
      .finally(() => setLoading(false));
  }, [token, isResponsavel, alunoResponsavelId]);

  useEffect(() => {
    if (!disciplinaSelecionada) return;

    if (
      disciplinaSelecionada.turma.school.tipoAvaliacao === "TRIMESTRAL" &&
      periodo === "QUARTO"
    ) {
      setPeriodo("PRIMEIRO");
    }
  }, [disciplinaSelecionada, periodo]);

  useEffect(() => {
    if (!isGestor) return;

    if (!alunosAvaliacao.length) {
      setAlunoResultadoFiltro("");
      return;
    }

    const alunoAindaExiste = alunosAvaliacao.some(
      (aluno) => aluno.id === alunoResultadoFiltro
    );

    if (!alunoAindaExiste) {
      setAlunoResultadoFiltro(alunosAvaliacao[0]?.id || "");
    }
  }, [isGestor, alunosAvaliacao, alunoResultadoFiltro]);

  if (!isProfessor && !isAluno && !isResponsavel && !isGestor) {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Avaliações"
          description="Esta área está disponível para perfis com acesso acadêmico."
        />
        <div className="card-base p-6">
          <p className="text-sm text-slate-600">
            Seu perfil atual não possui acesso a esta tela.
          </p>
        </div>
      </section>
    );
  }

  if (isResponsavel) {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Avaliações dos filhos"
          description="Acompanhe avaliações publicadas, situação de realização e notas obtidas."
        />

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="card-base p-5">
          <label className="text-sm font-medium text-slate-700">Aluno</label>
          <select
            value={alunoResponsavelId}
            onChange={(event) => setAlunoResponsavelId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
          >
            <option value="">Selecione</option>
            {alunosResponsavel.map((aluno) => (
              <option key={aluno.id} value={aluno.id}>
                {aluno.name}
                {aluno.turma?.name ? ` - ${aluno.turma.name}` : ""}
              </option>
            ))}
          </select>
          {alunoResponsavelSelecionado ? (
            <p className="mt-2 text-xs text-slate-500">
              Turma: {alunoResponsavelSelecionado.turma?.name || "Não informada"}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Avaliações</p>
            <h3 className="mt-2 text-3xl font-bold text-slate-900">
              {resumoAluno.total}
            </h3>
          </div>
          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Feitas</p>
            <h3 className="mt-2 text-3xl font-bold text-slate-900">
              {resumoAluno.finalizadas}
            </h3>
          </div>
          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Pendentes</p>
            <h3 className="mt-2 text-3xl font-bold text-slate-900">
              {resumoAluno.pendentes}
            </h3>
          </div>
          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Com questões</p>
            <h3 className="mt-2 text-3xl font-bold text-slate-900">
              {resumoAluno.comQuestoes}
            </h3>
          </div>
        </div>

        <div className="card-base overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Carregando...</div>
          ) : avaliacoesFiltradas.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              Nenhuma avaliação publicada para o aluno selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Avaliação
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Disciplina
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Período
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Situação
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Nota
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Finalizada em
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {avaliacoesFiltradas.map((avaliacao) => {
                    const tentativa = avaliacao.tentativas?.[0] || null;
                    const finalizada = Boolean(tentativa?.finalizada);
                    const nota =
                      tentativa?.notaFinal || tentativa?.notaObjetiva || null;

                    return (
                      <tr key={avaliacao.id} className="border-t border-slate-200">
                        <td className="px-4 py-4 text-sm">
                          <p className="font-semibold text-slate-900">
                            {avaliacao.titulo}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Valor: {formatarValor(avaliacao.valor)}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {avaliacao.turmaProfessor?.disciplina || "-"}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {labelPeriodo(
                            avaliacao.turmaProfessor.turma.school.tipoAvaliacao,
                            avaliacao.periodo
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              finalizada
                                ? "bg-emerald-50 text-emerald-700"
                                : tentativa
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            {finalizada
                              ? "Feita"
                              : tentativa
                                ? "Em andamento"
                                : "Pendente"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                          {typeof nota === "number" ? formatarValor(nota) : "-"}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {formatarData(tentativa?.finalizadaEm)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Avaliações"
        description={
          isProfessor
            ? "Crie avaliações online reais, organize por disciplina/período e gerencie tudo em um só lugar."
            : isGestor
              ? "Visualize as avaliações da escola com filtro por série e turma, sem edição."
              : "Veja as avaliações publicadas pelos professores da sua turma."
        }
      />

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

      {isProfessor ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Total de avaliações</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {resumoProfessor.total}
              </h3>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Publicadas</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {resumoProfessor.publicadas}
              </h3>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Com autocorreção</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {resumoProfessor.autocorrecao}
              </h3>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Pendentes de lançamento</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {resumoProfessor.pendentesLancamento}
              </h3>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="card-base p-5 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Nova avaliação online
              </h3>
              <p className="text-sm text-slate-500">
                Primeiro você cria a avaliação. Depois cadastra as perguntas dentro
                dos detalhes.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Disciplina / turma
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

                  {!periodosDisponiveis.length ? (
                    <option value="PRIMEIRO">1º Período</option>
                  ) : null}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Cálculo da nota
                </label>
                <select
                  value={tipoComposicao}
                  onChange={(e) =>
                    setTipoComposicao(e.target.value as TipoComposicao)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="MEDIA_ARITMETICA">Média aritmética</option>
                  <option value="SOMATORIO">Somatório</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Título da avaliação
                </label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Prova de Matemática - 1º Bimestre"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Valor da avaliação
                </label>
                <input
                  type="text"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="Ex.: 10"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Descrição
              </label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Resumo curto da avaliação"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Instruções
              </label>
              <textarea
                value={instrucoes}
                onChange={(e) => setInstrucoes(e.target.value)}
                placeholder="Escreva as orientações para o aluno"
                className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-300 px-3 py-3"
              />
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={corrigeAutomaticamente}
                  onChange={(e) => setCorrigeAutomaticamente(e.target.checked)}
                />
                Corrigir automaticamente
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={publicada}
                  onChange={(e) => setPublicada(e.target.checked)}
                />
                Já publicar ao criar
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving || !token}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Criar avaliação online"}
              </button>
            </div>
          </form>
        </>
      ) : isGestor ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Avaliações cadastradas</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {resumoProfessor.total}
              </h3>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Publicadas</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {resumoProfessor.publicadas}
              </h3>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Com autocorreção</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {resumoProfessor.autocorrecao}
              </h3>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Pendentes de lançamento</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {resumoProfessor.pendentesLancamento}
              </h3>
            </div>
          </div>

          <div className="card-base p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Série
                </label>
                <select
                  value={serieFiltro}
                  onChange={(e) => {
                    setSerieFiltro(e.target.value);
                    setTurmaFiltro("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="">Todas as séries</option>
                  {seriesDisponiveis.map((serie) => (
                    <option key={serie} value={serie}>
                      {serie}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Turma
                </label>
                <select
                  value={turmaFiltro}
                  onChange={(e) => setTurmaFiltro(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="">Todas as turmas</option>
                  {turmasDisponiveis.map((turma) => (
                    <option key={turma.id} value={turma.id}>
                      {turma.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Busca
                </label>
                <input
                  placeholder="Título, disciplina, professor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none"
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Avaliações disponíveis</p>
            <h3 className="mt-2 text-3xl font-bold text-slate-900">
              {resumoAluno.total}
            </h3>
          </div>

          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Com questões</p>
            <h3 className="mt-2 text-3xl font-bold text-slate-900">
              {resumoAluno.comQuestoes}
            </h3>
          </div>

          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Finalizadas</p>
            <h3 className="mt-2 text-3xl font-bold text-slate-900">
              {resumoAluno.finalizadas}
            </h3>
          </div>

          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Pendentes</p>
            <h3 className="mt-2 text-3xl font-bold text-slate-900">
              {resumoAluno.pendentes}
            </h3>
          </div>
        </div>
      )}

      <div className="card-base p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {isProfessor
                ? "Minhas avaliações online"
                : isGestor
                  ? "Avaliações por série e turma"
                  : "Avaliações da minha turma"}
            </h3>
            <p className="text-sm text-slate-500">
              {isProfessor
                ? "Aqui aparecem as avaliações reais já criadas."
                : isGestor
                  ? "Consulta somente leitura das avaliações publicadas e cadastradas na escola."
                  : "Aqui aparecem as avaliações publicadas por todos os professores da sua turma."}
            </p>
          </div>

          {!isGestor ? (
            <input
              placeholder="Buscar avaliação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full md:w-80 rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
            />
          ) : null}
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Carregando avaliações...</p>
            </div>
          ) : avaliacoesFiltradas.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">
                {isProfessor
                  ? "Nenhuma avaliação online cadastrada até agora."
                  : isGestor
                    ? "Nenhuma avaliação encontrada para os filtros selecionados."
                    : "Nenhuma avaliação publicada para sua turma até agora."}
              </p>
            </div>
          ) : (
            avaliacoesFiltradas.map((item) => {
              const tipoAvaliacao =
                item.turmaProfessor?.turma?.school?.tipoAvaliacao || "BIMESTRAL";

              const tentativaAluno = item.tentativas?.[0] || null;

              return (
                <div key={item.id} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-slate-900">
                        {item.titulo}
                      </h3>

                      <p className="text-sm text-slate-500">
                        {item.turmaProfessor?.disciplina} •{" "}
                        {item.turmaProfessor?.turma?.name}
                        {item.turmaProfessor?.turma?.turno
                          ? ` (${formatTurno(item.turmaProfessor.turma.turno)})`
                          : ""}
                      </p>

                      {isAluno || isGestor ? (
                        <p className="text-sm text-slate-500">
                          Professor: {item.turmaProfessor?.professor?.name || "-"}
                        </p>
                      ) : null}

                      <p className="text-sm text-slate-500">
                        {labelPeriodo(tipoAvaliacao, item.periodo)} • Valor:{" "}
                        {formatarValor(item.valor)}
                      </p>

                      {item.descricao ? (
                        <p className="text-sm text-slate-600">{item.descricao}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-start gap-2 md:items-end">
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        {isProfessor ? (
                          <>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                item.publicada
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {item.publicada ? "Publicada" : "Rascunho"}
                            </span>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                item.corrigeAutomaticamente
                                  ? "bg-violet-50 text-violet-700"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {item.corrigeAutomaticamente
                                ? "Autocorreção"
                                : "Correção manual"}
                            </span>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                item.lancadaNoSistemaNotas
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {item.lancadaNoSistemaNotas
                                ? "Lançada em notas"
                                : "Ainda não lançada"}
                            </span>
                          </>
                        ) : (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              tentativaAluno?.finalizada
                                ? "bg-emerald-50 text-emerald-700"
                                : tentativaAluno?.id
                                ? "bg-blue-50 text-blue-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {tentativaAluno?.finalizada
                              ? "Já concluída"
                              : tentativaAluno?.id
                              ? "Em andamento"
                              : "Disponível para responder"}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          isProfessor
                            ? handleVerDetalhesProfessor(item.id)
                            : isGestor
                              ? handleVerDetalhesGestor(item.id)
                              : handleVerDetalhesAluno(item.id)
                        }
                        disabled={loadingDetalheId === item.id}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loadingDetalheId === item.id
                          ? "Carregando..."
                          : isGestor
                            ? "Ver questoes e resultados"
                            : "Ver detalhes"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Criada em</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatarData(item.createdAt)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">
                        {isProfessor
                          ? "Publicada em"
                          : isGestor
                            ? "Questões"
                            : "Questões"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {isProfessor
                          ? formatarData(item.publicadaEm)
                          : item.perguntas?.length || 0}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">
                        {isProfessor
                          ? "Perguntas"
                          : isGestor
                            ? "Professor"
                            : "Status da tentativa"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {isProfessor
                          ? item.perguntas?.length || 0
                          : isGestor
                            ? item.turmaProfessor?.professor?.name || "-"
                            : tentativaAluno?.finalizada && tentativaAluno?.refazerAutorizado
                              ? "Refazer liberado"
                              : tentativaAluno?.finalizada
                                ? "Finalizada"
                                : tentativaAluno?.id
                                  ? "Em andamento"
                                  : "Não iniciada"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">
                        {isProfessor ? "Tentativas" : "Nota obtida"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {isProfessor
                          ? item.tentativas?.length || 0
                          : tentativaAluno?.notaFinal != null
                          ? formatarValor(tentativaAluno.notaFinal)
                          : tentativaAluno?.notaObjetiva != null
                          ? formatarValor(tentativaAluno.notaObjetiva)
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {isProfessor && avaliacaoDetalhada ? (
        <div className="space-y-6">
          <div className="card-base p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Detalhes da avaliação
                </h3>
                <p className="text-sm text-slate-500">
                  Agora a questão descritiva fica sem gabarito prévio e a imagem
                  do computador já pode ser enviada na criação.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAvaliacaoDetalhada(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Fechar detalhes
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Título</p>
                <p className="mt-2 text-base font-bold text-slate-900">
                  {avaliacaoDetalhada.titulo}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Disciplina / turma</p>
                <p className="mt-2 text-base font-bold text-slate-900">
                  {avaliacaoDetalhada.turmaProfessor?.disciplina} -{" "}
                  {avaliacaoDetalhada.turmaProfessor?.turma?.name}
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleAdicionarOuEditarPergunta}
            className="card-base p-5 space-y-5"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingPerguntaId ? "Editar pergunta" : "Adicionar pergunta"}
                </h3>
                <p className="text-sm text-slate-500">
                  Você pode usar múltipla escolha, verdadeiro/falso ou
                  descritiva.
                </p>
              </div>

              {editingPerguntaId ? (
                <button
                  type="button"
                  onClick={limparFormularioPergunta}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Tipo da questão
                </label>
                <select
                  value={perguntaForm.tipoQuestao}
                  onChange={(e) =>
                    alterarTipoQuestao(e.target.value as TipoQuestaoOnline)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="MULTIPLA_ESCOLHA">Múltipla escolha</option>
                  <option value="VERDADEIRO_FALSO">Verdadeiro / Falso</option>
                  <option value="DESCRITIVA">Descritiva</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Peso</label>
                <input
                  type="text"
                  value={perguntaForm.peso}
                  onChange={(e) =>
                    setPerguntaForm((prev) => ({
                      ...prev,
                      peso: e.target.value,
                    }))
                  }
                  placeholder="1"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              {perguntaForm.tipoQuestao === "MULTIPLA_ESCOLHA" ? (
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Quantidade de alternativas
                  </label>
                  <input
                    type="number"
                    min={2}
                    value={perguntaForm.quantidadeAlternativas}
                    onChange={(e) => alterarQuantidadeAlternativas(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Enunciado / questão para colar
              </label>
              <textarea
                value={perguntaForm.enunciado}
                onChange={(e) =>
                  setPerguntaForm((prev) => ({
                    ...prev,
                    enunciado: e.target.value,
                  }))
                }
                placeholder="Cole aqui a questão completa"
                className="mt-1 min-h-[140px] w-full rounded-xl border border-slate-300 px-3 py-3"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                URL da imagem da questão
              </label>
              <input
                type="text"
                value={perguntaForm.imagemUrl}
                onChange={(e) =>
                  setPerguntaForm((prev) => ({
                    ...prev,
                    imagemUrl: e.target.value,
                  }))
                }
                placeholder="Cole aqui a URL da imagem, se quiser"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Imagem do computador
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setPerguntaForm((prev) => ({
                    ...prev,
                    imagemFile: e.target.files?.[0] || null,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
              {perguntaForm.imagemFile ? (
                <p className="mt-2 text-xs text-slate-500">
                  Arquivo selecionado: {perguntaForm.imagemFile.name}
                </p>
              ) : null}
            </div>

            {perguntaForm.imagemUrl.trim() || perguntaForm.imagemFile ? (
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="mb-3 text-sm font-medium text-slate-700">
                  Pré-visualização da imagem
                </p>
                <img
                  src={
                    perguntaForm.imagemFile
                      ? URL.createObjectURL(perguntaForm.imagemFile)
                      : normalizarImagemUrl(perguntaForm.imagemUrl)
                  }
                  alt="Pré-visualização da questão"
                  className="max-h-72 rounded-xl border border-slate-200 object-contain"
                />
              </div>
            ) : null}

            {perguntaForm.tipoQuestao !== "DESCRITIVA" ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">
                  Alternativas
                </p>

                {perguntaForm.tipoQuestao === "VERDADEIRO_FALSO" ? (
                  perguntaForm.alternativas.map((alternativa, index) => (
                    <div
                      key={`vf-${index}`}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-sm font-semibold text-slate-900">
                          {alternativa.texto}
                        </div>

                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <input
                            type="radio"
                            name="alternativa-correta"
                            checked={alternativa.correta}
                            onChange={() => marcarAlternativaCorreta(index)}
                          />
                          Correta
                        </label>
                      </div>
                    </div>
                  ))
                ) : (
                  perguntaForm.alternativas.map((alternativa, index) => (
                    <div
                      key={`alternativa-${index}`}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
                        <div className="md:col-span-5">
                          <label className="text-sm font-medium text-slate-700">
                            Alternativa {index + 1}
                          </label>
                          <input
                            type="text"
                            value={alternativa.texto}
                            onChange={(e) =>
                              atualizarAlternativaTexto(index, e.target.value)
                            }
                            placeholder={`Texto da alternativa ${index + 1}`}
                            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                          />
                        </div>

                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                              type="radio"
                              name="alternativa-correta"
                              checked={alternativa.correta}
                              onChange={() => marcarAlternativaCorreta(index)}
                            />
                            Correta
                          </label>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-600">
                  Questão descritiva: não haverá resposta esperada nem critério
                  salvo. O professor fará a correção manual depois.
                </p>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={savingPergunta}
                className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingPergunta
                  ? editingPerguntaId
                    ? "Salvando edição..."
                    : "Salvando pergunta..."
                  : editingPerguntaId
                  ? "Salvar edição da pergunta"
                  : "Salvar pergunta"}
              </button>
            </div>
          </form>

          <div className="card-base p-5">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                Perguntas já cadastradas
              </h3>
              <p className="text-sm text-slate-500">
                Aqui você pode editar, excluir e trocar a imagem da questão.
              </p>
            </div>

            <div className="space-y-4">
              {avaliacaoDetalhada.perguntas?.length ? (
                avaliacaoDetalhada.perguntas.map((pergunta: any) => (
                  <div
                    key={pergunta.id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-500">
                          Pergunta {pergunta.ordem}
                        </p>
                        <h4 className="text-base font-bold text-slate-900">
                          {pergunta.enunciado}
                        </h4>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          Peso: {formatarValor(pergunta.peso)}
                        </span>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {pergunta.tipoQuestao === "VERDADEIRO_FALSO"
                            ? "Verdadeiro / Falso"
                            : pergunta.tipoQuestao === "DESCRITIVA"
                            ? "Descritiva"
                            : "Múltipla escolha"}
                        </span>
                      </div>
                    </div>

                    {pergunta.imagemUrl ? (
                      <div className="mb-4">
                        <img
                          src={normalizarImagemUrl(pergunta.imagemUrl)}
                          alt="Imagem da questão"
                          className="max-h-72 rounded-xl border border-slate-200 object-contain"
                        />
                      </div>
                    ) : null}

                    {pergunta.tipoQuestao === "DESCRITIVA" ? (
                      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm text-slate-700">
                          Questão descritiva sem gabarito prévio. Correção manual
                          do professor.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pergunta.alternativas?.map((alternativa: any) => (
                          <div
                            key={alternativa.id}
                            className={`rounded-xl border px-3 py-2 text-sm ${
                              alternativa.correta
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            {alternativa.texto}
                            {alternativa.correta ? "  •  Gabarito oficial" : ""}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                      <button
                        type="button"
                        onClick={() => iniciarEdicaoPergunta(pergunta)}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                      >
                        Editar questão
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExcluirPergunta(pergunta.id)}
                        disabled={deletingPerguntaId === pergunta.id}
                        className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingPerguntaId === pergunta.id
                          ? "Excluindo..."
                          : "Excluir questão"}
                      </button>

                      <label className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                        {uploadingImagemPerguntaId === pergunta.id
                          ? "Enviando imagem..."
                          : "Enviar imagem do computador"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleUploadImagemPergunta(
                              pergunta.id,
                              e.target.files?.[0] || null
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">
                    Nenhuma pergunta cadastrada ainda nesta avaliação.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="card-base p-5">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                Autorizar refazer para alunos
              </h3>
              <p className="text-sm text-slate-500">
                O aluno só poderá refazer a avaliação depois de concluída se o professor liberar.
              </p>
            </div>

            {loadingAlunosAvaliacao ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-500">Carregando alunos...</p>
              </div>
            ) : !alunosAvaliacao.length ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-500">
                  Nenhum aluno encontrado para esta avaliação.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {alunosAvaliacao.map((aluno) => {
                  const tentativa = aluno.tentativa || null;
                  const podeSelecionar = Boolean(tentativa?.finalizada);

                  return (
                    <label
                      key={aluno.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {aluno.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Matrícula: {aluno.matricula || "-"} • Status:{" "}
                          {aluno.status}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {tentativa?.finalizada
                            ? tentativa.refazerAutorizado
                              ? "Concluiu a avaliação e o refazer já foi autorizado"
                              : "Concluiu a avaliação"
                            : tentativa
                            ? "Iniciou, mas ainda não concluiu"
                            : "Ainda não iniciou"}
                        </p>

                        {tentativa ? (
                          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <p className="text-[11px] text-slate-500">Acertos</p>
                              <p className="text-sm font-semibold text-slate-900">
                                {tentativa.totalAcertos || 0}
                              </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <p className="text-[11px] text-slate-500">Questões</p>
                              <p className="text-sm font-semibold text-slate-900">
                                {tentativa.totalQuestoes || 0}
                              </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <p className="text-[11px] text-slate-500">Nota objetiva</p>
                              <p className="text-sm font-semibold text-slate-900">
                                {tentativa.notaObjetiva != null
                                  ? Number(tentativa.notaObjetiva)
                                      .toFixed(2)
                                      .replace(".", ",")
                                  : "-"}
                              </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <p className="text-[11px] text-slate-500">Concluiu em</p>
                              <p className="text-sm font-semibold text-slate-900">
                                {tentativa.finalizadaEm
                                  ? new Date(tentativa.finalizadaEm).toLocaleDateString("pt-BR")
                                  : "-"}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <input
                        type="checkbox"
                        disabled={!podeSelecionar}
                        checked={alunosSelecionadosRefazer.includes(aluno.id)}
                        onChange={(e) => {
                          setAlunosSelecionadosRefazer((prev) =>
                            e.target.checked
                              ? [...prev, aluno.id]
                              : prev.filter((id) => id !== aluno.id)
                          );
                        }}
                      />
                    </label>
                  );
                })}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={autorizarRefazerProfessor}
                    disabled={autorizandoRefazer}
                    className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                  >
                    {autorizandoRefazer ? "Autorizando..." : "Autorizar refazer"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

          <div className="card-base p-5">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                Correção manual das questões descritivas
              </h3>
              <p className="text-sm text-slate-500">
                Aqui o professor visualiza a resposta do aluno, atribui a nota da questão e escreve um feedback.
              </p>
            </div>

            <div className="space-y-4">
              {avaliacaoDetalhada?.tentativas?.some((tentativa: any) =>
                (tentativa.respostas || []).some(
                  (resposta: any) => resposta?.pergunta?.tipoQuestao === "DESCRITIVA"
                )
              ) ? (
                avaliacaoDetalhada.tentativas.map((tentativa: any) => {
                  const respostasDescritivas = (tentativa.respostas || []).filter(
                    (resposta: any) => resposta?.pergunta?.tipoQuestao === "DESCRITIVA"
                  );

                  if (!respostasDescritivas.length) {
                    return null;
                  }

                  return (
                    <div
                      key={tentativa.id}
                      className="rounded-2xl border border-slate-200 p-5"
                    >
                      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h4 className="text-base font-bold text-slate-900">
                            {tentativa.aluno?.name || "Aluno"}
                          </h4>
                          <p className="text-sm text-slate-500">
                            Matrícula: {tentativa.aluno?.matricula || "-"} •
                            Acertos: {tentativa.totalAcertos || 0}/{tentativa.totalQuestoes || 0}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div className="rounded-xl bg-slate-50 px-3 py-2">
                            <p className="text-[11px] text-slate-500">Nota objetiva</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {tentativa.notaObjetiva != null
                                ? formatarValor(tentativa.notaObjetiva)
                                : "-"}
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-50 px-3 py-2">
                            <p className="text-[11px] text-slate-500">Nota descritiva</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {tentativa.notaDescritiva != null
                                ? formatarValor(tentativa.notaDescritiva)
                                : "-"}
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-50 px-3 py-2">
                            <p className="text-[11px] text-slate-500">Nota final</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {tentativa.notaFinal != null
                                ? formatarValor(tentativa.notaFinal)
                                : "-"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {respostasDescritivas.map((resposta: any) => {
                          const pesoMaximo = Number(resposta?.pergunta?.peso || 0);

                          return (
                            <div
                              key={resposta.id}
                              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-500">
                                    Pergunta {resposta?.pergunta?.ordem}
                                  </p>
                                  <h5 className="text-base font-bold text-slate-900">
                                    {resposta?.pergunta?.enunciado}
                                  </h5>
                                </div>

                                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                  Peso máximo: {formatarValor(pesoMaximo)}
                                </span>
                              </div>

                              {resposta?.pergunta?.imagemUrl ? (
                                <div className="mb-4">
                                  <img
                                    src={normalizarImagemUrl(resposta.pergunta.imagemUrl)}
                                    alt="Imagem da questão"
                                    className="max-h-72 rounded-xl border border-slate-200 object-contain"
                                  />
                                </div>
                              ) : null}

                              <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                                <p className="text-sm font-semibold text-slate-500">
                                  Resposta do aluno
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                                  {resposta?.respostaTexto || "Aluno não digitou resposta."}
                                </p>
                              </div>

                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                  <label className="text-sm font-medium text-slate-700">
                                    Nota da questão
                                  </label>
                                  <input
                                    type="text"
                                    value={correcoesDescritivas[resposta.id]?.notaManual || ""}
                                    onChange={(e) =>
                                      setCorrecoesDescritivas((prev) => ({
                                        ...prev,
                                        [resposta.id]: {
                                          notaManual: e.target.value,
                                          feedbackProfessor:
                                            prev[resposta.id]?.feedbackProfessor || "",
                                        },
                                      }))
                                    }
                                    placeholder={`Máximo ${formatarValor(pesoMaximo)}`}
                                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                                  />
                                </div>

                                <div>
                                  <label className="text-sm font-medium text-slate-700">
                                    Status
                                  </label>
                                  <div className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                    {resposta?.corrigidaManual
                                      ? "Corrigida manualmente"
                                      : "Pendente de correção"}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4">
                                <label className="text-sm font-medium text-slate-700">
                                  Feedback do professor
                                </label>
                                <textarea
                                  value={correcoesDescritivas[resposta.id]?.feedbackProfessor || ""}
                                  onChange={(e) =>
                                    setCorrecoesDescritivas((prev) => ({
                                      ...prev,
                                      [resposta.id]: {
                                        notaManual: prev[resposta.id]?.notaManual || "",
                                        feedbackProfessor: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Escreva um retorno para o aluno"
                                  className="mt-1 min-h-[110px] w-full rounded-xl border border-slate-300 px-3 py-3"
                                />
                              </div>

                              <div className="mt-4 flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    corrigirRespostaDescritiva(resposta.id, pesoMaximo)
                                  }
                                  disabled={savingCorrecaoRespostaId === resposta.id}
                                  className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {savingCorrecaoRespostaId === resposta.id
                                    ? "Salvando correção..."
                                    : "Salvar correção descritiva"}
                                </button>

                                {resposta?.corrigidaManual ? (
                                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                    Nota salva:{" "}
                                    {resposta?.notaManual != null
                                      ? formatarValor(resposta.notaManual)
                                      : "-"}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">
                    Nenhuma resposta descritiva foi enviada ainda para esta avaliação.
                  </p>
                </div>
              )}
            </div>
          </div>

      {isGestor && avaliacaoDetalhada ? (
        <div className="space-y-6">
          <div className="card-base p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Detalhes da avaliacao
                </h3>
                <p className="text-sm text-slate-500">
                  O gestor pode consultar as questoes e acompanhar os resultados por aluno, sem editar a prova.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAvaliacaoDetalhada(null);
                  setAlunosAvaliacao([]);
                  setAlunoResultadoFiltro("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Fechar detalhes
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Titulo</p>
                <p className="mt-2 text-base font-bold text-slate-900">
                  {avaliacaoDetalhada.titulo}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Disciplina</p>
                <p className="mt-2 text-base font-bold text-slate-900">
                  {avaliacaoDetalhada.turmaProfessor?.disciplina || "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Professor</p>
                <p className="mt-2 text-base font-bold text-slate-900">
                  {avaliacaoDetalhada.turmaProfessor?.professor?.name || "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Turma</p>
                <p className="mt-2 text-base font-bold text-slate-900">
                  {avaliacaoDetalhada.turmaProfessor?.turma?.name}
                  {avaliacaoDetalhada.turmaProfessor?.turma?.turno
                    ? ` (${formatTurno(avaliacaoDetalhada.turmaProfessor.turma.turno)})`
                    : ""}
                </p>
              </div>
            </div>
          </div>

          <div className="card-base p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Questoes da avaliacao</h3>
                <p className="text-sm text-slate-500">
                  Visualizacao completa do conteudo aplicado aos alunos.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {avaliacaoDetalhada.perguntas?.length || 0} questoes
              </span>
            </div>

            <div className="space-y-4">
              {avaliacaoDetalhada.perguntas?.length ? (
                avaliacaoDetalhada.perguntas.map((pergunta: any) => (
                  <div
                    key={pergunta.id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-500">
                          Pergunta {pergunta.ordem}
                        </p>
                        <h4 className="text-base font-bold text-slate-900">
                          {pergunta.enunciado}
                        </h4>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          Peso: {formatarValor(pergunta.peso)}
                        </span>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {pergunta.tipoQuestao === "VERDADEIRO_FALSO"
                            ? "Verdadeiro / Falso"
                            : pergunta.tipoQuestao === "DESCRITIVA"
                              ? "Descritiva"
                              : "Multipla escolha"}
                        </span>
                      </div>
                    </div>

                    {pergunta.imagemUrl ? (
                      <div className="mb-4">
                        <img
                          src={normalizarImagemUrl(pergunta.imagemUrl)}
                          alt="Imagem da questao"
                          className="max-h-72 rounded-xl border border-slate-200 object-contain"
                        />
                      </div>
                    ) : null}

                    {pergunta.tipoQuestao === "DESCRITIVA" ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        Questao descritiva com correcao posterior do professor.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pergunta.alternativas?.map((alternativa: any) => (
                          <div
                            key={alternativa.id}
                            className={`rounded-xl border px-3 py-2 text-sm ${
                              alternativa.correta
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            {alternativa.texto}
                            {alternativa.correta ? "  -  Gabarito oficial" : ""}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">
                    Esta avaliacao ainda nao possui questoes cadastradas.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="card-base p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Resultados dos alunos</h3>
                <p className="text-sm text-slate-500">
                  Selecione um aluno da turma para consultar desempenho, status e respostas registradas.
                </p>
              </div>

              <div className="w-full md:w-80">
                <label className="text-sm font-medium text-slate-700">Aluno</label>
                <select
                  value={alunoResultadoFiltro}
                  onChange={(e) => setAlunoResultadoFiltro(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {alunosAvaliacao.map((aluno) => (
                    <option key={aluno.id} value={aluno.id}>
                      {aluno.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingAlunosAvaliacao ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-500">Carregando alunos...</p>
              </div>
            ) : !alunosAvaliacao.length ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-500">
                  Nenhum aluno encontrado para esta avaliacao.
                </p>
              </div>
            ) : alunoResultadoSelecionado ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-900">
                        {alunoResultadoSelecionado.name}
                      </h4>
                      <p className="text-sm text-slate-500">
                        Matricula: {alunoResultadoSelecionado.matricula || "-"} - Status: {alunoResultadoSelecionado.status || "-"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {tentativaResultadoSelecionado?.finalizada
                          ? "Avaliacao concluida"
                          : tentativaResultadoSelecionado?.id
                            ? "Avaliacao em andamento"
                            : "Avaliacao ainda nao iniciada"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">Nota final</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {tentativaResultadoSelecionado?.notaFinal != null
                            ? formatarValor(tentativaResultadoSelecionado.notaFinal)
                            : "-"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">Nota objetiva</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {tentativaResultadoSelecionado?.notaObjetiva != null
                            ? formatarValor(tentativaResultadoSelecionado.notaObjetiva)
                            : "-"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">Nota descritiva</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {tentativaResultadoSelecionado?.notaDescritiva != null
                            ? formatarValor(tentativaResultadoSelecionado.notaDescritiva)
                            : "-"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">Acertos</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {tentativaResultadoSelecionado
                            ? `${tentativaResultadoSelecionado.totalAcertos || 0}/${tentativaResultadoSelecionado.totalQuestoes || 0}`
                            : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {tentativaResultadoSelecionado?.respostas?.length ? (
                  <div className="space-y-4">
                    {avaliacaoDetalhada.perguntas?.map((pergunta: any) => {
                      const respostaAluno = tentativaResultadoSelecionado.respostas.find(
                        (resposta: any) => resposta.perguntaId === pergunta.id
                      );

                      return (
                        <div
                          key={`resultado-${pergunta.id}`}
                          className="rounded-2xl border border-slate-200 p-4"
                        >
                          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-500">
                                Pergunta {pergunta.ordem}
                              </p>
                              <h5 className="text-base font-bold text-slate-900">
                                {pergunta.enunciado}
                              </h5>
                            </div>

                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                              {respostaAluno?.correta == null
                                ? "Sem correcao automatica"
                                : respostaAluno.correta
                                  ? "Resposta correta"
                                  : "Resposta incorreta"}
                            </span>
                          </div>

                          {pergunta.tipoQuestao === "DESCRITIVA" ? (
                            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Resposta do aluno
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                                  {respostaAluno?.respostaTexto || "Sem resposta registrada."}
                                </p>
                              </div>

                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Nota manual
                                  </p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">
                                    {respostaAluno?.notaManual != null
                                      ? formatarValor(respostaAluno.notaManual)
                                      : "Aguardando correcao"}
                                  </p>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Feedback do professor
                                  </p>
                                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                                    {respostaAluno?.feedbackProfessor || "Sem feedback registrado."}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {pergunta.alternativas?.map((alternativa: any) => {
                                const marcada = respostaAluno?.alternativaId === alternativa.id;
                                return (
                                  <div
                                    key={alternativa.id}
                                    className={`rounded-xl border px-3 py-2 text-sm ${
                                      marcada
                                        ? alternativa.correta
                                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                          : "border-rose-300 bg-rose-50 text-rose-800"
                                        : alternativa.correta
                                          ? "border-blue-200 bg-blue-50 text-blue-800"
                                          : "border-slate-200 bg-white text-slate-700"
                                    }`}
                                  >
                                    {alternativa.texto}
                                    {marcada ? "  -  resposta do aluno" : ""}
                                    {!marcada && alternativa.correta ? "  -  gabarito" : ""}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <p className="text-sm text-slate-500">
                      Este aluno ainda nao possui respostas registradas nesta avaliacao.
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {isAluno && avaliacaoDetalhada ? (
        <div className="card-base p-5 space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Detalhes da avaliação
              </h3>
              <p className="text-sm text-slate-500">
                Aqui o aluno visualiza a avaliação publicada pelos professores da
                turma dele.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAvaliacaoDetalhada(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Fechar detalhes
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Título</p>
              <p className="mt-2 text-base font-bold text-slate-900">
                {avaliacaoDetalhada.titulo}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Disciplina</p>
              <p className="mt-2 text-base font-bold text-slate-900">
                {avaliacaoDetalhada.turmaProfessor?.disciplina}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Professor</p>
              <p className="mt-2 text-base font-bold text-slate-900">
                {avaliacaoDetalhada.turmaProfessor?.professor?.name || "-"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Turma</p>
              <p className="mt-2 text-base font-bold text-slate-900">
                {avaliacaoDetalhada.turmaProfessor?.turma?.name}
                {avaliacaoDetalhada.turmaProfessor?.turma?.turno
                  ? ` (${formatTurno(avaliacaoDetalhada.turmaProfessor.turma.turno)})`
                  : ""}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Valor</p>
              <p className="mt-2 text-base font-bold text-slate-900">
                {formatarValor(avaliacaoDetalhada.valor)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Questões</p>
              <p className="mt-2 text-base font-bold text-slate-900">
                {avaliacaoDetalhada.perguntas?.length || 0}
              </p>
            </div>
          </div>

          {avaliacaoDetalhada.instrucoes ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-800">Instruções</p>
              <p className="mt-2 text-sm text-blue-700">
                {avaliacaoDetalhada.instrucoes}
              </p>
            </div>
          ) : null}

          {avaliacaoDetalhada?.tentativas?.[0]?.finalizada ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm text-emerald-700">Nota obtida</p>
                <p className="mt-2 text-2xl font-bold text-emerald-800">
                  {avaliacaoDetalhada?.tentativas?.[0]?.notaFinal != null
                    ? formatarValor(avaliacaoDetalhada?.tentativas?.[0]?.notaFinal)
                    : avaliacaoDetalhada?.tentativas?.[0]?.notaObjetiva != null
                    ? formatarValor(avaliacaoDetalhada?.tentativas?.[0]?.notaObjetiva)
                    : "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Nota objetiva</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {avaliacaoDetalhada?.tentativas?.[0]?.notaObjetiva != null
                    ? formatarValor(avaliacaoDetalhada?.tentativas?.[0]?.notaObjetiva)
                    : "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Nota descritiva</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {avaliacaoDetalhada?.tentativas?.[0]?.notaDescritiva != null
                    ? formatarValor(avaliacaoDetalhada?.tentativas?.[0]?.notaDescritiva)
                    : "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Acertos</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {avaliacaoDetalhada?.tentativas?.[0]?.totalAcertos || 0}/
                  {avaliacaoDetalhada?.tentativas?.[0]?.totalQuestoes || 0}
                </p>
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            <h4 className="text-base font-bold text-slate-900">Questões</h4>

            {avaliacaoDetalhada.perguntas?.length ? (
              avaliacaoDetalhada.perguntas.map((pergunta: any) => {
                const tentativaFinalizada = Boolean(
                  avaliacaoDetalhada?.tentativas?.[0]?.finalizada
                );

                return (
                  <div
                    key={pergunta.id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-500">
                          Pergunta {pergunta.ordem}
                        </p>
                        <h5 className="text-base font-bold text-slate-900">
                          {pergunta.enunciado}
                        </h5>
                      </div>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        Peso: {formatarValor(pergunta.peso)}
                      </span>
                    </div>

                    {pergunta.imagemUrl ? (
                      <div className="mb-4">
                        <img
                          src={normalizarImagemUrl(pergunta.imagemUrl)}
                          alt="Imagem da questão"
                          className="max-h-72 rounded-xl border border-slate-200 object-contain"
                        />
                      </div>
                    ) : null}

                    {pergunta.tipoQuestao === "DESCRITIVA" ? (
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <textarea
                          value={respostasAluno[pergunta.id]?.respostaTexto || ""}
                          onChange={(e) =>
                            setRespostasAluno((prev) => ({
                              ...prev,
                              [pergunta.id]: {
                                ...prev[pergunta.id],
                                respostaTexto: e.target.value,
                              },
                            }))
                          }
                          disabled={tentativaFinalizada}
                          placeholder="Digite sua resposta aqui"
                          className="min-h-[120px] w-full rounded-xl border border-slate-300 px-3 py-3 disabled:bg-slate-100"
                        />

                        {tentativaFinalizada ? (
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Nota da questão descritiva
                              </p>
                              <p className="mt-2 text-lg font-bold text-slate-900">
                                {avaliacaoDetalhada?.tentativas?.[0]?.respostas?.find(
                                  (resposta: any) => resposta.perguntaId === pergunta.id
                                )?.notaManual != null
                                  ? formatarValor(
                                      avaliacaoDetalhada?.tentativas?.[0]?.respostas?.find(
                                        (resposta: any) => resposta.perguntaId === pergunta.id
                                      )?.notaManual
                                    )
                                  : "Aguardando correção"}
                              </p>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Status da correção
                              </p>
                              <p className="mt-2 text-sm font-semibold text-slate-900">
                                {avaliacaoDetalhada?.tentativas?.[0]?.respostas?.find(
                                  (resposta: any) => resposta.perguntaId === pergunta.id
                                )?.corrigidaManual
                                  ? "Corrigida pelo professor"
                                  : "Aguardando correção do professor"}
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {tentativaFinalizada &&
                        avaliacaoDetalhada?.tentativas?.[0]?.respostas?.find(
                          (resposta: any) => resposta.perguntaId === pergunta.id
                        )?.feedbackProfessor ? (
                          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                              Feedback do professor
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-blue-900">
                              {
                                avaliacaoDetalhada?.tentativas?.[0]?.respostas?.find(
                                  (resposta: any) => resposta.perguntaId === pergunta.id
                                )?.feedbackProfessor
                              }
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pergunta.alternativas?.map((alternativa: any) => (
                          <label
                            key={alternativa.id}
                            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                          >
                            <input
                              type="radio"
                              name={`pergunta-${pergunta.id}`}
                              checked={
                                respostasAluno[pergunta.id]?.alternativaId ===
                                alternativa.id
                              }
                              onChange={() =>
                                setRespostasAluno((prev) => ({
                                  ...prev,
                                  [pergunta.id]: {
                                    ...prev[pergunta.id],
                                    alternativaId: alternativa.id,
                                  },
                                }))
                              }
                              disabled={tentativaFinalizada}
                            />
                            <span>{alternativa.texto}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-500">
                  Esta avaliação ainda não possui questões cadastradas.
                </p>
              </div>
            )}
          </div>

          <div className="card-base p-5">
            <div className="flex flex-wrap gap-3">
              {((!tentativaAlunoId &&
                !avaliacaoDetalhada?.tentativas?.[0]?.finalizada) ||
                (avaliacaoDetalhada?.tentativas?.[0]?.finalizada &&
                  avaliacaoDetalhada?.tentativas?.[0]?.refazerAutorizado)) ? (
                <button
                  type="button"
                  onClick={async () => {
                    const tentativa = await iniciarTentativaAluno(
                      avaliacaoDetalhada.id
                    );
                    if (tentativa?.id) {
                      setTentativaAlunoId(tentativa.id);
                      await handleVerDetalhesAluno(avaliacaoDetalhada.id);
                    }
                  }}
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {avaliacaoDetalhada?.tentativas?.[0]?.finalizada &&
                  avaliacaoDetalhada?.tentativas?.[0]?.refazerAutorizado
                    ? "Refazer avaliação"
                    : "Iniciar avaliação"}
                </button>
              ) : null}

              {tentativaAlunoId &&
              !avaliacaoDetalhada?.tentativas?.[0]?.finalizada ? (
                <>
                  <button
                    type="button"
                    onClick={salvarRespostasAluno}
                    disabled={savingRespostasAluno}
                    className="rounded-xl bg-slate-700 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingRespostasAluno ? "Salvando..." : "Salvar respostas"}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const salvou = await salvarRespostasAluno();
                      if (salvou) {
                        await concluirAvaliacaoAluno();
                      }
                    }}
                    disabled={concluindoAluno || savingRespostasAluno}
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {concluindoAluno ? "Concluindo..." : "Concluir avaliação"}
                  </button>
                </>
              ) : null}

              {avaliacaoDetalhada?.tentativas?.[0]?.finalizada ? (
                <div
                  className={`rounded-xl px-4 py-3 text-sm ${
                    avaliacaoDetalhada?.tentativas?.[0]?.refazerAutorizado
                      ? "border border-violet-200 bg-violet-50 text-violet-700"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {avaliacaoDetalhada?.tentativas?.[0]?.refazerAutorizado
                    ? "Você já concluiu esta avaliação, mas o professor autorizou uma nova tentativa."
                    : "Avaliação já concluída. Confira acima a sua nota obtida. Nas questões descritivas, a nota e o feedback aparecem assim que o professor corrigir."}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}



