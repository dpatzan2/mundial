import { TeamLabel } from "@/components/TeamLabel";
import {
  calculateBestThirds,
  calculateStandings,
  type FormResult,
  type StandingRow,
} from "@/lib/competition-insights";

export type StandingsCompetition = {
  teams: Array<{ id: string; name: string; logoUrl: string | null; groupCode: string | null }>;
  phases: Array<{
    id: string;
    name: string;
    format: "GROUP" | "KNOCKOUT" | "LEAGUE";
    groupCode: string | null;
    automaticQualifiers: number;
    bestThirdQualifiers: number;
    matches: Array<{
      id: string; kickoffAt: Date | null; status: "SCHEDULED" | "LIVE" | "FINISHED";
      homeScore: number | null; awayScore: number | null;
      homeTeam: { id: string; name: string; logoUrl: string | null } | null;
      awayTeam: { id: string; name: string; logoUrl: string | null } | null;
    }>;
  }>;
};

export function StandingsView({ competition }: { competition: StandingsCompetition }) {
  const phases = competition.phases.filter((phase) => phase.format !== "KNOCKOUT");
  const tables = phases.map((phase) => {
    const usedIds = new Set(phase.matches.flatMap((match) => [match.homeTeam?.id, match.awayTeam?.id].filter(Boolean)));
    const phaseTeams = usedIds.size
      ? competition.teams.filter((team) => usedIds.has(team.id))
      : competition.teams.filter((team) => !phase.groupCode || team.groupCode === phase.groupCode);
    return { phase, rows: calculateStandings(phaseTeams, phase.matches, phase.automaticQualifiers) };
  });
  const groupTables = tables.filter((table) => table.phase.format === "GROUP");
  const bestThirdCount = Math.max(0, ...groupTables.map((table) => table.phase.bestThirdQualifiers));
  const bestThirds = bestThirdCount ? calculateBestThirds(groupTables.map((table) => table.rows), bestThirdCount) : [];

  if (tables.length === 0) return <section className="panel empty-state-panel"><h2>Esta competicion no usa tabla de posiciones</h2></section>;
  return (
    <div className="standings-section-list">
      {tables.map(({ phase, rows }) => <StandingsTable title={phase.name} rows={rows} key={phase.id} />)}
      {bestThirds.length ? <StandingsTable title="Mejores terceros" rows={bestThirds} bestThirds /> : null}
    </div>
  );
}

function StandingsTable({ title, rows, bestThirds = false }: { title: string; rows: StandingRow[]; bestThirds?: boolean }) {
  return (
    <section className="standings-panel panel">
      <header><h2>{title}</h2><span>{rows.length} equipos</span></header>
      <div className="standings-scroll"><table><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>GF:GC</th><th>DG</th><th>PTS</th><th>G</th><th>E</th><th>P</th><th>Forma</th></tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.team.id} className={row.qualification ? "qualified" : ""}>
            <td>{row.position}</td><td><TeamLabel name={row.team.name} logoUrl={row.team.logoUrl} compact />{row.qualification ? <small>{bestThirds ? "Mejor tercero clasificado" : "Clasificado"}</small> : null}</td>
            <td>{row.played}</td><td>{row.goalsFor}:{row.goalsAgainst}</td><td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td><strong>{row.points}</strong></td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td><FormDots values={row.form} /></td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

function FormDots({ values }: { values: FormResult[] }) {
  return <span className="recent-form-dots">{values.length ? values.map((value, index) => <span className={`form-dot ${value.toLowerCase()}`} key={`${value}-${index}`}>{value}</span>) : <span className="muted">—</span>}</span>;
}
