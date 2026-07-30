import type { MatchStage } from "@prisma/client";
import type { FormResult } from "@/lib/competition-insights";

import { stageOrder } from "@/lib/stages";
import { formatAppDateKey, matchScheduleLabels } from "@/lib/timezone";

export type DisplayMatch = {
  id: string;
  matchNumber: number;
  stage: MatchStage;
  groupCode: string | null;
  dateLabel: string | null;
  timeLabel: string | null;
  kickoffAt: Date | null;
  dateKey: string | null;
  venue: string | null;
  venueShort: string | null;
  locked: boolean;
  peerPicksVisible?: boolean;
  pickDeadlineLabel?: string | null;
  home: string;
  away: string;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  homeForm?: FormResult[];
  awayForm?: FormResult[];
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  actualWinnerSide: "HOME" | "AWAY" | null;
  status: "SCHEDULED" | "LIVE" | "FINISHED";
  /** Ida de una llave a doble partido: se pronostica el marcador, no quien pasa. */
  firstLeg?: boolean;
};

export type DisplayMarketAnswer = {
  value: Record<string, unknown>;
  points: number;
};

export type DisplayPrediction = {
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  predictedWinnerSide: "HOME" | "AWAY" | null;
  points: number;
  bonusPoints?: number;
};

export type PeerPrediction = {
  userId: string;
  displayName: string;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  predictedWinnerSide: "HOME" | "AWAY" | null;
  pickedTeamName: string | null;
  points: number;
};

export type PopularPrediction = {
  visible: boolean;
  total: number;
  homePercent: number;
  drawPercent: number;
  awayPercent: number;
  advanceHomePercent?: number;
  advanceAwayPercent?: number;
};

export type TeamOption = {
  id: string;
  name: string;
};

export function teamName(
  team: { name: string } | null | undefined,
  placeholder: string | null | undefined,
  fallback: string,
) {
  return team?.name ?? placeholder ?? fallback;
}

export function withGuatemalaSchedule<
  T extends {
    dateLabel: string | null;
    timeLabel: string | null;
    kickoffAt?: Date | null;
  },
>(match: T) {
  const schedule = matchScheduleLabels(
    match.kickoffAt ?? null,
    match.dateLabel,
    match.timeLabel,
  );
  const dateKey = match.kickoffAt ? formatAppDateKey(match.kickoffAt) : null;
  return { ...match, ...schedule, dateKey };
}

export const TBD_DATE_KEY = "TBD";

export type MatchDateTab = {
  dateKey: string;
  kickoffAt: Date | null;
};

/** Fechas distintas (en orden de aparicion) entre los partidos dados; los partidos sin fecha van al final. */
export function collectDateTabs(matches: DisplayMatch[]): MatchDateTab[] {
  const tabs: MatchDateTab[] = [];
  const seen = new Set<string>();
  let hasTbd = false;

  for (const match of matches) {
    if (!match.dateKey) {
      hasTbd = true;
      continue;
    }
    if (seen.has(match.dateKey)) continue;
    seen.add(match.dateKey);
    tabs.push({ dateKey: match.dateKey, kickoffAt: match.kickoffAt });
  }

  if (hasTbd) {
    tabs.push({ dateKey: TBD_DATE_KEY, kickoffAt: null });
  }

  return tabs;
}

/** Fecha inicial de un carrusel: hoy si tiene partidos, si no la mas cercana. */
export function defaultDateKey(tabs: MatchDateTab[], now = new Date()) {
  const todayKey = formatAppDateKey(now);
  if (tabs.some((tab) => tab.dateKey === todayKey)) return todayKey;

  const nearest = tabs.reduce<{ key: string; diff: number } | null>((closest, tab) => {
    if (!tab.kickoffAt) return closest;
    const diff = Math.abs(tab.kickoffAt.getTime() - now.getTime());
    return !closest || diff < closest.diff ? { key: tab.dateKey, diff } : closest;
  }, null);

  return nearest?.key ?? tabs[0]?.dateKey ?? TBD_DATE_KEY;
}

export type PhaseMatchGroup = {
  key: string;
  stage: MatchStage;
  groupCode: string | null;
  matches: DisplayMatch[];
};

/** Agrupa partidos por fase (y por grupo dentro de la fase de grupos), en orden de fase y luego de grupo. */
export function groupMatchesByPhase(matches: DisplayMatch[]): PhaseMatchGroup[] {
  const groups = new Map<string, PhaseMatchGroup>();

  for (const match of matches) {
    const groupCode = match.stage === "GROUP" ? match.groupCode : null;
    const key = `${match.stage}:${groupCode ?? ""}`;
    const existing = groups.get(key);
    if (existing) {
      existing.matches.push(match);
    } else {
      groups.set(key, { key, stage: match.stage, groupCode, matches: [match] });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const stageDiff = stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage);
    if (stageDiff !== 0) return stageDiff;
    return (a.groupCode ?? "").localeCompare(b.groupCode ?? "");
  });
}
