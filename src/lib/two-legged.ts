export type LegMatch = {
  id: string;
  stage: string;
  phaseId?: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoffAt?: Date | null;
  matchNumber?: number | null;
};

const kickoffTime = (match: LegMatch) => match.kickoffAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

/**
 * Ids de los partidos de ida. En una llave a doble partido el mismo par de equipos aparece dos
 * veces dentro de la fase de eliminacion: el de ida no define quien pasa, no hay tiempos extra
 * ni penales; eso solo pasa en el de vuelta.
 * ponytail: se deduce del fixture porque el schema no marca ida/vuelta; si algun dia se importa
 * ese dato, cambiar esta funcion por el campo.
 */
export function firstLegMatchIds(matches: LegMatch[]): Set<string> {
  const ties = new Map<string, LegMatch[]>();

  for (const match of matches) {
    // Las ligas y los grupos tambien repiten pares (ida y vuelta del rol), pero ahi nadie "pasa".
    if (match.stage === "GROUP") continue;
    if (!match.homeTeamId || !match.awayTeamId) continue;
    // La llave se identifica por ronda, no por fase: hay fixtures que meten ida y vuelta en
    // fases separadas. Los ids de equipo son por competencia, asi que no chocan entre torneos.
    const pair = [match.homeTeamId, match.awayTeamId].sort().join("|");
    const key = `${match.stage}:${pair}`;
    const tie = ties.get(key);
    if (tie) tie.push(match);
    else ties.set(key, [match]);
  }

  const firstLegs = new Set<string>();
  for (const tie of ties.values()) {
    if (tie.length < 2) continue;
    const ordered = [...tie].sort(
      (a, b) => kickoffTime(a) - kickoffTime(b) || (a.matchNumber ?? 0) - (b.matchNumber ?? 0),
    );
    for (const match of ordered.slice(0, -1)) firstLegs.add(match.id);
  }

  return firstLegs;
}
