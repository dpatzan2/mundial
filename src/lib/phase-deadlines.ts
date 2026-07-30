import type { MatchStage, MatchStatus } from "@prisma/client";
import { atAppDay22Hours, formatAppDateTime } from "@/lib/timezone";
import { previousStageForUnlock, stageLabels } from "@/lib/stages";

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_HOUR = 60 * 60 * 1000;
// ponytail: bypass explicito. Antes bastaba con `next dev` para abrir todas las fases,
// asi que en local nunca se podia probar el limite real. Se activa con UNLOCK_PHASE_DEADLINES=1.
export const DEVELOPMENT_PHASE_UNLOCKS = process.env.UNLOCK_PHASE_DEADLINES === "1";

export type PickDeadlineMode = "LEGACY" | "PER_MATCH" | "PHASE";

export type PickDeadlineConfig = {
  mode?: PickDeadlineMode;
  hoursBefore?: number;
};

export type PhaseDeadlineInfo = {
  stage: MatchStage;
  startsAt: Date;
  deadlineAt: Date;
  peerVisibilityAt: Date;
  locked: boolean;
  deadlineLocked: boolean;
  sequentialLocked: boolean;
  peerPredictionsVisible: boolean;
  previousStage: MatchStage | null;
  deadlineLabel: string;
  startsLabel: string;
  peerVisibilityLabel: string;
};

export type SerializedPhaseDeadline = {
  stage: MatchStage;
  deadlineAt: string;
  startsAt: string;
  peerVisibilityAt: string;
  locked: boolean;
  deadlineLocked: boolean;
  sequentialLocked: boolean;
  peerPredictionsVisible: boolean;
  previousStage: MatchStage | null;
  deadlineLabel: string;
  startsLabel: string;
  peerVisibilityLabel: string;
};

type MatchForPhaseDeadlines = {
  stage: MatchStage;
  kickoffAt: Date | null;
  status: MatchStatus;
};

function phaseDeadlineAt(stage: MatchStage, startsAt: Date) {
  if (stage === "GROUP") {
    return atAppDay22Hours(new Date(startsAt.getTime() - MS_DAY));
  }

  return new Date(startsAt.getTime() - MS_HOUR);
}

function normalizedDeadlineHours(hoursBefore?: number) {
  if (typeof hoursBefore !== "number" || !Number.isFinite(hoursBefore)) return 1;
  return Math.max(0, Math.min(168, Math.trunc(hoursBefore)));
}

function configuredPhaseDeadlineAt(startsAt: Date, config?: PickDeadlineConfig) {
  if (config?.mode === "PHASE") {
    return new Date(startsAt.getTime() - normalizedDeadlineHours(config.hoursBefore) * MS_HOUR);
  }
  return null;
}

function isGroupStage(stage: MatchStage) {
  return stage === "GROUP";
}

export function matchDeadlineAt(
  match: { stage: MatchStage; kickoffAt?: Date | null },
  config?: PickDeadlineConfig,
) {
  if (!match.kickoffAt) return null;
  if (config?.mode === "PER_MATCH") {
    return new Date(match.kickoffAt.getTime() - normalizedDeadlineHours(config.hoursBefore) * MS_HOUR);
  }
  if (config?.mode === "PHASE") return null;
  if (isGroupStage(match.stage)) {
    return atAppDay22Hours(new Date(match.kickoffAt.getTime() - MS_DAY));
  }

  return new Date(match.kickoffAt.getTime() - MS_HOUR);
}

export function isStageComplete(
  matches: MatchForPhaseDeadlines[],
  stage: MatchStage,
) {
  const stageMatches = matches.filter((match) => match.stage === stage);
  if (stageMatches.length === 0) return true;
  return stageMatches.every((match) => match.status === "FINISHED");
}

export function computePhaseDeadlines(
  matches: MatchForPhaseDeadlines[],
  now = new Date(),
  config: PickDeadlineConfig = {},
): Map<MatchStage, PhaseDeadlineInfo> {
  const firstKickoffByStage = new Map<MatchStage, Date>();
  const latestDeadlineByStage = new Map<MatchStage, Date>();

  for (const match of matches) {
    if (!match.kickoffAt) continue;
    const current = firstKickoffByStage.get(match.stage);
    if (!current || match.kickoffAt < current) {
      firstKickoffByStage.set(match.stage, match.kickoffAt);
    }

    const matchDeadline = config.mode === "PER_MATCH" ? matchDeadlineAt(match, config) : null;
    const latestDeadline = latestDeadlineByStage.get(match.stage);
    if (matchDeadline && (!latestDeadline || matchDeadline > latestDeadline)) {
      latestDeadlineByStage.set(match.stage, matchDeadline);
    }
  }

  const deadlines = new Map<MatchStage, PhaseDeadlineInfo>();

  for (const [stage, startsAt] of firstKickoffByStage) {
    const configuredPhaseDeadline = configuredPhaseDeadlineAt(startsAt, config);
    const deadlineAt =
      latestDeadlineByStage.get(stage) ??
      configuredPhaseDeadline ??
      phaseDeadlineAt(stage, startsAt);
    const peerVisibilityAt = deadlineAt;
    const deadlineLocked = !DEVELOPMENT_PHASE_UNLOCKS && now >= deadlineAt;
    const previousStage = previousStageForUnlock(stage);
    const sequentialLocked =
      !DEVELOPMENT_PHASE_UNLOCKS && previousStage
        ? !isStageComplete(matches, previousStage)
        : false;
    const peerPredictionsVisible = DEVELOPMENT_PHASE_UNLOCKS || now >= peerVisibilityAt;

    deadlines.set(stage, {
      stage,
      startsAt,
      deadlineAt,
      peerVisibilityAt,
      deadlineLocked,
      sequentialLocked,
      peerPredictionsVisible,
      locked: deadlineLocked || sequentialLocked,
      previousStage,
      deadlineLabel: formatAppDateTime(deadlineAt),
      startsLabel: formatAppDateTime(startsAt),
      peerVisibilityLabel: formatAppDateTime(peerVisibilityAt),
    });
  }

  return deadlines;
}

export function arePeerPredictionsVisible(deadline?: SerializedPhaseDeadline | PhaseDeadlineInfo) {
  if (!deadline) return false;
  return deadline.peerPredictionsVisible;
}

export function canViewPeerPredictions(deadline?: SerializedPhaseDeadline | PhaseDeadlineInfo) {
  return arePeerPredictionsVisible(deadline);
}

export function canViewPeerPredictionsForMatch(
  match: { stage: MatchStage; kickoffAt?: Date | null },
  deadlines: Map<MatchStage, PhaseDeadlineInfo>,
  now = new Date(),
  config: PickDeadlineConfig = {},
) {
  if (DEVELOPMENT_PHASE_UNLOCKS) return true;
  if (config.mode !== "PER_MATCH" && isGroupStage(match.stage)) {
    return canViewPeerPredictions(deadlines.get(match.stage));
  }

  const phase = deadlines.get(match.stage);
  if (phase?.sequentialLocked) return false;

  const deadlineAt = matchDeadlineAt(match, config);
  return deadlineAt ? now >= deadlineAt : canViewPeerPredictions(phase);
}

export function phasePeerVisibilityBanner(deadline: SerializedPhaseDeadline) {
  if (canViewPeerPredictions(deadline)) return null;

  return {
    title: "Pronosticos ocultos",
    message:
      deadline.stage === "GROUP"
        ? `Estos pronosticos se podran ver el ${deadline.peerVisibilityLabel} (hora Guatemala).`
        : "Estos pronosticos se podran ver conforme cierre cada partido.",
  };
}

export function isPhaseTabEnterable(deadline?: SerializedPhaseDeadline | PhaseDeadlineInfo) {
  if (!deadline) return true;
  if (deadline.deadlineLocked) return true;
  return !deadline.sequentialLocked;
}

export function firstEnterableStage(
  stages: MatchStage[],
  deadlines?: Partial<Record<MatchStage, SerializedPhaseDeadline>>,
) {
  return stages.find((stage) => isPhaseTabEnterable(deadlines?.[stage])) ?? stages[0] ?? "GROUP";
}

export function phaseTabStatusLabel(deadline: SerializedPhaseDeadline) {
  if (deadline.deadlineLocked) return "Cerrada";
  if (deadline.stage === "GROUP") return `Hasta ${deadline.deadlineLabel} GT`;
  return `Partidos hasta ${deadline.deadlineLabel} GT`;
}

export function roomDeadlineConfig(room: {
  deadlineMode?: "PER_MATCH" | "PHASE";
  deadlineHoursBefore?: number;
}): PickDeadlineConfig {
  return {
    mode: room.deadlineMode ?? "PER_MATCH",
    hoursBefore: room.deadlineHoursBefore ?? 1,
  };
}

export function championPickDeadlineAt(
  matches: Array<{ kickoffAt?: Date | null }>,
  hoursBefore = 1,
  override?: Date | null,
) {
  if (override) return override;
  const firstKickoff = matches
    .map((match) => match.kickoffAt)
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime())[0];
  if (!firstKickoff) return null;
  return new Date(firstKickoff.getTime() - normalizedDeadlineHours(hoursBefore) * MS_HOUR);
}

export function phaseDeadlineBanner(
  deadline: SerializedPhaseDeadline,
  {
    editable = false,
    deadlineMode,
    deadlineHoursBefore,
  }: { editable?: boolean; deadlineMode?: PickDeadlineMode; deadlineHoursBefore?: number } = {},
) {
  if (deadline.deadlineLocked) {
    return {
      closed: true,
      title: editable ? "Fase cerrada · solo lectura" : "Fase cerrada",
      message: editable
        ? `Ya no puedes modificar pronosticos de esta fase. El limite fue el ${deadline.deadlineLabel}.`
        : `El limite de pronosticos fue el ${deadline.deadlineLabel}. La fase inicio el ${deadline.startsLabel}.`,
    };
  }

  if (deadline.sequentialLocked && deadline.previousStage) {
    const previousLabel = stageLabels[deadline.previousStage];
    return {
      closed: true,
      title: editable ? "Fase bloqueada · solo lectura" : "Fase bloqueada",
      message: editable
        ? `Los pronosticos se abriran cuando termine ${previousLabel}.`
        : `Esta fase aun no abre porque ${previousLabel} no ha terminado.`,
    };
  }

  return {
    closed: false,
    title: "Limite de pronosticos",
    message: editable
      ? deadlineMode === "PER_MATCH"
        ? `Puedes editar cada partido hasta ${normalizedDeadlineHours(deadlineHoursBefore)} hora(s) antes de su inicio.`
        : deadlineMode === "PHASE"
          ? `Puedes editar esta fase hasta ${normalizedDeadlineHours(deadlineHoursBefore)} hora(s) antes del primer partido.`
          : deadline.stage === "GROUP"
        ? `Puedes editar hasta el ${deadline.deadlineLabel} (hora Guatemala), un dia antes del inicio el ${deadline.startsLabel}.`
        : "Puedes editar cada partido hasta 1 hora antes de su inicio."
      : deadlineMode === "PER_MATCH"
        ? `Cada partido se puede pronosticar hasta ${normalizedDeadlineHours(deadlineHoursBefore)} hora(s) antes de su inicio.`
        : deadlineMode === "PHASE"
          ? `La fase completa se puede pronosticar hasta ${normalizedDeadlineHours(deadlineHoursBefore)} hora(s) antes del primer partido.`
          : deadline.stage === "GROUP"
        ? `Hasta el ${deadline.deadlineLabel} (hora Guatemala, un dia antes del inicio el ${deadline.startsLabel}).`
        : "Cada partido se puede pronosticar hasta 1 hora antes de su inicio.",
  };
}

export function isPhaseLockedForPicks(
  stage: MatchStage,
  deadlines: Map<MatchStage, PhaseDeadlineInfo>,
) {
  return deadlines.get(stage)?.locked ?? false;
}

export function isMatchLockedForPicks(
  match: { stage: MatchStage; kickoffAt?: Date | null },
  deadlines: Map<MatchStage, PhaseDeadlineInfo>,
  now = new Date(),
  config: PickDeadlineConfig = {},
) {
  if (DEVELOPMENT_PHASE_UNLOCKS) return false;
  const phase = deadlines.get(match.stage);
  if (phase?.sequentialLocked) return true;
  if (config.mode !== "PER_MATCH" && isGroupStage(match.stage)) return phase?.deadlineLocked ?? false;

  const deadlineAt = matchDeadlineAt(match, config);
  if (!deadlineAt) return phase?.locked ?? false;

  return now >= deadlineAt;
}

export function hasOpenPickPhases(deadlines: Map<MatchStage, PhaseDeadlineInfo>) {
  return Array.from(deadlines.values()).some((item) => !item.locked);
}

export function serializePhaseDeadlines(
  deadlines: Map<MatchStage, PhaseDeadlineInfo>,
): SerializedPhaseDeadline[] {
  return Array.from(deadlines.values()).map((item) => ({
    stage: item.stage,
    deadlineAt: item.deadlineAt.toISOString(),
    startsAt: item.startsAt.toISOString(),
    peerVisibilityAt: item.peerVisibilityAt.toISOString(),
    locked: item.locked,
    deadlineLocked: item.deadlineLocked,
    sequentialLocked: item.sequentialLocked,
    peerPredictionsVisible: item.peerPredictionsVisible,
    previousStage: item.previousStage,
    deadlineLabel: item.deadlineLabel,
    startsLabel: item.startsLabel,
    peerVisibilityLabel: item.peerVisibilityLabel,
  }));
}

export function deadlinesByStage(deadlines: SerializedPhaseDeadline[]) {
  return Object.fromEntries(deadlines.map((item) => [item.stage, item])) as Record<
    MatchStage,
    SerializedPhaseDeadline
  >;
}
