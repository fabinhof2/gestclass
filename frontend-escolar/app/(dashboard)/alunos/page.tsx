"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpenCheck, CalendarDays, ClipboardCheck, Download, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import ScheduleGrid, {
  type ScheduleAula,
  type ScheduleTurma,
} from "@/components/ui/schedule-grid";
import StudentCard from "@/components/ui/student-card";
import { useAuth } from "@/context/auth-context";
import { API_URL, apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type AulaGrade = ScheduleAula;

type PeriodoAvaliacao = "PRIMEIRO" | "SEGUNDO" | "TERCEIRO" | "QUARTO";

const PERIODO_LABELS: Record<PeriodoAvaliacao, string> = {
  PRIMEIRO: "1º bimestre",
  SEGUNDO: "2º bimestre",
  TERCEIRO: "3º bimestre",
  QUARTO: "4º bimestre",
};

function normalizarFotoUrl(url?: string | null) {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${API_URL}${url}`;
}

export default function AlunosPage() {
  const { token, user, selectedSchool } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [turmas, setTurmas] = useState<any[]>([]);

  const [name, setName] = useState("");
  const [matricula, setMatricula] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [responsavelEmail, setResponsavelEmail] = useState("");
  const [responsavelTelefone, setResponsavelTelefone] = useState("");
  const [responsavelEndereco, setResponsavelEndereco] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [responsavelFinanceiro, setResponsavelFinanceiro] = useState(false);
  const [turmaId, setTurmaId] = useState("");
  const [alunoEmail, setAlunoEmail] = useState("");
  const [alunoPassword, setAlunoPassword] = useState("");
  const [alunoAtivo, setAlunoAtivo] = useState(true);

  const [search, setSearch] = useState(searchParams.get("busca") || "");
  const [turmaSelecionada, setTurmaSelecionada] = useState("");
  const [fotoAluno, setFotoAluno] = useState<File | null>(null);
  const [documentoAluno, setDocumentoAluno] = useState<File | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState("");
  const [documentosAluno, setDocumentosAluno] = useState<any[]>([]);
  const [loadingDocumentos, setLoadingDocumentos] = useState(false);
  const [alunoSelecionadoDocs, setAlunoSelecionadoDocs] = useState<any>(null);

  const [editingAlunoId, setEditingAlunoId] = useState<string | null>(null);
  const [alunoBoletim, setAlunoBoletim] = useState<any>(null);
  const [alunoGrade, setAlunoGrade] = useState<any>(null);
  const [professorAluno, setProfessorAluno] = useState<any>(null);
  const [professorAlunoVisao, setProfessorAlunoVisao] = useState<any>(null);
  const [professorAlunoTab, setProfessorAlunoTab] = useState<"notas" | "frequencias" | "agendamentos">("notas");
  const [professorPeriodo, setProfessorPeriodo] = useState<PeriodoAvaliacao>("PRIMEIRO");
  const [professorAno, setProfessorAno] = useState(new Date().getFullYear());
  const [loadingProfessorVisao, setLoadingProfessorVisao] = useState(false);
  const [loadingGrade, setLoadingGrade] = useState(false);
  const [aulasGrade, setAulasGrade] = useState<AulaGrade[]>([]);

  const [responsaveisEncontrados, setResponsaveisEncontrados] = useState<any[]>([]);
  const [buscandoResponsavel, setBuscandoResponsavel] = useState(false);
  const [responsavelSelecionadoId, setResponsavelSelecionadoId] = useState<string | null>(null);
  const [mostrarSugestoesResponsavel, setMostrarSugestoesResponsavel] = useState(false);

  const [selectedAlunoIds, setSelectedAlunoIds] = useState<string[]>([]);
  const [turmaDestinoPromocao, setTurmaDestinoPromocao] = useState("");
  const [promotingAlunos, setPromotingAlunos] = useState(false);
  const [promotionResult, setPromotionResult] = useState<any | null>(null);

  const fotoInputRef = useRef<HTMLInputElement | null>(null);

  const canEditStudent =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";

  const canPromoteStudents =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";

  const canOpenResponsavel =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";

  const requiresSelectedSchool = user?.role === "SUPERUSUARIO";
  const schoolIdHeader = selectedSchool?.id || "";
  const hasSchoolContext = requiresSelectedSchool ?!!schoolIdHeader : true;
  const isProfessor = user?.role === "PROFESSOR";

  async function fetchAlunos() {
    if (!token || !hasSchoolContext) {
      setStudents([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch(apiUrl("/alunos"), {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao buscar alunos");
      }

      setStudents(Array.isArray(data) ?data : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar alunos");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTurmas() {
    if (!token || !hasSchoolContext) {
      setTurmas([]);
      return;
    }

    try {
      const res = await fetch(apiUrl("/turmas"), {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao buscar turmas");
      }

      setTurmas(Array.isArray(data) ?data : []);
    } catch (err) {
      console.error("Erro ao carregar turmas", err);
    }
  }

  async function fetchDocumentos(alunoId: string) {
    if (!token) return;

    try {
      setLoadingDocumentos(true);

      const res = await fetch(apiUrl(`/alunos/${alunoId}/documentos`), {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message);
      }

      setDocumentosAluno(Array.isArray(data) ?data : []);
    } catch (err: any) {
      setError(err.message || "Erro ao buscar documentos");
    } finally {
      setLoadingDocumentos(false);
    }
  }

  async function fetchGradeHorariaByTurma(selectedTurmaId: string) {
    if (!token || !selectedTurmaId) {
      setAulasGrade([]);
      return;
    }

    try {
      setLoadingGrade(true);

      const res = await fetch(apiUrl(`/aulas/${selectedTurmaId}`), {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao buscar grade horária");
      }

      setAulasGrade(Array.isArray(data) ?data : []);
    } catch (err: any) {
      setError(err.message || "Erro ao buscar grade horária");
      setAulasGrade([]);
    } finally {
      setLoadingGrade(false);
    }
  }

  async function buscarResponsaveisPorNome(nome: string) {
    const termo = String(nome || "").trim();

    if (!token || !hasSchoolContext || termo.length < 3) {
      setResponsaveisEncontrados([]);
      setMostrarSugestoesResponsavel(false);
      return;
    }

    try {
      setBuscandoResponsavel(true);

      const res = await fetch(apiUrl("/alunos/responsaveis/search"), {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
          "x-responsavel-term": termo,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao buscar responsáveis.");
      }

      setResponsaveisEncontrados(Array.isArray(data) ?data : []);
      setMostrarSugestoesResponsavel(true);
    } catch (err) {
      console.error(err);
      setResponsaveisEncontrados([]);
      setMostrarSugestoesResponsavel(false);
    } finally {
      setBuscandoResponsavel(false);
    }
  }

  async function handleUploadDocumento(alunoId: string) {
    if (!documentoAluno || !tipoDocumento) {
      setError("Selecione o documento e o tipo.");
      return;
    }

    try {
      setError("");
      setSuccessMessage("");

      const formData = new FormData();
      formData.append("file", documentoAluno);
      formData.append("tipo", tipoDocumento);

      const res = await fetch(apiUrl(`/alunos/${alunoId}/documentos`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message);
      }

      setDocumentoAluno(null);
      setTipoDocumento("");
      setSuccessMessage("Documento enviado com sucesso.");

      await fetchDocumentos(alunoId);
    } catch (err: any) {
      setError(err.message || "Erro ao enviar documento");
    }
  }

  async function handleExcluirDocumento(docId: string) {
    if (!token || !alunoSelecionadoDocs?.id) return;

    const confirmar = confirm("Deseja realmente excluir este documento do aluno?");
    if (!confirmar) return;

    try {
      setError("");
      setSuccessMessage("");

      const res = await fetch(apiUrl(`/alunos/documentos/${docId}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao excluir documento");
      }

      setSuccessMessage("Documento excluído com sucesso.");
      await fetchDocumentos(alunoSelecionadoDocs.id);
    } catch (err: any) {
      setError(err.message || "Erro ao excluir documento");
    }
  }

  async function handleBaixarDocumento(doc: any) {
    if (!token) {
      setError("Sessão inválida. Faça login novamente.");
      return;
    }

    try {
      setError("");
      setSuccessMessage("");

      const res = await fetch(apiUrl(`/alunos/documentos/download/${doc.id}`), {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
        },
      });

      if (!res.ok) {
        let mensagem = "Erro ao baixar documento";
        try {
          const data = await res.json();
          mensagem = data.message || mensagem;
        } catch {}
        throw new Error(mensagem);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.nomeOriginal || "documento";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Erro ao baixar documento");
    }
  }

  useEffect(() => {
    fetchAlunos();
  }, [token, schoolIdHeader, hasSchoolContext]);

  useEffect(() => {
    fetchTurmas();
  }, [token, schoolIdHeader, hasSchoolContext]);

  useEffect(() => {
    const termoBusca = searchParams.get("busca") || "";

    if (termoBusca) {
      setSearch(termoBusca);
    }
  }, [searchParams]);

  useEffect(() => {
    const termo = responsavel.trim();

    if (responsavelSelecionadoId) {
      return;
    }

    if (termo.length < 3) {
      setResponsaveisEncontrados([]);
      setMostrarSugestoesResponsavel(false);
      return;
    }

    const timer = setTimeout(() => {
      buscarResponsaveisPorNome(termo);
    }, 400);

    return () => clearTimeout(timer);
  }, [responsavel, token, schoolIdHeader, hasSchoolContext, responsavelSelecionadoId]);

  useEffect(() => {
    setSelectedAlunoIds([]);
    setTurmaDestinoPromocao("");
    setPromotionResult(null);
  }, [turmaSelecionada]);

  function resetForm() {
    setName("");
    setMatricula("");
    setResponsavel("");
    setResponsavelEmail("");
    setResponsavelTelefone("");
    setResponsavelEndereco("");
    setParentesco("");
    setResponsavelFinanceiro(false);
    setTurmaId("");
    setAlunoEmail("");
    setAlunoPassword("");
    setAlunoAtivo(true);
    setFotoAluno(null);
    setEditingAlunoId(null);
    setResponsaveisEncontrados([]);
    setBuscandoResponsavel(false);
    setResponsavelSelecionadoId(null);
    setMostrarSugestoesResponsavel(false);

    if (fotoInputRef.current) {
      fotoInputRef.current.value = "";
    }
  }

  function handleFotoAlunoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setFotoAluno(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem válida para a foto do aluno.");
      setFotoAluno(null);
      event.target.value = "";
      return;
    }

    setError("");
    setFotoAluno(file);
  }

  function selecionarResponsavelExistente(responsavelItem: any) {
    setResponsavel(responsavelItem.name || "");
    setResponsavelEmail(responsavelItem.email || "");
    setResponsavelTelefone(responsavelItem.phone || "");
    setResponsavelEndereco(responsavelItem.address || "");
    setResponsavelSelecionadoId(responsavelItem.id || null);
    setMostrarSugestoesResponsavel(false);
    setSuccessMessage("");
    setError("");
  }

  function alterarResponsavelDigitado(value: string) {
    setResponsavel(value);
    setResponsavelSelecionadoId(null);

    if (!value.trim()) {
      setResponsaveisEncontrados([]);
      setMostrarSugestoesResponsavel(false);
    }
  }

  async function handleSalvarAluno() {
    setError("");
    setSuccessMessage("");

    if (!token) {
      setError("Sessão inválida. Faça login novamente.");
      return;
    }

    if (!hasSchoolContext) {
      setError("Selecione uma escola antes de cadastrar alunos.");
      return;
    }

    if (!name.trim()) {
      setError("Informe o nome do aluno.");
      return;
    }

    if (!turmaId) {
      setError("Selecione uma turma.");
      return;
    }

    if (!responsavel.trim()) {
      setError("Informe o nome do responsável.");
      return;
    }

    try {
      setSaving(true);

      const endpoint = editingAlunoId
        ? apiUrl(`/alunos/${editingAlunoId}`)
        : apiUrl("/alunos");

      const method = editingAlunoId ?"PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          matricula: matricula.trim(),
          responsavel: responsavel.trim(),
          turmaId,
          responsavelNome: responsavel.trim(),
          responsavelEmail: responsavelEmail.trim(),
          responsavelTelefone: responsavelTelefone.trim(),
          responsavelEndereco: responsavelEndereco.trim(),
          parentesco: parentesco.trim(),
          responsavelFinanceiro,
          alunoEmail: alunoEmail.trim(),
          alunoPassword: alunoPassword.trim(),
          alunoAtivo,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao salvar aluno");
      }

      const alunoId = data?.id;

      if (fotoAluno && alunoId) {
        const formData = new FormData();
        formData.append("file", fotoAluno);

        const fotoRes = await fetch(apiUrl(`/alunos/${alunoId}/foto`), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
          },
          body: formData,
        });

        const fotoData = await fotoRes.json();

        if (!fotoRes.ok) {
          throw new Error(fotoData.message || "Erro ao enviar foto do aluno");
        }
      }

      setSuccessMessage(
        editingAlunoId
          ?"Aluno atualizado com sucesso."
          : "Aluno cadastrado com sucesso."
      );
      resetForm();

      await fetchAlunos();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao salvar aluno");
    } finally {
      setSaving(false);
    }
  }

  async function handleExcluirAluno(student: any) {
    if (!token) {
      setError("Sessão inválida. Faça login novamente.");
      return;
    }

    const confirmar = confirm(`Deseja realmente excluir o aluno "${student.name}"?`);
    if (!confirmar) return;

    try {
      setError("");
      setSuccessMessage("");

      const res = await fetch(apiUrl(`/alunos/${student.id}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao excluir aluno");
      }

      setSuccessMessage(`Aluno "${student.name}" excluído com sucesso.`);

      if (editingAlunoId === student.id) {
        resetForm();
      }

      await fetchAlunos();
    } catch (err: any) {
      setError(err.message || "Erro ao excluir aluno");
    }
  }

  function handleEditarAluno(student: any) {
    setError("");
    setSuccessMessage("");
    setAlunoBoletim(null);
    setAlunoGrade(null);

    setEditingAlunoId(student.id);
    setName(student.name || "");
    setMatricula(student.matricula || "");
    setResponsavel(
      student.responsaveis?.[0]?.responsavel?.name || student.responsavel || ""
    );
    setResponsavelEmail(student.responsaveis?.[0]?.responsavel?.email || "");
    setResponsavelTelefone(student.responsaveis?.[0]?.responsavel?.phone || "");
    setResponsavelEndereco(student.responsaveis?.[0]?.responsavel?.address || "");
    setParentesco(student.responsaveis?.[0]?.parentesco || "");
    setResponsavelFinanceiro(!!student.responsaveis?.[0]?.isFinanceiro);
    setTurmaId(student.turmaId || "");
    setAlunoEmail(student.alunoEmail || "");
    setAlunoPassword("");
    setAlunoAtivo(
      typeof student.alunoAtivo === "boolean"
        ?student.alunoAtivo
        : String(student.status || "").toUpperCase() === "ATIVO"
    );
    setFotoAluno(null);
    setResponsavelSelecionadoId(
      student.responsaveis?.[0]?.responsavel?.id || null
    );
    setResponsaveisEncontrados([]);
    setMostrarSugestoesResponsavel(false);

    if (fotoInputRef.current) {
      fotoInputRef.current.value = "";
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleAlternarStatus(student: any) {
    if (!canEditStudent) return;

    if (!token) {
      setError("Sessão inválida. Faça login novamente.");
      return;
    }

    const statusAtual = String(student.status || "").toUpperCase();
    const novoStatus = statusAtual === "ATIVO" ?"INATIVO" : "ATIVO";

    try {
      setError("");
      setSuccessMessage("");
      setStatusLoadingId(student.id);

      const res = await fetch(apiUrl(`/alunos/${student.id}/status`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: novoStatus,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao atualizar status");
      }

      setSuccessMessage(
        `Status do aluno "${student.name}" alterado para ${novoStatus}.`
      );

      await fetchAlunos();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao atualizar status");
    } finally {
      setStatusLoadingId(null);
    }
  }

  const studentsFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();

    let filtered = students;

    if (turmaSelecionada) {
      filtered = filtered.filter(
        (student) => String(student.turmaId || "") === turmaSelecionada
      );
    }

    if (!term) {
      return filtered;
    }

    return filtered.filter((student) =>
      String(student.name || "").toLowerCase().includes(term)
    );
  }, [students, search, turmaSelecionada]);

  const turmaDestinoOptions = useMemo(() => {
    return turmas.filter((turma) => turma.id !== turmaSelecionada);
  }, [turmas, turmaSelecionada]);

  function handleAbrirDocumentos(student: any) {
    setAlunoBoletim(null);
    setAlunoGrade(null);
    setProfessorAluno(null);
    setAlunoSelecionadoDocs(student);
    fetchDocumentos(student.id);
  }

  function handleAbrirBoletim(student: any) {
    setAlunoSelecionadoDocs(null);
    setAlunoGrade(null);
    setProfessorAluno(null);
    setAlunoBoletim(null);
    router.push(`/boletim/${student.id}`);
  }

  async function handleAbrirGradeHoraria(student: any) {
    setAlunoSelecionadoDocs(null);
    setAlunoBoletim(null);
    setProfessorAluno(null);
    setAlunoGrade(student);
    await fetchGradeHorariaByTurma(student.turmaId);
  }

  async function fetchProfessorAlunoVisao(student: any, tab = professorAlunoTab) {
    if (!token) return;

    try {
      setError("");
      setLoadingProfessorVisao(true);
      const params = new URLSearchParams({
        periodo: professorPeriodo,
        ano: String(professorAno),
      });
      const res = await fetch(
        apiUrl(`/alunos/${student.id}/professor-visao?${params.toString()}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar dados do aluno.");
      }

      setProfessorAluno(student);
      setProfessorAlunoTab(tab);
      setProfessorAlunoVisao(data);
      setAlunoSelecionadoDocs(null);
      setAlunoBoletim(null);
      setAlunoGrade(null);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados do aluno.");
    } finally {
      setLoadingProfessorVisao(false);
    }
  }

  const alunoGradeTurmas = useMemo<ScheduleTurma[]>(() => {
    if (!alunoGrade) return [];

    return [
      {
        id: alunoGrade.turmaId,
        name: alunoGrade.turma?.name || "Turma",
        turno: alunoGrade.turma?.turno,
        aluno: {
          id: alunoGrade.id,
          name: alunoGrade.name,
        },
        aulas: aulasGrade,
      },
    ];
  }, [alunoGrade, aulasGrade]);

  useEffect(() => {
    if (professorAluno && isProfessor) {
      fetchProfessorAlunoVisao(professorAluno, professorAlunoTab);
    }
  }, [professorPeriodo, professorAno]);

  function handleVerStatus(student: any) {
    if (statusLoadingId === student.id) return;

    const statusAtual = String(student.status || "").toUpperCase();

    const confirmar = confirm(
      `O aluno "${student.name}" está ${statusAtual}. Deseja alterar o status?`
    );

    if (!confirmar) return;

    handleAlternarStatus(student);
  }

  function toggleSelectAluno(alunoId: string) {
    setSelectedAlunoIds((prev) =>
      prev.includes(alunoId)
        ?prev.filter((id) => id !== alunoId)
        : [...prev, alunoId]
    );
  }

  function toggleSelectAllFiltered() {
    const filteredIds = studentsFiltered.map((item) => item.id);
    const todosSelecionados =
      filteredIds.length > 0 &&
      filteredIds.every((id) => selectedAlunoIds.includes(id));

    if (todosSelecionados) {
      setSelectedAlunoIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
      return;
    }

    setSelectedAlunoIds((prev) => {
      const novoSet = new Set(prev);
      filteredIds.forEach((id) => novoSet.add(id));
      return Array.from(novoSet);
    });
  }

  async function handlePromoverAlunosEmMassa() {
    if (!token) {
      setError("Sessão inválida. Faça login novamente.");
      return;
    }

    if (!hasSchoolContext) {
      setError("Selecione uma escola antes de promover alunos.");
      return;
    }

    if (!turmaSelecionada) {
      setError("Selecione primeiro a turma de origem pelos filtros.");
      return;
    }

    if (!turmaDestinoPromocao) {
      setError("Selecione a turma de destino.");
      return;
    }

    if (selectedAlunoIds.length === 0) {
      setError("Selecione pelo menos um aluno para promover.");
      return;
    }

    try {
      setPromotingAlunos(true);
      setError("");
      setSuccessMessage("");
      setPromotionResult(null);

      const response = await fetch(apiUrl("/turmas/promover-alunos"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(schoolIdHeader ?{ "x-school-id": schoolIdHeader } : {}),
        },
        body: JSON.stringify({
          turmaOrigemId: turmaSelecionada,
          turmaDestinoId: turmaDestinoPromocao,
          alunoIds: selectedAlunoIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao promover alunos.");
      }

      setPromotionResult(data);
      setSuccessMessage("Promoção em massa concluída.");
      setSelectedAlunoIds([]);
      setTurmaDestinoPromocao("");
      await fetchAlunos();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao promover alunos.");
    } finally {
      setPromotingAlunos(false);
    }
  }

  const existeNomeIgualNoBanco =
    responsavel.trim() &&
    responsaveisEncontrados.some(
      (item) =>
        String(item.name || "").trim().toLowerCase() ===
        responsavel.trim().toLowerCase()
    ) &&
    !responsavelSelecionadoId;

  const todosFiltradosSelecionados =
    studentsFiltered.length > 0 &&
    studentsFiltered.every((student) => selectedAlunoIds.includes(student.id));

  return (
    <section>
      <PageHeader
        title="Alunos"
        description="Cadastre, acompanhe, selecione em massa e promova alunos entre turmas."
      />

      {error ?(
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {successMessage ?(
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      {!hasSchoolContext ?(
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Selecione uma escola para visualizar e cadastrar alunos.
        </div>
      ) : null}

      {hasSchoolContext && canEditStudent ?(
        <div className="card-base mb-6 p-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            {editingAlunoId ?"Editar aluno" : "Cadastrar aluno"}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Nome do aluno
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Digite o nome do aluno"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Matrícula
              </label>
              <input
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder="Digite a matrícula"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="relative">
              <label className="text-sm font-medium text-slate-700">
                Responsável
              </label>
              <input
                value={responsavel}
                onChange={(e) => alterarResponsavelDigitado(e.target.value)}
                placeholder="Digite o nome do responsável"
                className={`mt-1 w-full rounded-xl border px-3 py-2 ${
                  existeNomeIgualNoBanco
                    ?"border-red-300 bg-red-50"
                    : "border-slate-300"
                }`}
              />

              {existeNomeIgualNoBanco ?(
                <p className="mt-2 text-xs font-semibold text-red-600">
                  Nome já registrado no banco de dados. Deseja vincular este aluno ao responsável já existente?
                </p>
              ) : null}

              {buscandoResponsavel ?(
                <p className="mt-2 text-xs text-slate-500">
                  Buscando responsável...
                </p>
              ) : null}

              {mostrarSugestoesResponsavel && responsaveisEncontrados.length > 0 ?(
                <div className="absolute z-20 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {responsaveisEncontrados.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selecionarResponsavelExistente(item)}
                      className="flex w-full flex-col items-start border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-900">
                        {item.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.email || "Sem e-mail"}
                        {item.phone ?` • ${item.phone}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Turma
              </label>
              <select
                value={turmaId}
                onChange={(e) => setTurmaId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="">Selecione</option>
                {turmas.map((turma) => (
                  <option key={turma.id} value={turma.id}>
                    {turma.name}
                    {turma.turno ?` - ${formatTurno(turma.turno)}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-slate-700">
                E-mail de acesso do aluno
              </label>
              <input
                type="email"
                value={alunoEmail}
                onChange={(e) => setAlunoEmail(e.target.value)}
                placeholder="aluno@exemplo.com"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Senha de acesso do aluno
              </label>
              <input
                type="password"
                value={alunoPassword}
                onChange={(e) => setAlunoPassword(e.target.value)}
                placeholder={
                  editingAlunoId
                    ?"Preencha apenas se quiser alterar"
                    : "Digite a senha do aluno"
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Situação de acesso
              </label>
              <select
                value={alunoAtivo ?"ATIVO" : "INATIVO"}
                onChange={(e) => setAlunoAtivo(e.target.value === "ATIVO")}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-slate-700">
                E-mail do responsável
              </label>
              <input
                value={responsavelEmail}
                onChange={(e) => setResponsavelEmail(e.target.value)}
                placeholder="responsavel@exemplo.com"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Telefone do responsável
              </label>
              <input
                value={responsavelTelefone}
                onChange={(e) => setResponsavelTelefone(e.target.value)}
                placeholder="Digite o telefone"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Parentesco
              </label>
              <input
                value={parentesco}
                onChange={(e) => setParentesco(e.target.value)}
                placeholder="Ex.: Mãe, Pai, Avó..."
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium text-slate-700">
              Endereço do responsável
            </label>
            <input
              value={responsavelEndereco}
              onChange={(e) => setResponsavelEndereco(e.target.value)}
              placeholder="Digite o endereço"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              id="responsavel-financeiro"
              type="checkbox"
              checked={responsavelFinanceiro}
              onChange={(e) => setResponsavelFinanceiro(e.target.checked)}
              className="h-4 w-4"
            />
            <label
              htmlFor="responsavel-financeiro"
              className="text-sm font-medium text-slate-700"
            >
              Este responsável é o responsável financeiro
            </label>
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium text-slate-700">
              Foto do aluno
            </label>
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              onChange={handleFotoAlunoChange}
              className="mt-1 block w-full text-sm text-slate-700"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSalvarAluno}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ?"Salvando..."
                : editingAlunoId
                ?"Atualizar aluno"
                : "Salvar aluno"}
            </button>

            {editingAlunoId ?(
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar edição
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTurmaSelecionada("")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            turmaSelecionada === ""
              ?"bg-blue-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Todos
        </button>

        {turmas.map((turma) => (
          <button
            key={turma.id}
            type="button"
            onClick={() => setTurmaSelecionada(turma.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              turmaSelecionada === turma.id
                ?"bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {turma.name}
            {turma.turno ?` - ${formatTurno(turma.turno)}` : ""}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar aluno por nome..."
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none md:w-80"
        />

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
          Total encontrado: <strong>{studentsFiltered.length}</strong>
        </div>
      </div>

      {canPromoteStudents && turmaSelecionada ?(
        <div className="card-base mb-6 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Promoção em massa de alunos
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Selecione todos ou alguns alunos da turma filtrada e mova para outra turma já cadastrada.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Selecionados: <strong>{selectedAlunoIds.length}</strong>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px_220px]">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Turma de destino
              </label>
              <select
                value={turmaDestinoPromocao}
                onChange={(e) => setTurmaDestinoPromocao(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="">Selecione a turma de destino</option>
                {turmaDestinoOptions.map((turma) => (
                  <option key={turma.id} value={turma.id}>
                    {turma.name}
                    {turma.turno ?` - ${formatTurno(turma.turno)}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {todosFiltradosSelecionados
                  ?"Desmarcar todos os filtrados"
                  : "Selecionar todos os filtrados"}
              </button>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handlePromoverAlunosEmMassa}
                disabled={
                  promotingAlunos ||
                  selectedAlunoIds.length === 0 ||
                  !turmaDestinoPromocao
                }
                className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {promotingAlunos ?"Promovendo..." : "Promover selecionados"}
              </button>
            </div>
          </div>

          {promotionResult ?(
            <div className="mt-5 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="text-sm font-semibold text-emerald-800">
                Resultado da promoção em massa
              </h3>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-white px-3 py-3 text-sm text-slate-700">
                  <strong>Selecionados:</strong> {promotionResult?.summary?.selecionados || 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-3 text-sm text-emerald-700">
                  <strong>Promovidos:</strong> {promotionResult?.summary?.promovidos || 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-3 text-sm text-amber-700">
                  <strong>Ignorados:</strong> {promotionResult?.summary?.ignorados || 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-3 text-sm text-red-700">
                  <strong>Falhas:</strong> {promotionResult?.summary?.falhas || 0}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-xl border border-emerald-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-emerald-700">
                    Promovidos
                  </h4>
                  <div className="mt-3 space-y-2">
                    {(promotionResult?.promoted || []).length === 0 ?(
                      <p className="text-sm text-emerald-700">
                        Nenhum aluno promovido.
                      </p>
                    ) : (
                      promotionResult.promoted.map((item: any, index: number) => (
                        <div
                          key={`promoted-${index}`}
                          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                        >
                          {item.nome} - {item.matricula} - {item.turmaOrigem} {"->"} {item.turmaDestino}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-amber-700">
                    Ignorados
                  </h4>
                  <div className="mt-3 space-y-2">
                    {(promotionResult?.skipped || []).length === 0 ?(
                      <p className="text-sm text-amber-700">
                        Nenhum item ignorado.
                      </p>
                    ) : (
                      promotionResult.skipped.map((item: any, index: number) => (
                        <div
                          key={`skipped-${index}`}
                          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
                        >
                          {item.nome || item.matricula || item.id} — {item.motivo}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-red-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-red-700">
                    Falhas
                  </h4>
                  <div className="mt-3 space-y-2">
                    {(promotionResult?.failed || []).length === 0 ?(
                      <p className="text-sm text-red-700">
                        Nenhuma falha.
                      </p>
                    ) : (
                      promotionResult.failed.map((item: any, index: number) => (
                        <div
                          key={`failed-${index}`}
                          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
                        >
                          {item.nome || item.matricula || item.id} — {item.motivo}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ?(
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Carregando alunos...
        </div>
      ) : null}

      {!loading && studentsFiltered.length === 0 && hasSchoolContext ?(
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Nenhum aluno encontrado.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {studentsFiltered.map((student) => {
          const checked = selectedAlunoIds.includes(student.id);

          return (
            <div key={student.id} className="space-y-2">
              {canPromoteStudents && turmaSelecionada ?(
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelectAluno(student.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-700">
                    Selecionar {student.name}
                  </span>
                </div>
              ) : null}

              <StudentCard
                name={student.name}
                turma={
                  `${student.turma?.name || "Sem turma"}${
                    student.turma?.turno ?` - ${formatTurno(student.turma.turno)}` : ""
                  }`
                }
                status={student.status}
                media="-"
                responsavel={
                  student.responsaveis?.[0]?.responsavel?.name ||
                  student.responsavel ||
                  "-"
                }
                responsavelId={student.responsaveis?.[0]?.responsavel?.id || undefined}
                canOpenResponsavel={canOpenResponsavel}
                imageUrl={normalizarFotoUrl(student.fotoUrl)}
                canEdit={canEditStudent}
                showStatusAction={canEditStudent}
                showDocumentosAction={!isProfessor}
                showBoletimAction={!isProfessor}
                showGradeHorariaAction={!isProfessor}
                customActions={
                  isProfessor
                    ?[
                        {
                          title: "Notas do aluno",
                          icon: BookOpenCheck,
                          onClick: () => fetchProfessorAlunoVisao(student, "notas"),
                          className:
                            "rounded-xl border border-violet-200 bg-white p-2 text-violet-700 transition hover:bg-violet-50",
                        },
                        {
                          title: "Frequencias e faltas",
                          icon: ClipboardCheck,
                          onClick: () => fetchProfessorAlunoVisao(student, "frequencias"),
                          className:
                            "rounded-xl border border-emerald-200 bg-white p-2 text-emerald-700 transition hover:bg-emerald-50",
                        },
                        {
                          title: "Agendamentos",
                          icon: CalendarDays,
                          onClick: () => fetchProfessorAlunoVisao(student, "agendamentos"),
                          className:
                            "rounded-xl border border-blue-200 bg-white p-2 text-blue-700 transition hover:bg-blue-50",
                        },
                      ]
                    : []
                }
                onEdit={() => handleEditarAluno(student)}
                onDelete={() => handleExcluirAluno(student)}
                onViewDocumentos={() => handleAbrirDocumentos(student)}
                onViewBoletim={() => handleAbrirBoletim(student)}
                onViewGradeHoraria={() => handleAbrirGradeHoraria(student)}
                onViewStatus={() => handleVerStatus(student)}
              />

              {statusLoadingId === student.id ?(
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  Atualizando status...
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {professorAluno ?(
        <div className="card-base mt-6 p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Acompanhamento do aluno: {professorAluno.name}
              </h3>
              <p className="text-sm text-slate-500">
                Dados restritos às disciplinas vinculadas ao professor.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setProfessorAluno(null);
                setProfessorAlunoVisao(null);
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Fechar
            </button>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_160px]">
            <div className="flex flex-wrap gap-2">
              {(["notas", "frequencias", "agendamentos"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setProfessorAlunoTab(tab)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    professorAlunoTab === tab
                      ?"bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {tab === "notas"
                    ? "Notas"
                    : tab === "frequencias"
                    ? "Frequências e faltas"
                    : "Agendamentos"}
                </button>
              ))}
            </div>

            <select
              value={professorPeriodo}
              onChange={(event) => setProfessorPeriodo(event.target.value as PeriodoAvaliacao)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {Object.entries(PERIODO_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <input
              type="number"
              min={2000}
              max={2100}
              value={professorAno}
              onChange={(event) => setProfessorAno(Number(event.target.value))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          {loadingProfessorVisao ?(
            <p className="text-sm text-slate-500">Carregando acompanhamento...</p>
          ) : null}

          {!loadingProfessorVisao && professorAlunoVisao && professorAlunoTab === "notas" ?(
            <div className="space-y-4">
              {professorAlunoVisao.notas?.itens?.length === 0 &&
              professorAlunoVisao.notas?.finais?.length === 0 ?(
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  Nenhuma nota encontrada para {PERIODO_LABELS[professorPeriodo]}.
                </p>
              ) : null}

              {professorAlunoVisao.notas?.itens?.map((item: any) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {item.atividadeModelo?.titulo || "Atividade"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {item.turmaProfessor?.disciplina} • {item.atividadeModelo?.tipoAtividade}
                      </p>
                    </div>
                    <div className="rounded-xl bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">
                      {Number(item.notaConsiderada).toFixed(2)} / {Number(item.atividadeModelo?.valorMaximo || 0).toFixed(2)}
                    </div>
                  </div>
                  {item.notaRecuperacao ?(
                    <p className="mt-2 text-xs text-slate-500">
                      Recuperação: {Number(item.notaRecuperacao).toFixed(2)}
                    </p>
                  ) : null}
                  {item.observacao ?(
                    <p className="mt-2 text-sm text-slate-600">{item.observacao}</p>
                  ) : null}
                </div>
              ))}

              {professorAlunoVisao.notas?.finais?.map((nota: any) => (
                <div key={nota.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-800">
                    Média final em {nota.turmaProfessor?.disciplina}: {Number(nota.notaFinal).toFixed(2)}
                  </p>
                  {nota.observacao ?(
                    <p className="mt-1 text-sm text-emerald-700">{nota.observacao}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {!loadingProfessorVisao && professorAlunoVisao && professorAlunoTab === "frequencias" ?(
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  Total: <strong>{professorAlunoVisao.resumoFrequencia?.total || 0}</strong>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                  Presenças: <strong>{professorAlunoVisao.resumoFrequencia?.presenas || 0}</strong>
                </div>
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  Faltas: <strong>{professorAlunoVisao.resumoFrequencia?.faltas || 0}</strong>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                  Justificadas: <strong>{professorAlunoVisao.resumoFrequencia?.faltasJustificadas || 0}</strong>
                </div>
              </div>

              {professorAlunoVisao.frequencias?.length === 0 ?(
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  Nenhum lançamento de frequência encontrado para {PERIODO_LABELS[professorPeriodo]}.
                </p>
              ) : (
                <div className="space-y-2">
                  {professorAlunoVisao.frequencias.map((freq: any) => (
                    <div key={freq.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {new Date(freq.dataLancamento).toLocaleDateString("pt-BR")}
                          </p>
                          <p className="text-sm text-slate-500">
                            {freq.turmaProfessor?.disciplina}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            freq.status === "FALTA"
                              ?"bg-red-50 text-red-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {freq.status === "FALTA"
                            ?freq.faltaJustificada
                              ?"Falta justificada"
                              : "Falta"
                            : "Presente"}
                        </span>
                      </div>
                      {freq.observacao ?(
                        <p className="mt-2 text-sm text-slate-600">{freq.observacao}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {!loadingProfessorVisao && professorAlunoVisao && professorAlunoTab === "agendamentos" ?(
            <div className="space-y-3">
              {professorAlunoVisao.agendamentos?.length === 0 ?(
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  Até o momento não há agendamentos para {PERIODO_LABELS[professorPeriodo]}.
                </p>
              ) : (
                professorAlunoVisao.agendamentos.map((agenda: any) => (
                  <div key={agenda.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="font-semibold text-slate-900">{agenda.titulo}</p>
                    <p className="text-sm text-slate-500">
                      {new Date(agenda.data).toLocaleDateString("pt-BR")}
                    </p>
                    {agenda.descricao ?(
                      <p className="mt-2 text-sm text-slate-600">{agenda.descricao}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {alunoSelecionadoDocs ?(
        <div className="card-base mt-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Documentos do aluno: {alunoSelecionadoDocs.name}
              </h3>
              <p className="text-sm text-slate-500">
                Faça upload, download ou exclusão dos documentos.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setAlunoSelecionadoDocs(null);
                setDocumentosAluno([]);
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Fechar
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="file"
              onChange={(e) => setDocumentoAluno(e.target.files?.[0] || null)}
              className="rounded-xl border border-slate-300 px-3 py-2"
            />

            <select
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">Selecione o tipo</option>
              <option value="IDENTIDADE">Identidade</option>
              <option value="CERTIDAO_NASCIMENTO">Certidão de nascimento</option>
              <option value="COMPROVANTE_RESIDENCIA">Comprovante de residência</option>
              <option value="DECLARACAO">Declaração</option>
              <option value="HISTORICO_ESCOLAR">Histórico escolar</option>
            </select>

            <button
              type="button"
              onClick={() => handleUploadDocumento(alunoSelecionadoDocs.id)}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Enviar documento
            </button>
          </div>

          {loadingDocumentos ?(
            <p className="text-sm text-slate-500">Carregando documentos...</p>
          ) : documentosAluno.length === 0 ?(
            <p className="text-sm text-slate-500">Nenhum documento encontrado.</p>
          ) : (
            <div className="space-y-3">
              {documentosAluno.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-900">{doc.nomeOriginal}</p>
                    <p className="text-sm text-slate-500">{doc.tipo}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleBaixarDocumento(doc)}
                      className="rounded-xl border border-slate-300 bg-white p-2 text-slate-700"
                    >
                      <Download size={18} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExcluirDocumento(doc.id)}
                      className="rounded-xl border border-red-200 bg-white p-2 text-red-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {alunoBoletim ?(
        <div className="card-base mt-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Boletim do aluno: {alunoBoletim.name}
              </h3>
              <p className="text-sm text-slate-500">
                Esta área será ligada ao boletim consolidado.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAlunoBoletim(null)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Fechar
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            O boletim do aluno será exibido aqui quando o módulo completo do boletim estiver finalizado.
          </div>
        </div>
      ) : null}

      {alunoGrade ?(
        <div className="card-base mt-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Grade horária: {alunoGrade.name}
              </h3>
              <p className="text-sm text-slate-500">
                Visualização da grade da turma do aluno.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setAlunoGrade(null);
                setAulasGrade([]);
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Fechar
            </button>
          </div>

          {loadingGrade ?(
            <p className="text-sm text-slate-500">Carregando grade horária...</p>
          ) : (
            <ScheduleGrid
              turmas={alunoGradeTurmas}
              title={`Grade horária: ${alunoGrade.name}`}
              subtitle="Visualização da grade semanal da turma do aluno."
              emptyMessage="Nenhuma aula cadastrada para esta turma."
            />
          )}
        </div>
      ) : null}
    </section>
  );
}

