"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import Link from "next/link";

type ResponsavelAluno = {
  id: string;
  parentesco?: string | null;
  isFinanceiro?: boolean;
  aluno?: {
    id: string;
    name: string;
    matricula?: string | null;
    status?: string | null;
    turma?: {
      id: string;
      name: string;
      turno?: string | null;
    } | null;
  } | null;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  role: string;
  schoolId?: string | null;
  isActive?: boolean;
  isActivated?: boolean;
  phone?: string | null;
  address?: string | null;
  cpf?: string | null;
  identidade?: string | null;
  responsavelAlunos?: ResponsavelAluno[];
};

type SchoolOption = {
  id: string;
  name: string;
  status?: string | null;
};

type CreateUserForm = {
  name: string;
  email: string;
  username: string;
  password: string;
  role: string;
};

type EditUserForm = CreateUserForm & {
  schoolId: string;
  isActive: boolean;
  phone: string;
  address: string;
  cpf: string;
  identidade: string;
};

type TabType = "SUPERUSUARIOS" | "FUNCIONARIOS" | "RESPONSAVEIS";

export default function UsuariosPage() {
  const { token, user, selectedSchool, setSelectedSchool } = useAuth();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  const [activeTab, setActiveTab] = useState<TabType>("FUNCIONARIOS");

  const [searchTerm, setSearchTerm] = useState("");
  const [funcionarioRoleFilter, setFuncionarioRoleFilter] = useState("TODOS");
  const [funcionarioStatusFilter, setFuncionarioStatusFilter] = useState("TODOS");
  const [responsavelSerieFilter, setResponsavelSerieFilter] = useState("TODAS");

  const [form, setForm] = useState<CreateUserForm>({
    name: "",
    email: "",
    username: "",
    password: "",
    role: "PROFESSOR",
  });
  const [editForm, setEditForm] = useState<EditUserForm>({
    name: "",
    email: "",
    username: "",
    password: "",
    role: "PROFESSOR",
    schoolId: "",
    isActive: true,
    phone: "",
    address: "",
    cpf: "",
    identidade: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isSuperusuario = user?.role === "SUPERUSUARIO";
  const requiresSelectedSchool =
    isSuperusuario && activeTab !== "SUPERUSUARIOS";
  const schoolId = selectedSchool?.id || "";
  const hasSchoolContext = requiresSelectedSchool ? !!schoolId : true;

  async function fetchUsers() {
    if (!token || !hasSchoolContext) {
      setUsers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      let url = apiUrl("/users");

      if (isSuperusuario && activeTab !== "SUPERUSUARIOS" && schoolId) {
        url += `?schoolId=${schoolId}`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao buscar usuários");
      }

      setUsers(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Erro ao carregar usuários:", error);
      setErrorMessage(error.message || "Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSchools() {
    if (!token || user?.role !== "SUPERUSUARIO") {
      setSchools([]);
      return;
    }

    try {
      setLoadingSchools(true);

      const response = await fetch(apiUrl("/schools"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao buscar escolas");
      }

      setSchools(Array.isArray(data) ? data : [data]);
    } catch (error) {
      console.error("Erro ao carregar escolas:", error);
      setSchools([]);
    } finally {
      setLoadingSchools(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, [token, user?.role, schoolId, hasSchoolContext, activeTab]);

  useEffect(() => {
    fetchSchools();
  }, [token, user?.role]);

  useEffect(() => {
    if (user?.role === "SUPERUSUARIO" && !selectedSchool && activeTab !== "SUPERUSUARIOS") {
      setActiveTab("SUPERUSUARIOS");
    }
  }, [user?.role, selectedSchool, activeTab]);

  function resetForm() {
    setForm({
      name: "",
      email: "",
      username: "",
      password: "",
      role:
        activeTab === "SUPERUSUARIOS"
          ? "SUPERUSUARIO"
          : activeTab === "RESPONSAVEIS"
            ? "RESPONSAVEL"
            : "PROFESSOR",
    });
  }

  function startEditUser(targetUser: UserItem) {
    setEditingUser(targetUser);
    setEditForm({
      name: targetUser.name || "",
      email: targetUser.email || "",
      username: targetUser.username || "",
      password: "",
      role: targetUser.role || "PROFESSOR",
      schoolId: targetUser.role === "SUPERUSUARIO" ? "" : targetUser.schoolId || schoolId,
      isActive: Boolean(targetUser.isActive ?? true),
      phone: targetUser.phone || "",
      address: targetUser.address || "",
      cpf: targetUser.cpf || "",
      identidade: targetUser.identidade || "",
    });
    setShowForm(false);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function cancelEditUser() {
    setEditingUser(null);
    setEditForm({
      name: "",
      email: "",
      username: "",
      password: "",
      role: "PROFESSOR",
      schoolId: "",
      isActive: true,
      phone: "",
      address: "",
      cpf: "",
      identidade: "",
    });
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!form.name.trim()) {
      setErrorMessage("Informe o nome do usuário.");
      return;
    }

    if (!form.email.trim()) {
      setErrorMessage("Informe o e-mail do usuário.");
      return;
    }

    if (!form.password.trim() || form.password.trim().length < 6) {
      setErrorMessage("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (!form.role) {
      setErrorMessage("Selecione o perfil do usuário.");
      return;
    }

    if (user?.role === "SUPERUSUARIO" && form.role !== "SUPERUSUARIO" && !schoolId) {
      setErrorMessage("Selecione uma escola para criar este usuário.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(
        apiUrl("/auth/register-by-admin"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            username: form.username.trim() || undefined,
            password: form.password,
            role: form.role,
            schoolId:
              user?.role === "SUPERUSUARIO" && form.role !== "SUPERUSUARIO"
                ? schoolId
                : undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao criar usuário");
      }

      setSuccessMessage("Usuário criado com sucesso.");
      resetForm();
      setShowForm(false);
      await fetchUsers();
    } catch (error: any) {
      console.error("Erro ao criar usuário:", error);
      setErrorMessage(error.message || "Não foi possível criar o usuário.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !editingUser) {
      setErrorMessage("Sessão inválida ou usuário não selecionado.");
      return;
    }

    const canEditAsSuperuser = user?.role === "SUPERUSUARIO";
    const canEditAsAdmin = user?.role === "ADMIN_ESCOLA";

    if (!canEditAsSuperuser && !canEditAsAdmin) {
      setErrorMessage("Você não tem permissão para editar este usuário.");
      return;
    }

    if (!editForm.name.trim()) {
      setErrorMessage("Informe o nome do usuário.");
      return;
    }

    if (!editForm.email.trim()) {
      setErrorMessage("Informe o e-mail do usuário.");
      return;
    }

    if (editForm.password.trim() && editForm.password.trim().length < 6) {
      setErrorMessage("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (canEditAsSuperuser && editForm.role !== "SUPERUSUARIO" && !editForm.schoolId) {
      setErrorMessage("Selecione a escola deste usuário.");
      return;
    }

    try {
      setIsEditingUser(true);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(
        canEditAsSuperuser
          ? apiUrl(`/users/${editingUser.id}/superuser-update`)
          : apiUrl(`/users/${editingUser.id}/admin-update`),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: editForm.name.trim(),
            email: editForm.email.trim(),
            username: editForm.username.trim() || null,
            password: editForm.password.trim() || undefined,
            role: canEditAsSuperuser ? editForm.role : undefined,
            schoolId:
              canEditAsSuperuser
                ? editForm.role === "SUPERUSUARIO"
                  ? null
                  : editForm.schoolId
                : undefined,
            isActive: editForm.isActive,
            phone: editForm.phone.trim() || null,
            address: editForm.address.trim() || null,
            cpf: editForm.cpf.trim() || null,
            identidade: editForm.identidade.trim() || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao editar usuário");
      }

      setSuccessMessage("Usuário atualizado com sucesso.");
      cancelEditUser();
      await fetchUsers();
    } catch (error: any) {
      console.error("Erro ao editar usuário:", error);
      setErrorMessage(error.message || "Não foi possível editar o usuário.");
    } finally {
      setIsEditingUser(false);
    }
  }

  async function handleToggleUserStatus(targetUser: UserItem) {
    if (!token) {
      setErrorMessage("Sessão inválida. Faça login novamente.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setActionUserId(targetUser.id);

    try {
      const route = targetUser.isActive
        ? apiUrl(`/users/${targetUser.id}/block-secure`)
        : apiUrl(`/users/${targetUser.id}/unblock-secure`);

      const response = await fetch(route, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao alterar status do usuário");
      }

      setSuccessMessage(
        targetUser.isActive
          ? "Usuário bloqueado com sucesso."
          : "Usuário desbloqueado com sucesso."
      );

      await fetchUsers();
    } catch (error: any) {
      console.error("Erro ao alterar status do usuário:", error);
      setErrorMessage(
        error.message || "Não foi possível alterar o status do usuário."
      );
    } finally {
      setActionUserId(null);
    }
  }

  async function handleDeleteUser(targetUser: UserItem) {
    if (!token) {
      setErrorMessage("Sessão inválida. Faça login novamente.");
      return;
    }

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o usuário "${targetUser.name}"?`
    );

    if (!confirmed) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setActionUserId(targetUser.id);

    try {
      const response = await fetch(
        apiUrl(`/users/${targetUser.id}/delete-secure`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao excluir usuário");
      }

      setSuccessMessage("Usuário excluído com sucesso.");
      await fetchUsers();
    } catch (error: any) {
      console.error("Erro ao excluir usuário:", error);
      setErrorMessage(error.message || "Não foi possível excluir o usuário.");
    } finally {
      setActionUserId(null);
    }
  }

  function getSerieTurmaLabel(item: ResponsavelAluno) {
    return item.aluno?.turma?.name || "Sem turma";
  }

  const responsavelSerieOptions = useMemo(() => {
    const labels = users
      .filter((item) => item.role === "RESPONSAVEL")
      .flatMap((item) =>
        (item.responsavelAlunos || []).map((rel) => getSerieTurmaLabel(rel))
      )
      .filter(Boolean);

    return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const funcionarios = useMemo(() => {
    const employeeRoles =
      user?.role === "SECRETARIA"
        ? ["COORDENADOR", "AUXILIAR", "PROFESSOR"]
        : [
            "ADMIN_ESCOLA",
            "FINANCEIRO",
            "GESTOR",
            "COORDENADOR",
            "SECRETARIA",
            "AUXILIAR",
            "PROFESSOR",
          ];

    return users
      .filter((item) => employeeRoles.includes(item.role))
      .filter((item) => {
        const matchesSearch =
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.username || "").toLowerCase().includes(searchTerm.toLowerCase());

        const matchesRole =
          funcionarioRoleFilter === "TODOS" || item.role === funcionarioRoleFilter;

        const matchesStatus =
          funcionarioStatusFilter === "TODOS" ||
          (funcionarioStatusFilter === "ATIVO" && item.isActive) ||
          (funcionarioStatusFilter === "BLOQUEADO" && !item.isActive);

        return matchesSearch && matchesRole && matchesStatus;
      });
  }, [users, searchTerm, funcionarioRoleFilter, funcionarioStatusFilter, user?.role]);

  const responsaveis = useMemo(() => {
    return users
      .filter((item) => item.role === "RESPONSAVEL")
      .filter((item) => {
        const matchesName =
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.username || "").toLowerCase().includes(searchTerm.toLowerCase());

        const turmaLabels = (item.responsavelAlunos || []).map((rel) =>
          getSerieTurmaLabel(rel)
        );

        const matchesSerie =
          responsavelSerieFilter === "TODAS" ||
          turmaLabels.includes(responsavelSerieFilter);

        return matchesName && matchesSerie;
      });
  }, [users, searchTerm, responsavelSerieFilter]);

  const superusuarios = useMemo(() => {
    return users
      .filter((item) => item.role === "SUPERUSUARIO")
      .filter((item) => {
        return (
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.username || "").toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
  }, [users, searchTerm]);

  const canCreateEmployee =
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA" ||
    (user?.role === "SUPERUSUARIO" && !!selectedSchool);
  const canCreateResponsavel =
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA" ||
    (user?.role === "SUPERUSUARIO" && !!selectedSchool);
  const canCreateSuperusuario = user?.role === "SUPERUSUARIO";
  const canCreateCurrentUser =
    (activeTab === "SUPERUSUARIOS" && canCreateSuperusuario) ||
    (activeTab === "FUNCIONARIOS" && canCreateEmployee) ||
    (activeTab === "RESPONSAVEIS" && canCreateResponsavel);
  const canManageUsers =
    user?.role === "ADMIN_ESCOLA" || user?.role === "SUPERUSUARIO";
  const superuserEditRoleOptions = [
    { value: "SUPERUSUARIO", label: "Superusuário" },
    { value: "ADMIN_ESCOLA", label: "Administração" },
    { value: "GESTOR", label: "Gestão" },
    { value: "FINANCEIRO", label: "Financeiro" },
    { value: "SECRETARIA", label: "Secretaria" },
    { value: "COORDENADOR", label: "Coordenador" },
    { value: "AUXILIAR", label: "Auxiliar" },
    { value: "PROFESSOR", label: "Professor" },
    { value: "RESPONSAVEL", label: "Responsável" },
    { value: "ALUNO", label: "Aluno" },
  ];

  const roleOptions = useMemo(() => {
    if (activeTab === "SUPERUSUARIOS") {
      return [{ value: "SUPERUSUARIO", label: "Superusuário" }];
    }

    if (activeTab === "RESPONSAVEIS") {
      return [{ value: "RESPONSAVEL", label: "Responsável" }];
    }

    if (user?.role === "SECRETARIA") {
      return [
        { value: "COORDENADOR", label: "Coordenador" },
        { value: "AUXILIAR", label: "Auxiliar" },
        { value: "PROFESSOR", label: "Professor" },
      ];
    }

    return [
      { value: "ADMIN_ESCOLA", label: "Administração" },
      { value: "GESTOR", label: "Gestão" },
      { value: "FINANCEIRO", label: "Financeiro" },
      { value: "SECRETARIA", label: "Secretaria" },
      { value: "COORDENADOR", label: "Coordenador" },
      { value: "AUXILIAR", label: "Auxiliar" },
      { value: "PROFESSOR", label: "Professor" },
    ];
  }, [activeTab, user?.role]);

  useEffect(() => {
    const firstRole = roleOptions[0]?.value || "PROFESSOR";

    if (!roleOptions.some((option) => option.value === form.role)) {
      setForm((prev) => ({ ...prev, role: firstRole }));
    }
  }, [roleOptions, form.role]);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Usuários"
        description="Organize a escola separando funcionários e responsáveis."
      />

      {user?.role === "SUPERUSUARIO" ? (
        <div className="card-base p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_2fr] md:items-end">
            <div>
              <h2 className="text-base font-semibold text-slate-800">
                Contexto de administração
              </h2>
              <p className="text-sm text-slate-500">
                Escolha uma escola para administrar funcionários e responsáveis,
                ou use a aba de superusuários para acesso global.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Escola
              </label>
              <select
                value={selectedSchool?.id || ""}
                onChange={(e) => {
                  const nextSchool = schools.find(
                    (school) => school.id === e.target.value
                  );

                  setSelectedSchool(nextSchool || null);

                  if (nextSchool && activeTab === "SUPERUSUARIOS") {
                    setActiveTab("FUNCIONARIOS");
                  }

                  setShowForm(false);
                  setSearchTerm("");
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                <option value="">
                  {loadingSchools ? "Carregando escolas..." : "Selecione uma escola"}
                </option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : null}

      {requiresSelectedSchool && !selectedSchool ? (
        <div className="card-base p-5">
          <p className="text-sm text-slate-700">
            Para administrar funcionários e responsáveis, selecione uma escola
            no campo acima.
          </p>
        </div>
      ) : null}

      {requiresSelectedSchool && selectedSchool ? (
        <div className="card-base p-5">
          <p className="text-sm text-slate-700">
            Escola ativa no momento: <strong>{selectedSchool.name}</strong>
          </p>
        </div>
      ) : null}

      <div className="card-base space-y-6 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Gestão de pessoas da escola
            </h2>
            <p className="text-sm text-slate-500">
              Separe a visualização entre funcionários e responsáveis para manter
              a organização da escola.
            </p>
          </div>

          {canCreateCurrentUser ? (
            <button
              type="button"
              onClick={() => {
                setShowForm((prev) => !prev);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {showForm
                ? "Fechar formulário"
                : activeTab === "SUPERUSUARIOS"
                  ? "Novo superusuário"
                  : activeTab === "RESPONSAVEIS"
                    ? "Novo responsável"
                    : "Novo funcionário"}
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          {user?.role === "SUPERUSUARIO" ? (
            <button
              type="button"
              onClick={() => {
                setActiveTab("SUPERUSUARIOS");
                setShowForm(false);
                setSearchTerm("");
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "SUPERUSUARIOS"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              Superusuários
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setActiveTab("FUNCIONARIOS");
              setShowForm(false);
              setSearchTerm("");
              setErrorMessage("");
              setSuccessMessage("");
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === "FUNCIONARIOS"
                ? "bg-slate-900 text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Funcionários
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("RESPONSAVEIS");
              setShowForm(false);
              setSearchTerm("");
              setErrorMessage("");
              setSuccessMessage("");
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === "RESPONSAVEIS"
                ? "bg-slate-900 text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Responsáveis
          </button>
        </div>

        {errorMessage ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        ) : null}

        {showForm && canCreateCurrentUser ? (
          <form
            onSubmit={handleCreateUser}
            className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nome
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Digite o nome"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  E-mail
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Digite o e-mail"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Usuário de acesso
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, username: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Ex.: maria.silva"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Opcional. Pode ser usado no login no lugar do e-mail.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Senha
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Digite a senha"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Perfil
                </label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, role: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 md:flex-row">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Salvando..." : "Salvar usuário"}
              </button>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        {editingUser && (user?.role === "SUPERUSUARIO" || user?.role === "ADMIN_ESCOLA") ? (
          <form
            onSubmit={handleUpdateUser}
            className="grid gap-4 rounded-2xl border border-blue-200 bg-blue-50/40 p-4"
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold text-slate-900">
                Editar usuário
              </h3>
              <p className="text-sm text-slate-500">
                Alterando dados de {editingUser.name}.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nome
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  E-mail
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Usuário de acesso
                </label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, username: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nova senha
                </label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Deixe em branco para manter"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Perfil
                </label>
                <select
                  value={editForm.role}
                  disabled={user?.role !== "SUPERUSUARIO"}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      role: e.target.value,
                      schoolId:
                        e.target.value === "SUPERUSUARIO"
                          ? ""
                          : prev.schoolId || selectedSchool?.id || "",
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                >
                  {superuserEditRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Escola
                </label>
                <select
                  value={editForm.schoolId}
                  disabled={user?.role !== "SUPERUSUARIO" || editForm.role === "SUPERUSUARIO"}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, schoolId: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                >
                  <option value="">Sem escola</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Telefone
                </label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Endereço
                </label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  CPF
                </label>
                <input
                  type="text"
                  value={editForm.cpf}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, cpf: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Identidade
                </label>
                <input
                  type="text"
                  value={editForm.identidade}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      identidade: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    isActive: e.target.checked,
                  }))
                }
              />
              <span className="text-sm font-medium text-slate-800">
                Usuário ativo
              </span>
            </label>

            <div className="flex flex-col gap-3 md:flex-row">
              <button
                type="submit"
                disabled={isEditingUser}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEditingUser ? "Salvando..." : "Salvar alterações"}
              </button>

              <button
                type="button"
                onClick={cancelEditUser}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar edição
              </button>
            </div>
          </form>
        ) : null}

        {activeTab === "SUPERUSUARIOS" ? (
          <>
            <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Buscar superusuário por nome ou e-mail
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Digite um nome ou e-mail"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Superusuários encontrados: {superusuarios.length}
                </p>
                <p className="text-xs text-slate-500">
                  Pessoas com acesso global à plataforma.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
              >
                Limpar filtros
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">Carregando superusuários...</p>
            ) : superusuarios.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-medium text-slate-700">
                  Nenhum superusuário encontrado.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {superusuarios.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-col gap-2">
                        <strong className="text-base text-slate-800">
                          {item.name}
                        </strong>
                        <span className="text-sm text-slate-500">{item.email}</span>
                        {item.username ? (
                          <span className="text-xs font-medium text-slate-500">
                            Usuário: {item.username}
                          </span>
                        ) : null}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
                            SUPERUSUARIO
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              item.isActive
                                ? "bg-green-50 text-green-700"
                                : "bg-red-50 text-red-700"
                            }`}
                          >
                            {item.isActive ? "Ativo" : "Bloqueado"}
                          </span>
                        </div>
                      </div>

                      {canManageUsers ? (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          {user?.role === "SUPERUSUARIO" || user?.role === "ADMIN_ESCOLA" ? (
                            <button
                              type="button"
                              onClick={() => startEditUser(item)}
                              disabled={actionUserId === item.id}
                              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Editar
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(item)}
                            disabled={actionUserId === item.id || item.id === user?.id}
                            className={`rounded-xl px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                              item.isActive
                                ? "bg-red-600 hover:opacity-90"
                                : "bg-emerald-600 hover:opacity-90"
                            }`}
                          >
                            {actionUserId === item.id
                              ? "Processando..."
                              : item.isActive
                                ? "Bloquear"
                                : "Desbloquear"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(item)}
                            disabled={actionUserId === item.id || item.id === user?.id}
                            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionUserId === item.id ? "Processando..." : "Excluir"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : activeTab === "FUNCIONARIOS" ? (
          <>
            {false && showForm && canCreateEmployee ? (
              <form
                onSubmit={handleCreateUser}
                className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Nome
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Digite o nome do funcionário"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Digite o e-mail"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Usuário de acesso
                    </label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          username: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Ex.: joao.silva"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Opcional. Pode ser usado no login no lugar do e-mail.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Senha
                    </label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, password: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Digite a senha"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Perfil
                    </label>
                    <select
                      value={form.role}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, role: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    >
                      {user?.role !== "SECRETARIA" ? (
                        <>
                          <option value="GESTOR">GESTOR</option>
                          <option value="FINANCEIRO">FINANCEIRO</option>
                          <option value="SECRETARIA">SECRETARIA</option>
                        </>
                      ) : null}
                      <option value="COORDENADOR">COORDENADOR</option>
                      <option value="AUXILIAR">AUXILIAR</option>
                      <option value="PROFESSOR">PROFESSOR</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-2 md:flex-row">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Salvando..." : "Salvar funcionário"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setShowForm(false);
                      setErrorMessage("");
                      setSuccessMessage("");
                    }}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}

            <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="xl:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Buscar por nome ou e-mail
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Digite um nome ou e-mail"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Filtrar por perfil
                </label>
                <select
                  value={funcionarioRoleFilter}
                  onChange={(e) => setFuncionarioRoleFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  <option value="TODOS">Todos</option>
                  {user?.role !== "SECRETARIA" ? (
                    <>
                      <option value="ADMIN_ESCOLA">Administração</option>
                      <option value="GESTOR">Gestão</option>
                      <option value="SECRETARIA">Secretaria</option>
                    </>
                  ) : null}
                  <option value="COORDENADOR">Coordenadores</option>
                  <option value="AUXILIAR">Auxiliares</option>
                  <option value="PROFESSOR">Professores</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Filtrar por status
                </label>
                <select
                  value={funcionarioStatusFilter}
                  onChange={(e) => setFuncionarioStatusFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  <option value="TODOS">Todos</option>
                  <option value="ATIVO">Ativos</option>
                  <option value="BLOQUEADO">Bloqueados</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Funcionários encontrados: {funcionarios.length}
                </p>
                <p className="text-xs text-slate-500">
                  Escola organizada por equipe interna.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setFuncionarioRoleFilter("TODOS");
                  setFuncionarioStatusFilter("TODOS");
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
              >
                Limpar filtros
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">Carregando funcionários...</p>
            ) : funcionarios.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-medium text-slate-700">
                  Nenhum funcionário encontrado com os filtros atuais.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {funcionarios.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-col gap-2">
                        <div>
                          <strong className="text-base text-slate-800">
                            {item.name}
                          </strong>
                        </div>

                        <span className="text-sm text-slate-500">
                          {item.email}
                        </span>
                        {item.username ? (
                          <span className="text-xs font-medium text-slate-500">
                            Usuário: {item.username}
                          </span>
                        ) : null}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                            {item.role}
                          </span>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              item.isActive
                                ? "bg-green-50 text-green-700"
                                : "bg-red-50 text-red-700"
                            }`}
                          >
                            {item.isActive ? "Ativo" : "Bloqueado"}
                          </span>
                        </div>
                      </div>

                      {canManageUsers ? (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          {user?.role === "SUPERUSUARIO" || user?.role === "ADMIN_ESCOLA" ? (
                            <button
                              type="button"
                              onClick={() => startEditUser(item)}
                              disabled={actionUserId === item.id}
                              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Editar
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(item)}
                            disabled={actionUserId === item.id}
                            className={`rounded-xl px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                              item.isActive
                                ? "bg-red-600 hover:opacity-90"
                                : "bg-emerald-600 hover:opacity-90"
                            }`}
                          >
                            {actionUserId === item.id
                              ? "Processando..."
                              : item.isActive
                                ? "Bloquear"
                                : "Desbloquear"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(item)}
                            disabled={actionUserId === item.id}
                            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionUserId === item.id
                              ? "Processando..."
                              : "Excluir"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Buscar responsável por nome ou e-mail
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Digite o nome ou e-mail do responsável"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Filtrar por turma/série dos filhos
                </label>
                <select
                  value={responsavelSerieFilter}
                  onChange={(e) => setResponsavelSerieFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  <option value="TODAS">Todas</option>
                  {responsavelSerieOptions.map((serie) => (
                    <option key={serie} value={serie}>
                      {serie}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Responsáveis encontrados: {responsaveis.length}
                </p>
                <p className="text-xs text-slate-500">
                  Base vinculada aos alunos cadastrados na escola.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setResponsavelSerieFilter("TODAS");
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
              >
                Limpar filtros
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">Carregando responsáveis...</p>
            ) : responsaveis.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-medium text-slate-700">
                  Nenhum responsável encontrado com os filtros atuais.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {responsaveis.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2">
                        <Link href={`/usuarios/${item.id}`} className="w-fit">
                          <strong className="cursor-pointer text-base text-blue-600 hover:underline">
                            {item.name}
                          </strong>
                        </Link>

                        <span className="text-sm text-slate-500">
                          {item.email}
                        </span>
                        {item.username ? (
                          <span className="text-xs font-medium text-slate-500">
                            Usuário: {item.username}
                          </span>
                        ) : null}

                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="rounded-xl bg-slate-50 p-3">
                            <p className="text-xs text-slate-500">Telefone</p>
                            <p className="mt-1 text-sm font-medium text-slate-800">
                              {item.phone || "Não informado"}
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-50 p-3">
                            <p className="text-xs text-slate-500">Endereço</p>
                            <p className="mt-1 text-sm font-medium text-slate-800">
                              {item.address || "Não informado"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-semibold text-slate-800">
                          Alunos vinculados
                        </p>

                        {item.responsavelAlunos && item.responsavelAlunos.length > 0 ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            {item.responsavelAlunos.map((rel) => (
                              <div
                                key={rel.id}
                                className="rounded-xl border border-slate-200 p-3"
                              >
                                <p className="text-sm font-semibold text-slate-900">
                                  {rel.aluno?.name || "Aluno não encontrado"}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                  Turma/Série: {rel.aluno?.turma?.name || "Não informada"}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                  Parentesco: {rel.parentesco || "Não informado"}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                  Responsável financeiro:{" "}
                                  {rel.isFinanceiro ? "Sim" : "Não"}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">
                            Nenhum aluno vinculado.
                          </p>
                        )}
                      </div>

                      {canManageUsers ? (
                        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                          {user?.role === "SUPERUSUARIO" ? (
                            <button
                              type="button"
                              onClick={() => startEditUser(item)}
                              disabled={actionUserId === item.id}
                              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Editar
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(item)}
                            disabled={actionUserId === item.id}
                            className={`rounded-xl px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                              item.isActive
                                ? "bg-red-600 hover:opacity-90"
                                : "bg-emerald-600 hover:opacity-90"
                            }`}
                          >
                            {actionUserId === item.id
                              ? "Processando..."
                              : item.isActive
                                ? "Bloquear acesso"
                                : "Desbloquear acesso"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(item)}
                            disabled={actionUserId === item.id}
                            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionUserId === item.id
                              ? "Processando..."
                              : "Excluir responsável"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}


