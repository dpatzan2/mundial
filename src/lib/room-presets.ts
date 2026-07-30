import type { RoomConfigPreset, TournamentType } from "@prisma/client";

export const tournamentTypeLabels: Record<TournamentType, string> = {
  WORLD_CUP: "Mundial",
  INTERNATIONAL_CUP: "Copa internacional",
  CLUB_TOURNAMENT: "Torneo de clubes",
  DOMESTIC_LEAGUE: "Liga local",
  CUSTOM: "Personalizado",
};

export const roomPresetLabels: Record<RoomConfigPreset, string> = {
  BASIC: "Basica",
  INTERMEDIATE: "Intermedia",
  COMPLETE: "Completa",
  CUSTOM: "Custom",
};

export type RoomMarketKey =
  | "EXACT_SCORE"
  | "MATCH_OUTCOME"
  | "ADVANCING_TEAM"
  | "HALFTIME_SCORE"
  | "HALFTIME_RESULT"
  | "SECOND_HALF_RESULT"
  | "TOTAL_GOALS"
  | "EXACT_TOTAL_GOALS"
  | "OVER_UNDER_2_5"
  | "ODD_EVEN_TOTAL_GOALS"
  | "BOTH_TEAMS_SCORE"
  | "FIRST_GOAL_TEAM"
  | "LAST_GOAL_TEAM"
  | "FIRST_GOAL_MINUTE_RANGE"
  | "HIGHEST_SCORING_HALF"
  | "GOAL_IN_BOTH_HALVES"
  | "DOUBLE_CHANCE"
  | "PENALTY_IN_MATCH"
  | "PENALTY_SCORED"
  | "PENALTY_AWARDED_TEAM"
  | "RED_CARD_IN_MATCH"
  | "RED_CARD_TEAM"
  | "EXTRA_TIME"
  | "PENALTY_SHOOTOUT"
  | "TEAM_TOTAL_GOALS"
  | "CLEAN_SHEET"
  | "WIN_TO_NIL"
  | "WIN_MARGIN"
  | "COMEBACK_WIN"
  | "YELLOW_CARD_RANGE"
  | "TOTAL_CORNERS_RANGE"
  | "TEAM_MOST_CORNERS"
  | "TEAM_MOST_CARDS";

export type RoomMarketDefinition = {
  key: RoomMarketKey;
  label: string;
  description: string;
  defaultPoints: number;
  group: "base" | "goals" | "discipline" | "knockout" | "advanced";
};

export const roomMarketCatalog: RoomMarketDefinition[] = [
  {
    key: "EXACT_SCORE",
    label: "Marcador exacto",
    description: "Acierta goles local y visitante.",
    defaultPoints: 3,
    group: "base",
  },
  {
    key: "MATCH_OUTCOME",
    label: "Resultado",
    description: "Acierta ganador o empate aunque el marcador cambie.",
    defaultPoints: 1,
    group: "base",
  },
  {
    key: "ADVANCING_TEAM",
    label: "Quien pasa",
    description: "Equipo que avanza en fases eliminatorias.",
    defaultPoints: 1,
    group: "knockout",
  },
  {
    key: "HALFTIME_SCORE",
    label: "Marcador al descanso",
    description: "Resultado exacto al medio tiempo.",
    defaultPoints: 2,
    group: "goals",
  },
  {
    key: "HALFTIME_RESULT",
    label: "Resultado al descanso",
    description: "Ganador o empate al medio tiempo.",
    defaultPoints: 1,
    group: "goals",
  },
  {
    key: "SECOND_HALF_RESULT",
    label: "Resultado 2do tiempo",
    description: "Ganador o empate considerando solo el segundo tiempo.",
    defaultPoints: 2,
    group: "advanced",
  },
  {
    key: "TOTAL_GOALS",
    label: "Total de goles",
    description: "Rango de goles del partido.",
    defaultPoints: 1,
    group: "goals",
  },
  {
    key: "EXACT_TOTAL_GOALS",
    label: "Total exacto de goles",
    description: "Cantidad exacta de goles entre ambos equipos.",
    defaultPoints: 2,
    group: "goals",
  },
  {
    key: "OVER_UNDER_2_5",
    label: "Mas/Menos 2.5 goles",
    description: "Si el partido supera o no la linea de 2.5 goles.",
    defaultPoints: 1,
    group: "goals",
  },
  {
    key: "ODD_EVEN_TOTAL_GOALS",
    label: "Goles par/impar",
    description: "Si el total de goles termina par o impar.",
    defaultPoints: 1,
    group: "goals",
  },
  {
    key: "BOTH_TEAMS_SCORE",
    label: "Ambos anotan",
    description: "Si ambos equipos marcan al menos un gol.",
    defaultPoints: 1,
    group: "goals",
  },
  {
    key: "FIRST_GOAL_TEAM",
    label: "Primer gol",
    description: "Equipo que marca primero.",
    defaultPoints: 1,
    group: "goals",
  },
  {
    key: "LAST_GOAL_TEAM",
    label: "Ultimo gol",
    description: "Equipo que marca el ultimo gol del partido.",
    defaultPoints: 2,
    group: "goals",
  },
  {
    key: "FIRST_GOAL_MINUTE_RANGE",
    label: "Minuto del primer gol",
    description: "Rango de minutos en que cae el primer gol.",
    defaultPoints: 2,
    group: "goals",
  },
  {
    key: "HIGHEST_SCORING_HALF",
    label: "Tiempo con mas goles",
    description: "Primer tiempo, segundo tiempo o empate en goles.",
    defaultPoints: 1,
    group: "advanced",
  },
  {
    key: "GOAL_IN_BOTH_HALVES",
    label: "Gol en ambos tiempos",
    description: "Si hay al menos un gol en cada tiempo.",
    defaultPoints: 1,
    group: "advanced",
  },
  {
    key: "DOUBLE_CHANCE",
    label: "Doble oportunidad",
    description: "Local o empate, local o visitante, empate o visitante.",
    defaultPoints: 1,
    group: "advanced",
  },
  {
    key: "PENALTY_IN_MATCH",
    label: "Habra penal",
    description: "Si se pita al menos un penal en el partido.",
    defaultPoints: 1,
    group: "discipline",
  },
  {
    key: "PENALTY_SCORED",
    label: "Penal convertido",
    description: "Si se convierte al menos un penal.",
    defaultPoints: 1,
    group: "discipline",
  },
  {
    key: "PENALTY_AWARDED_TEAM",
    label: "Penal a favor",
    description: "Equipo al que le pitan al menos un penal.",
    defaultPoints: 2,
    group: "discipline",
  },
  {
    key: "RED_CARD_IN_MATCH",
    label: "Habra roja",
    description: "Si hay al menos una tarjeta roja.",
    defaultPoints: 1,
    group: "discipline",
  },
  {
    key: "RED_CARD_TEAM",
    label: "Roja para equipo",
    description: "Equipo que recibe al menos una tarjeta roja.",
    defaultPoints: 2,
    group: "discipline",
  },
  {
    key: "EXTRA_TIME",
    label: "Tiempo extra",
    description: "Si una eliminatoria llega a tiempos extra.",
    defaultPoints: 1,
    group: "knockout",
  },
  {
    key: "PENALTY_SHOOTOUT",
    label: "Tanda de penales",
    description: "Si el partido se define por penales.",
    defaultPoints: 2,
    group: "knockout",
  },
  {
    key: "TEAM_TOTAL_GOALS",
    label: "Goles por equipo",
    description: "Total de goles de un equipo especifico.",
    defaultPoints: 1,
    group: "advanced",
  },
  {
    key: "CLEAN_SHEET",
    label: "Porteria a cero",
    description: "Equipo que termina sin recibir gol.",
    defaultPoints: 1,
    group: "advanced",
  },
  {
    key: "WIN_TO_NIL",
    label: "Gana sin recibir gol",
    description: "Equipo que gana dejando su porteria en cero.",
    defaultPoints: 2,
    group: "advanced",
  },
  {
    key: "WIN_MARGIN",
    label: "Diferencia de goles",
    description: "Margen exacto de victoria.",
    defaultPoints: 1,
    group: "advanced",
  },
  {
    key: "COMEBACK_WIN",
    label: "Remontada",
    description: "Si un equipo gana despues de ir perdiendo.",
    defaultPoints: 2,
    group: "advanced",
  },
  {
    key: "YELLOW_CARD_RANGE",
    label: "Rango de amarillas",
    description: "Rango total de tarjetas amarillas.",
    defaultPoints: 1,
    group: "discipline",
  },
  {
    key: "TOTAL_CORNERS_RANGE",
    label: "Rango de corners",
    description: "Rango total de tiros de esquina.",
    defaultPoints: 1,
    group: "advanced",
  },
  {
    key: "TEAM_MOST_CORNERS",
    label: "Mas corners",
    description: "Equipo que saca mas tiros de esquina.",
    defaultPoints: 1,
    group: "advanced",
  },
  {
    key: "TEAM_MOST_CARDS",
    label: "Mas tarjetas",
    description: "Equipo que recibe mas tarjetas.",
    defaultPoints: 1,
    group: "discipline",
  },
];

export function marketsForPreset(preset: RoomConfigPreset): RoomMarketKey[] {
  const basic: RoomMarketKey[] = ["EXACT_SCORE", "MATCH_OUTCOME", "ADVANCING_TEAM"];
  const intermediate: RoomMarketKey[] = [
    ...basic,
    "HALFTIME_SCORE",
    "HALFTIME_RESULT",
    "TOTAL_GOALS",
    "OVER_UNDER_2_5",
    "BOTH_TEAMS_SCORE",
    "FIRST_GOAL_TEAM",
    "FIRST_GOAL_MINUTE_RANGE",
  ];
  const complete: RoomMarketKey[] = [
    ...intermediate,
    "PENALTY_IN_MATCH",
    "PENALTY_SCORED",
    "RED_CARD_IN_MATCH",
    "EXTRA_TIME",
    "PENALTY_SHOOTOUT",
    "EXACT_TOTAL_GOALS",
    "ODD_EVEN_TOTAL_GOALS",
    "LAST_GOAL_TEAM",
    "HIGHEST_SCORING_HALF",
    "DOUBLE_CHANCE",
  ];

  if (preset === "BASIC") return basic;
  if (preset === "INTERMEDIATE") return intermediate;
  if (preset === "COMPLETE") return complete;
  return roomMarketCatalog.map((market) => market.key);
}

export function roomMarketLabel(key: RoomMarketKey) {
  return roomMarketCatalog.find((market) => market.key === key)?.label ?? key;
}

export function parseEnabledMarkets(value: unknown): RoomMarketKey[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(roomMarketCatalog.map((market) => market.key));
  return value.map(String).filter((key): key is RoomMarketKey => known.has(key as RoomMarketKey));
}

export function bonusMarketsFor(enabledMarkets: RoomMarketKey[]) {
  return enabledMarkets.filter(
    (market) =>
      market !== "EXACT_SCORE" &&
      market !== "MATCH_OUTCOME" &&
      market !== "ADVANCING_TEAM",
  );
}

const knockoutOnlyMarkets = new Set<RoomMarketKey>([
  "ADVANCING_TEAM",
  "EXTRA_TIME",
  "PENALTY_SHOOTOUT",
]);

export function marketsForStage(
  markets: RoomMarketKey[],
  stage: string,
  firstLeg = false,
) {
  // En la ida de una llave nadie pasa y no hay tiempos extra ni penales: se juega como un partido normal.
  return stage === "GROUP" || firstLeg
    ? markets.filter((market) => !knockoutOnlyMarkets.has(market))
    : markets;
}

export function bonusMarketsForStage(
  enabledMarkets: RoomMarketKey[],
  stage: string,
  firstLeg = false,
) {
  return bonusMarketsFor(marketsForStage(enabledMarkets, stage, firstLeg));
}

export function roomPresetDescription(preset: RoomConfigPreset) {
  if (preset === "BASIC") {
    return "Marcador, resultado y quien pasa en eliminatorias.";
  }
  if (preset === "INTERMEDIATE") {
    return "Basica mas bonus como medio tiempo, total de goles y primer gol.";
  }
  if (preset === "COMPLETE") {
    return "Intermedia mas penales, rojas, tiempos extra y definicion.";
  }
  return "Configurable mercado por mercado.";
}
