type ProfessorColorInput = {
  id?: string | null;
  name?: string | null;
};

type ProfessorColorStyle = {
  backgroundColor: string;
  borderColor: string;
  color: string;
};

const NEUTRAL_STYLE: ProfessorColorStyle = {
  backgroundColor: "rgb(241 245 249)",
  borderColor: "rgb(203 213 225)",
  color: "rgb(51 65 85)",
};

const INTERVAL_STYLE: ProfessorColorStyle = {
  backgroundColor: "rgb(254 215 170)",
  borderColor: "rgb(253 186 116)",
  color: "rgb(154 52 18)",
};

function normalizeProfessorKey(professor?: ProfessorColorInput | null) {
  const id = String(professor?.id || "").trim();

  if (id) {
    return id;
  }

  return String(professor?.name || "").trim().toUpperCase();
}

function buildProfessorStyle(index: number): ProfessorColorStyle {
  const hue = (index * 137.508) % 360;

  return {
    backgroundColor: `hsl(${hue} 82% 88%)`,
    borderColor: `hsl(${hue} 52% 60%)`,
    color: `hsl(${hue} 44% 22%)`,
  };
}

export function buildProfessorColorMap(professors: ProfessorColorInput[]) {
  const uniqueProfessors = new Map<string, string>();

  professors.forEach((professor) => {
    const key = normalizeProfessorKey(professor);
    if (!key) return;

    uniqueProfessors.set(key, String(professor.name || professor.id || key));
  });

  const ordered = Array.from(uniqueProfessors.entries()).sort((a, b) =>
    a[1].localeCompare(b[1], "pt-BR"),
  );

  return new Map(
    ordered.map(([key], index) => [key, buildProfessorStyle(index)] as const),
  );
}

export function getProfessorColorStyle(
  professorColors: Map<string, ProfessorColorStyle>,
  professor?: ProfessorColorInput | null,
  options?: { isIntervalo?: boolean },
) {
  if (options?.isIntervalo) {
    return INTERVAL_STYLE;
  }

  const key = normalizeProfessorKey(professor);

  if (!key) {
    return NEUTRAL_STYLE;
  }

  return professorColors.get(key) || NEUTRAL_STYLE;
}
