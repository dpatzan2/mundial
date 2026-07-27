import type { DisplayMatch } from "@/lib/match-ui";
import type { RoomMarketKey } from "@/lib/room-presets";

type MarketValue = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function outcome(match: DisplayMatch) {
  if (match.homeScore === null || match.awayScore === null) return "";
  if (match.homeScore === match.awayScore) return "DRAW";
  return match.homeScore > match.awayScore ? "HOME" : "AWAY";
}

function goalRange(total: number) {
  if (total <= 1) return "0-1";
  if (total <= 3) return "2-3";
  if (total <= 5) return "4-5";
  return "6+";
}

// Mercados que salen solos del marcador final. PredictionResultSummary los prefiere sobre
// cualquier valor guardado, asi que capturarlos a mano en el admin no cambia nada.
export const derivedMarkets: RoomMarketKey[] = [
  "TOTAL_GOALS",
  "EXACT_TOTAL_GOALS",
  "OVER_UNDER_2_5",
  "ODD_EVEN_TOTAL_GOALS",
  "BOTH_TEAMS_SCORE",
  "DOUBLE_CHANCE",
  "TEAM_TOTAL_GOALS",
  "CLEAN_SHEET",
  "WIN_TO_NIL",
  "WIN_MARGIN",
];

export function derivedMarketResult(
  market: RoomMarketKey,
  match: DisplayMatch,
): MarketValue | null {
  if (match.homeScore === null || match.awayScore === null) return null;
  const home = match.homeScore;
  const away = match.awayScore;
  const total = home + away;

  if (market === "TOTAL_GOALS") return { value: goalRange(total) };
  if (market === "EXACT_TOTAL_GOALS") return { value: total };
  if (market === "OVER_UNDER_2_5") return { value: total > 2.5 ? "OVER_2_5" : "UNDER_2_5" };
  if (market === "ODD_EVEN_TOTAL_GOALS") return { value: total % 2 === 0 ? "EVEN" : "ODD" };
  if (market === "BOTH_TEAMS_SCORE") return { value: home > 0 && away > 0 ? "YES" : "NO" };
  if (market === "DOUBLE_CHANCE") return { value: outcome(match) };
  if (market === "TEAM_TOTAL_GOALS") return { home, away };
  if (market === "CLEAN_SHEET") {
    return { value: home === 0 && away === 0 ? "BOTH" : away === 0 ? "HOME" : home === 0 ? "AWAY" : "NONE" };
  }
  if (market === "WIN_TO_NIL") {
    return { side: home > away && away === 0 ? "HOME" : away > home && home === 0 ? "AWAY" : "NONE" };
  }
  if (market === "WIN_MARGIN") return { value: Math.abs(home - away) };
  return null;
}

function sideLabel(side: string, match: DisplayMatch) {
  if (side === "HOME") return match.home;
  if (side === "AWAY") return match.away;
  if (side === "DRAW") return "Empate";
  if (side === "NONE") return "Ninguno";
  if (side === "BOTH") return "Ambos";
  return side;
}

const valueLabels: Record<string, string> = {
  YES: "Sí",
  NO: "No",
  OVER_2_5: "Más de 2.5",
  UNDER_2_5: "Menos de 2.5",
  EVEN: "Par",
  ODD: "Impar",
  FIRST_HALF: "Primer tiempo",
  SECOND_HALF: "Segundo tiempo",
  EQUAL: "Igual cantidad",
  HOME_DRAW: "Local o empate",
  HOME_AWAY: "Local o visitante",
  DRAW_AWAY: "Empate o visitante",
  NO_GOAL: "Sin gol",
  EXTRA_TIME: "Tiempo extra",
};

export function formatMarketValue(
  market: RoomMarketKey,
  value: MarketValue | null | undefined,
  match: DisplayMatch,
  official = false,
) {
  if (!value) return "Sin dato";
  if (market === "HALFTIME_SCORE") return `${text(value.home)} : ${text(value.away)}`;
  if (market === "TEAM_TOTAL_GOALS") {
    if (official) return `${match.home}: ${text(value.home)} · ${match.away}: ${text(value.away)}`;
    return `${sideLabel(text(value.side), match)}: ${text(value.total)}`;
  }

  const side = text(value.side);
  if (side) return sideLabel(side, match);
  const raw = text(value.value);
  if (!raw) return "Sin dato";
  if (market === "HALFTIME_RESULT" || market === "SECOND_HALF_RESULT" || market === "DOUBLE_CHANCE") {
    if (raw === "HOME_DRAW") return `${match.home} o empate`;
    if (raw === "HOME_AWAY") return `${match.home} o ${match.away}`;
    if (raw === "DRAW_AWAY") return `Empate o ${match.away}`;
    return sideLabel(raw, match);
  }
  return valueLabels[raw] ?? raw;
}
