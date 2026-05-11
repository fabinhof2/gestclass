"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  buildProfessorColorMap,
  getProfessorColorStyle,
} from "@/lib/professor-colors";
import {
  buildHorarioSlots,
  normalizeTurno,
  type HorarioConfig,
  type Turno,
} from "@/lib/horario-config";
import { formatTurno } from "@/lib/turno";

export type ScheduleProfessor = {
  id?: string | null;
  name?: string | null;
};

export type ScheduleAula = {
  id: string;
  diaSemana: string;
  horaInicio: string;
  horaFim: string;
  disciplina: string;
  turmaProfessorId?: string | null;
  turmaProfessor?: {
    disciplina?: string | null;
    professor?: ScheduleProfessor | null;
  } | null;
};

export type ScheduleTurma = {
  contextId?: string;
  id: string;
  name: string;
  turno?: string | null;
  aluno?: {
    id: string;
    name: string;
  } | null;
  aulas: ScheduleAula[];
};

type ScheduleGridProps = {
  turmas: ScheduleTurma[];
  mode?: "weekly" | "daily";
  professorId?: string;
  turnFilter?: Turno;
  dayFilter?: string;
  horarioConfigs?: Partial<Record<Turno, HorarioConfig>>;
  turmaHorarioConfigs?: Record<string, HorarioConfig>;
  preferConfiguredSlots?: boolean;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  compact?: boolean;
  forceMobileLayout?: boolean;
};

type DiaSemana = "SEG" | "TER" | "QUA" | "QUI" | "SEX";

const DIAS: Array<{ value: DiaSemana; label: string; short: string }> = [
  { value: "SEG", label: "Segunda-feira", short: "Seg" },
  { value: "TER", label: "Terça-feira", short: "Ter" },
  { value: "QUA", label: "Quarta-feira", short: "Qua" },
  { value: "QUI", label: "Quinta-feira", short: "Qui" },
  { value: "SEX", label: "Sexta-feira", short: "Sex" },
];

const DAY_PALETTES = [
  {
    title: "text-sky-700",
    header: "border-sky-300 bg-sky-100 text-sky-950",
    subHeader: "border-sky-200 bg-sky-50 text-sky-950",
    cell: "border-sky-200 bg-sky-50/55",
    rowTitle: "border-sky-200 bg-sky-50 text-sky-950",
    badge: "border-sky-200 bg-sky-100 text-sky-800",
  },
  {
    title: "text-emerald-700",
    header: "border-emerald-300 bg-emerald-100 text-emerald-950",
    subHeader: "border-emerald-200 bg-emerald-50 text-emerald-950",
    cell: "border-emerald-200 bg-emerald-50/55",
    rowTitle: "border-emerald-200 bg-emerald-50 text-emerald-950",
    badge: "border-emerald-200 bg-emerald-100 text-emerald-800",
  },
];

function getDayPalette(dayIndex: number) {
  return DAY_PALETTES[dayIndex % DAY_PALETTES.length];
}

function getContextKey(turma: ScheduleTurma) {
  return turma.contextId || turma.id;
}

function getAulaDisciplina(aula: ScheduleAula) {
  if (!aula.turmaProfessorId) {
    return aula.disciplina || "Intervalo";
  }

  return aula.turmaProfessor?.disciplina || aula.disciplina;
}

function getAulaProfessor(aula: ScheduleAula) {
  if (!aula.turmaProfessorId) return "Pausa";
  return aula.turmaProfessor?.professor?.name || "Professor não informado";
}

function aulaMatchesProfessor(aula: ScheduleAula, professorId?: string) {
  if (!professorId) return true;
  return aula.turmaProfessor?.professor?.id === professorId;
}

function hasAulas(turma: ScheduleTurma, professorId?: string) {
  return turma.aulas.some((aula) => aulaMatchesProfessor(aula, professorId));
}

function getTurmaSortInfo(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const numberMatch = normalized.match(/\d+/);
  const number = numberMatch ? Number(numberMatch[0]) : 999;
  const isAno =
    normalized.includes(" ANO") || /\d+\s*[ºª]?\s*ANO\b/.test(normalized);
  const isSerie =
    normalized.includes("SERIE") ||
    normalized.includes("ENSINO MEDIO") ||
    /\d+\s*[ªA]?\s*SERIE\b/.test(normalized);
  const suffixMatch = normalized.match(
    /\d+\s*[ºª]?\s*(?:ANO|SERIE)?\s*([A-Z])\b/,
  );
  const suffix = suffixMatch?.[1] || "";

  return {
    group: isAno ? 0 : isSerie ? 1 : 2,
    number,
    suffix,
    normalized,
  };
}

function sortTurmas(a: ScheduleTurma, b: ScheduleTurma) {
  const turmaA = getTurmaSortInfo(a.name);
  const turmaB = getTurmaSortInfo(b.name);

  return (
    turmaA.group - turmaB.group ||
    turmaA.number - turmaB.number ||
    turmaA.suffix.localeCompare(turmaB.suffix) ||
    turmaA.normalized.localeCompare(turmaB.normalized) ||
    String(a.aluno?.name || "").localeCompare(String(b.aluno?.name || ""))
  );
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.MAX_SAFE_INTEGER;

  return hours * 60 + minutes;
}

function buildHorarios(
  turmas: ScheduleTurma[],
  professorId?: string,
  turnFilter?: Turno,
  horarioConfigs?: Partial<Record<Turno, HorarioConfig>>,
  turmaHorarioConfigs?: Record<string, HorarioConfig>,
  preferConfiguredSlots = false,
) {
  const horarios = new Map<string, { inicio: string; fim: string }>();
  const configHorarios = new Map<string, { inicio: string; fim: string }>();
  const turmaConfigHorarios = new Map<string, { inicio: string; fim: string }>();
  const aulasHorarios = new Map<string, { inicio: string; fim: string }>();

  if (turnFilter && horarioConfigs?.[turnFilter]) {
    buildHorarioSlots(horarioConfigs[turnFilter]!).forEach((slot) => {
      const key = `${slot.inicio}-${slot.fim}`;
      configHorarios.set(key, { inicio: slot.inicio, fim: slot.fim });
    });
  }

  turmas.forEach((turma) => {
    if (preferConfiguredSlots) {
      const turmaConfig = turmaHorarioConfigs?.[turma.id];
      if (turmaConfig) {
        buildHorarioSlots(turmaConfig).forEach((slot) => {
          const key = `${slot.inicio}-${slot.fim}`;
          turmaConfigHorarios.set(key, { inicio: slot.inicio, fim: slot.fim });
        });
      }
    }

    if (!turnFilter && turma.turno && horarioConfigs) {
      const config = horarioConfigs[normalizeTurno(turma.turno)];

      if (config) {
        buildHorarioSlots(config).forEach((slot) => {
          const key = `${slot.inicio}-${slot.fim}`;
          horarios.set(key, { inicio: slot.inicio, fim: slot.fim });
        });
      }
    }

    turma.aulas
      .filter((aula) => aulaMatchesProfessor(aula, professorId))
      .forEach((aula) => {
        const key = `${aula.horaInicio}-${aula.horaFim}`;
        aulasHorarios.set(key, { inicio: aula.horaInicio, fim: aula.horaFim });
      });
  });

  if (turnFilter) {
    const source =
      preferConfiguredSlots && configHorarios.size > 0
        ? configHorarios
        : preferConfiguredSlots && turmaConfigHorarios.size > 0
        ? turmaConfigHorarios
        : aulasHorarios.size > configHorarios.size && aulasHorarios.size > 0
        ? aulasHorarios
        : configHorarios.size > 0
          ? configHorarios
          : aulasHorarios;

    source.forEach((value, key) => {
      horarios.set(key, value);
    });
  } else {
    aulasHorarios.forEach((value, key) => {
      horarios.set(key, value);
    });
  }

  return Array.from(horarios.values()).sort(
    (a, b) =>
      toMinutes(a.inicio) - toMinutes(b.inicio) ||
      toMinutes(a.fim) - toMinutes(b.fim),
  );
}

function getAulaDaGrade(
  turma: ScheduleTurma,
  dia: DiaSemana,
  horario: { inicio: string; fim: string },
  professorId?: string,
) {
  return turma.aulas.find(
    (aula) =>
      aula.diaSemana === dia &&
      aula.horaInicio < horario.fim &&
      aula.horaFim > horario.inicio &&
      aulaMatchesProfessor(aula, professorId),
  );
}

function hasAulaNoDia(
  turma: ScheduleTurma,
  dia: DiaSemana,
  professorId?: string,
) {
  return turma.aulas.some(
    (aula) => aula.diaSemana === dia && aulaMatchesProfessor(aula, professorId),
  );
}

function getAulasDaTurmaNoDia(
  turma: ScheduleTurma,
  dia: DiaSemana,
  horarios: Array<{ inicio: string; fim: string }>,
  professorId?: string,
) {
  return horarios
    .map((horario) => ({
      horario,
      aula: getAulaDaGrade(turma, dia, horario, professorId),
    }))
    .filter(
      (
        item,
      ): item is {
        horario: { inicio: string; fim: string };
        aula: ScheduleAula;
      } => Boolean(item.aula),
    );
}

function TurmaCell({
  turma,
  compact = false,
}: {
  turma: ScheduleTurma;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center leading-tight ${
        compact ? "min-h-[72px]" : "min-h-[92px]"
      }`}
    >
      <span
        className={`block font-black tracking-tight text-blue-950 ${
          compact ? "text-sm" : "text-base"
        }`}
      >
        {turma.name}
      </span>
      {turma.turno ? (
        <span
          className={`mt-1 block font-bold uppercase tracking-[0.14em] text-slate-500 ${
            compact ? "text-[10px]" : "text-[11px]"
          }`}
        >
          {formatTurno(turma.turno)}
        </span>
      ) : null}
      {turma.aluno?.name ? (
        <span
          className={`mt-2 block max-w-[180px] font-semibold text-slate-500 ${
            compact ? "text-[10px]" : "text-[11px]"
          }`}
        >
          {turma.aluno.name}
        </span>
      ) : null}
    </div>
  );
}

function AulaCell({
  aula,
  professorColors,
  compact = false,
}: {
  aula: ScheduleAula;
  professorColors: ReturnType<typeof buildProfessorColorMap>;
  compact?: boolean;
}) {
  const disciplina = getAulaDisciplina(aula);
  const professorStyle = getProfessorColorStyle(
    professorColors,
    {
      id: aula.turmaProfessor?.professor?.id,
      name: aula.turmaProfessor?.professor?.name,
    },
    { isIntervalo: !aula.turmaProfessorId },
  );

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border text-center leading-tight shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] ${
        compact ? "min-h-[72px] px-1.5 py-2" : "min-h-[92px] px-2 py-3"
      }`}
      style={professorStyle}
    >
      <span
        className={`line-clamp-2 font-black leading-[1.15] ${
          compact ? "text-[11px]" : "text-[12px]"
        }`}
      >
        {disciplina}
      </span>
      <span
        className={`mt-1 line-clamp-2 font-semibold leading-[1.2] ${
          compact ? "text-[10px]" : "text-[11px]"
        }`}
      >
        {getAulaProfessor(aula)}
      </span>
    </div>
  );
}

export default function ScheduleGrid({
  turmas,
  mode = "weekly",
  professorId,
  turnFilter,
  dayFilter,
  horarioConfigs,
  turmaHorarioConfigs,
  preferConfiguredSlots = false,
  title,
  subtitle,
  emptyMessage = "Nenhuma aula cadastrada para montar a grade.",
  compact = false,
  forceMobileLayout = false,
}: ScheduleGridProps) {
  const [useMobileWeeklyLayout, setUseMobileWeeklyLayout] = useState(false);

  useEffect(() => {
    function syncScreenMode() {
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
      const isPhoneLikeWidth = window.innerWidth < 1024;

      setUseMobileWeeklyLayout(
        (isTouchDevice && isPortrait) || window.innerWidth < 820 || isPhoneLikeWidth,
      );
    }

    syncScreenMode();
    window.addEventListener("resize", syncScreenMode);
    window.addEventListener("orientationchange", syncScreenMode);

    return () => {
      window.removeEventListener("resize", syncScreenMode);
      window.removeEventListener("orientationchange", syncScreenMode);
    };
  }, []);

  const visibleTurmas = useMemo(
    () =>
      (professorId
        ? turmas.filter((turma) => hasAulas(turma, professorId))
        : turmas
      )
        .filter((turma) =>
          turnFilter ? normalizeTurno(turma.turno) === turnFilter : true,
        )
        .sort(sortTurmas),
    [professorId, turmas, turnFilter],
  );

  const horarios = useMemo(
    () =>
      buildHorarios(
        visibleTurmas,
        professorId,
        turnFilter,
        horarioConfigs,
        turmaHorarioConfigs,
        preferConfiguredSlots,
      ),
    [
      horarioConfigs,
      preferConfiguredSlots,
      professorId,
      turmaHorarioConfigs,
      turnFilter,
      visibleTurmas,
    ],
  );
  const professorColors = useMemo(
    () =>
      buildProfessorColorMap(
        visibleTurmas.flatMap((turma) =>
          turma.aulas
            .filter((aula) => aulaMatchesProfessor(aula, professorId))
            .filter((aula) => aula.turmaProfessorId)
            .map((aula) => ({
              id: aula.turmaProfessor?.professor?.id,
              name: aula.turmaProfessor?.professor?.name,
            })),
        ),
      ),
    [professorId, visibleTurmas],
  );

  if (visibleTurmas.length === 0 || horarios.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm font-semibold text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  if (mode === "daily") {
    const visibleDays = dayFilter
      ? DIAS.filter((dia) => dia.value === dayFilter)
      : DIAS;

    return (
      <div className={`overflow-hidden border border-sky-200 bg-[linear-gradient(180deg,#fffdf8,#f6fbff)] shadow-[0_20px_50px_rgba(53,92,142,0.12)] ${compact ? "rounded-[1.5rem] p-3" : "rounded-[2rem] p-5"}`}>
        <div className={`border border-sky-100 bg-white ${compact ? "rounded-[1.2rem] px-3 py-4" : "rounded-[1.6rem] px-5 py-6"}`}>
          <div className="text-center">
            <h3 className={`font-black tracking-wide ${compact ? "text-2xl md:text-4xl" : "text-3xl md:text-5xl"}`}>
              <span className="text-blue-600">HORARIO</span>{" "}
              <span className="text-emerald-600">DE</span>{" "}
              <span className="text-red-500">AULA</span>{" "}
              <span className="text-violet-600">DIARIO</span>
            </h3>
            {subtitle || title ? (
              <p className={`mt-2 font-bold text-slate-700 ${compact ? "text-xs md:text-sm" : "text-sm md:text-base"}`}>
                {subtitle || title}
              </p>
            ) : null}
            <div className="mx-auto mt-4 h-1 max-w-xl rounded-full bg-[linear-gradient(90deg,#5fbf72,#f2c94c,#f06b6b,#8f6fd5)]" />
          </div>

        <div className="mt-6 space-y-6">
            {visibleDays.map((dia, dayIndex) => {
              const palette = getDayPalette(dayIndex);
              const turmasDoDia = professorId
                ? visibleTurmas.filter((turma) =>
                    hasAulaNoDia(turma, dia.value, professorId),
                  )
                : visibleTurmas;

              return (
                <section key={dia.value} className={`border ${compact ? "rounded-xl p-3" : "rounded-2xl p-4"} ${palette.cell}`}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h4 className={`${compact ? "text-base" : "text-lg"} font-black ${palette.title}`}>
                      {dia.label}
                    </h4>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-black ${palette.badge}`}
                    >
                      {turmasDoDia.length} turma(s)
                    </span>
                  </div>

                  {turmasDoDia.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-5 text-center text-sm font-semibold text-slate-500">
                      Nenhuma aula neste dia.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className={`w-full table-fixed border-separate border-spacing-0 ${compact ? "min-w-[820px] text-xs" : "min-w-[1050px] text-sm"}`}>
                        <colgroup>
                          <col className={compact ? "w-[170px]" : "w-[220px]"} />
                          {horarios.map((horario) => (
                            <col
                              key={`daily-col-${dia.value}-${horario.inicio}-${horario.fim}`}
                              className={compact ? "w-[112px]" : "w-[148px]"}
                            />
                          ))}
                        </colgroup>
                        <thead>
                          <tr>
                            <th className={`sticky left-0 z-10 rounded-tl-xl border-2 border-sky-300 bg-blue-100 text-center font-black uppercase tracking-[0.16em] text-blue-950 ${compact ? "px-3 py-3 text-sm" : "px-4 py-4 text-base"}`}>
                              Serie / Turma
                            </th>
                            {horarios.map((horario, horarioIndex) => (
                              <th
                                key={`${dia.value}-${horario.inicio}-${horario.fim}`}
                                className={`border-2 text-center align-middle ${compact ? "px-1.5 py-2" : "px-2 py-3"} ${palette.subHeader}`}
                              >
                                <div className={`flex flex-col items-center justify-center gap-1 ${compact ? "min-h-[66px]" : "min-h-[88px]"}`}>
                                  <span className={`block font-black uppercase tracking-[0.14em] ${compact ? "text-sm" : "text-base"}`}>
                                    {horarioIndex + 1}a aula
                                  </span>
                                  <span className={`block font-semibold text-slate-600 ${compact ? "text-[10px]" : "text-[11px]"}`}>
                                    {horario.inicio} - {horario.fim}
                                  </span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {turmasDoDia.map((turma) => (
                            <tr key={`daily-${dia.value}-${getContextKey(turma)}`}>
                              <td className={`sticky left-0 z-[1] border-2 border-sky-200 bg-blue-50 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
                                <TurmaCell turma={turma} compact={compact} />
                              </td>
                              {horarios.map((horario) => {
                                const aula = getAulaDaGrade(
                                  turma,
                                  dia.value,
                                  horario,
                                  professorId,
                                );

                                return (
                                  <td
                                    key={`daily-${dia.value}-${getContextKey(
                                      turma,
                                    )}-${horario.inicio}-${horario.fim}`}
                                    className={`${compact ? "h-[82px] p-1.5" : "h-[104px] p-2"} border align-top ${palette.cell}`}
                                  >
                                    {aula ? (
                                      <AulaCell
                                        aula={aula}
                                        professorColors={professorColors}
                                        compact={compact}
                                      />
                                    ) : null}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden border border-sky-200 bg-[linear-gradient(180deg,#fffdf8,#f6fbff)] shadow-[0_20px_50px_rgba(53,92,142,0.12)] ${compact ? "rounded-[1.5rem] p-3" : "rounded-[2rem] p-5"}`}>
      <div className={`border border-sky-100 bg-white ${compact ? "rounded-[1.2rem] px-3 py-4" : "rounded-[1.6rem] px-5 py-6"}`}>
        <div className="text-center">
          <h3 className={`font-black tracking-wide ${compact ? "text-2xl md:text-4xl" : "text-3xl md:text-5xl"}`}>
            <span className="text-blue-600">HORARIO</span>{" "}
            <span className="text-emerald-600">DE</span>{" "}
            <span className="text-red-500">AULA</span>{" "}
            <span className="text-violet-600">SEMANAL</span>
          </h3>
          {subtitle || title ? (
            <p className={`mt-2 font-bold text-slate-700 ${compact ? "text-xs md:text-sm" : "text-sm md:text-base"}`}>
              {subtitle || title}
            </p>
          ) : null}
          <div className="mx-auto mt-4 h-1 max-w-xl rounded-full bg-[linear-gradient(90deg,#5fbf72,#f2c94c,#f06b6b,#8f6fd5)]" />
        </div>

        {forceMobileLayout || useMobileWeeklyLayout ? (
          <div className="mt-6 space-y-4">
          {DIAS.map((dia, dayIndex) => {
            const palette = getDayPalette(dayIndex);
            const turmasDoDia = visibleTurmas
              .map((turma) => ({
                turma,
                aulas: getAulasDaTurmaNoDia(turma, dia.value, horarios, professorId),
              }))
              .filter((item) => item.aulas.length > 0);

            return (
              <section
                key={`mobile-weekly-${dia.value}`}
                className={`rounded-[1.4rem] border p-3 ${palette.cell}`}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className={`text-base font-black ${palette.title}`}>
                    {dia.label}
                  </h4>
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-black ${palette.badge}`}
                  >
                    {turmasDoDia.length} turma(s)
                  </span>
                </div>

                {turmasDoDia.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white/75 p-4 text-center text-sm font-semibold text-slate-500">
                    Nenhuma aula neste dia.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {turmasDoDia.map(({ turma, aulas }) => (
                      <article
                        key={`mobile-weekly-${dia.value}-${getContextKey(turma)}`}
                        className="rounded-[1.2rem] border border-white/70 bg-white/90 p-3 shadow-[0_10px_24px_rgba(148,163,184,0.12)]"
                      >
                        <div className="border-b border-slate-200 pb-3">
                          <TurmaCell turma={turma} compact />
                        </div>

                        <div className="mt-3 space-y-2">
                          {aulas.map(({ horario, aula }) => {
                            const professorStyle = getProfessorColorStyle(
                              professorColors,
                              {
                                id: aula.turmaProfessor?.professor?.id,
                                name: aula.turmaProfessor?.professor?.name,
                              },
                              { isIntervalo: !aula.turmaProfessorId },
                            );

                            return (
                              <div
                                key={`mobile-weekly-${getContextKey(turma)}-${dia.value}-${horario.inicio}-${horario.fim}`}
                                className="rounded-xl border px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
                                style={professorStyle}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                                      {horario.inicio} - {horario.fim}
                                    </p>
                                    <p className="mt-1 text-sm font-black leading-tight text-slate-900">
                                      {getAulaDisciplina(aula)}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                                      {getAulaProfessor(aula)}
                                    </p>
                                  </div>
                                  <span className="shrink-0 rounded-full border border-white/70 bg-white/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
                                    Aula
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          </div>
        ) : (
        <div className="mt-6 overflow-x-auto">
          <table className={`w-full table-fixed border-separate border-spacing-0 ${compact ? "min-w-[1260px] text-[10px]" : "min-w-[1680px] text-[11px]"}`}>
            <colgroup>
              <col className={compact ? "w-[170px]" : "w-[220px]"} />
              {DIAS.flatMap((dia) =>
                horarios.map((horario) => (
                  <col
                    key={`weekly-col-${dia.value}-${horario.inicio}-${horario.fim}`}
                    className={compact ? "w-[112px]" : "w-[148px]"}
                  />
                )),
              )}
            </colgroup>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className={`sticky left-0 z-20 rounded-tl-xl border-2 border-sky-300 bg-blue-100 text-center font-black uppercase tracking-[0.16em] text-blue-950 ${compact ? "px-3 py-3 text-sm" : "px-4 py-4 text-base"}`}
                >
                  Serie / Turma
                </th>
                {DIAS.map((dia, dayIndex) => {
                  const palette = getDayPalette(dayIndex);

                  return (
                    <th
                      key={dia.value}
                      colSpan={horarios.length}
                      className={`border-2 text-center font-black ${compact ? "px-2 py-3 text-sm" : "px-3 py-4 text-base"} ${palette.header}`}
                    >
                      {dia.label}
                    </th>
                  );
                })}
              </tr>
              <tr>
                {DIAS.map((dia, dayIndex) => {
                  const palette = getDayPalette(dayIndex);

                  return (
                    <Fragment key={`head-${dia.value}`}>
                      {horarios.map((horario, horarioIndex) => (
                        <th
                          key={`${dia.value}-${horario.inicio}-${horario.fim}`}
                          className={`border-2 text-center align-middle ${compact ? "px-1.5 py-2" : "px-2 py-3"} ${palette.subHeader}`}
                        >
                          <div className={`flex flex-col items-center justify-center gap-1 ${compact ? "min-h-[66px]" : "min-h-[92px]"}`}>
                            <span className={`block font-black uppercase tracking-[0.14em] ${compact ? "text-sm" : "text-base"}`}>
                              {horarioIndex + 1}a aula
                            </span>
                            <span className={`block font-semibold text-slate-600 ${compact ? "text-[10px]" : "text-[11px]"}`}>
                              {horario.inicio} - {horario.fim}
                            </span>
                          </div>
                        </th>
                      ))}
                    </Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleTurmas.map((turma) => (
                <tr key={`weekly-${getContextKey(turma)}`}>
                  <td className={`sticky left-0 z-10 border-2 border-sky-200 bg-blue-50 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
                    <TurmaCell turma={turma} compact={compact} />
                  </td>
                  {DIAS.map((dia, dayIndex) => {
                    const palette = getDayPalette(dayIndex);

                    return (
                      <Fragment key={`body-${getContextKey(turma)}-${dia.value}`}>
                        {horarios.map((horario) => {
                          const aula = getAulaDaGrade(
                            turma,
                            dia.value,
                            horario,
                            professorId,
                          );

                          return (
                            <td
                              key={`weekly-${getContextKey(turma)}-${dia.value}-${
                                horario.inicio
                              }-${
                                horario.fim
                              }`}
                              className={`${compact ? "h-[82px] p-1.5" : "h-[104px] p-2"} border align-top ${palette.cell}`}
                            >
                              {aula ? (
                                <AulaCell
                                  aula={aula}
                                  professorColors={professorColors}
                                  compact={compact}
                                />
                              ) : null}
                            </td>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        <div className="mt-6 rounded-[1.4rem] border-2 border-dashed border-orange-200 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-sm font-black text-blue-700">
              OK
            </div>
            <span className="text-xl font-semibold text-slate-900">
              Observacoes:
            </span>
            <div className="h-px flex-1 bg-slate-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
