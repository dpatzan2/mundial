export type PerformanceRow = {
  key: string;
  label: string;
  attempts: number;
  hits: number;
  points: number;
  /** Porcentaje entero de aciertos sobre intentos. */
  accuracy: number;
};

type ScoreEntry = {
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  homeScore: number | null;
  awayScore: number | null;
  points: number;
};

type BonusEntry = {
  key: string;
  label: string;
  attempts: number;
  hits: number;
  points: number;
};

/** Con menos intentos que esto un 100% no dice nada, asi que no compite por mejor/peor. */
const MIN_ATTEMPTS_FOR_HIGHLIGHT = 3;

const sign = (home: number, away: number) => (home === away ? 0 : home > away ? 1 : -1);

function buildRow(key: string, label: string, attempts: number, hits: number, points: number) {
  return {
    key,
    label,
    attempts,
    hits,
    points,
    accuracy: attempts > 0 ? Math.round((hits / attempts) * 100) : 0,
  };
}

/**
 * Rendimiento por tipo de pronostico del usuario en una sala. El marcador se parte en dos filas
 * excluyentes en puntos (exacto gana sobre resultado, igual que scorePrediction), asi los puntos
 * de las filas suman el total real.
 */
export function personalPerformance(scores: ScoreEntry[], bonus: BonusEntry[]) {
  const played = scores.filter(
    (entry) =>
      entry.homeScore !== null &&
      entry.awayScore !== null &&
      entry.predictedHomeScore !== null &&
      entry.predictedAwayScore !== null,
  );
  const exact = played.filter(
    (entry) =>
      entry.homeScore === entry.predictedHomeScore && entry.awayScore === entry.predictedAwayScore,
  );
  const outcome = played.filter(
    (entry) =>
      sign(entry.homeScore!, entry.awayScore!) ===
      sign(entry.predictedHomeScore!, entry.predictedAwayScore!),
  );
  const sumPoints = (entries: ScoreEntry[]) =>
    entries.reduce((total, entry) => total + entry.points, 0);

  const rows = [
    buildRow("EXACT_SCORE", "Marcador exacto", played.length, exact.length, sumPoints(exact)),
    buildRow(
      "MATCH_OUTCOME",
      "Resultado (ganador o empate)",
      played.length,
      outcome.length,
      sumPoints(outcome) - sumPoints(exact),
    ),
    ...bonus.map((entry) =>
      buildRow(entry.key, entry.label, entry.attempts, entry.hits, entry.points),
    ),
  ]
    .filter((row) => row.attempts > 0)
    .sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);

  // Solo el top 3 de cada lado: la lista completa son 30 filas que nadie lee.
  const ranked = rows.filter((row) => row.attempts >= MIN_ATTEMPTS_FOR_HIGHLIGHT);
  const best = ranked.slice(0, 3);
  const worst = ranked.slice(3).slice(-3).reverse();

  return { best, worst };
}
