export function formatTurno(turno?: string | null) {
  if (!turno) return "Não informado";

  const normalized = String(turno)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  if (["MANHA", "MANHÃ", "MATUTINO"].includes(normalized)) {
    return "Matutino";
  }

  if (["TARDE", "VESPERTINO"].includes(normalized)) {
    return "Vespertino";
  }

  if (["NOITE", "NOTURNO"].includes(normalized)) {
    return "Noturno";
  }

  if (normalized === "INTEGRAL") {
    return "Integral";
  }

  return turno;
}

export function formatTurmaComTurno(
  turma?: { name?: string | null; turno?: string | null } | null,
  separator = " - ",
) {
  if (!turma?.name) return "";

  return turma.turno
    ? `${turma.name}${separator}${formatTurno(turma.turno)}`
    : turma.name;
}


