import Link from "next/link";
import { CalendarDays, Layers3, Trophy, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tournamentTypeLabels } from "@/lib/room-presets";
import { formatAppDateTime } from "@/lib/timezone";
import { TeamLabel } from "@/components/TeamLabel";

export default async function DashboardPage() {
  const user = await requireUser();
  const [
    roomsCount,
    myRooms,
    competitions,
    activeCompetitions,
    membersCount,
    upcomingMatches,
  ] = await Promise.all([
    prisma.room.count({ where: { status: "ACTIVE" } }),
    prisma.roomMember.findMany({
      where: { userId: user.id, room: { status: "ACTIVE" } },
      include: { room: { include: { members: true } } },
      orderBy: { joinedAt: "desc" },
      take: 4,
    }),
    prisma.competition.findMany({
      include: {
        _count: {
          select: { phases: true, teams: true, matches: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.competition.count({ where: { status: "ACTIVE" } }),
    prisma.roomMember.count(),
    prisma.competitionMatch.findMany({
      where: {
        kickoffAt: { gte: new Date() },
      },
      include: {
        competition: true,
        phase: true,
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { kickoffAt: "asc" },
      take: 6,
    }),
  ]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Panel general</span>
          <h1>Centro de quinielas</h1>
        </div>
      </header>

      <section className="metric-grid">
        <Metric icon={<Users size={20} />} label="Salas activas" value={roomsCount} />
        <Metric icon={<Trophy size={20} />} label="Competiciones" value={competitions.length} />
        <Metric icon={<Layers3 size={20} />} label="Competiciones activas" value={activeCompetitions} />
        <Metric icon={<CalendarDays size={20} />} label="Miembros en salas" value={membersCount} />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-head">
            <h2>Mis salas</h2>
            <Link className="table-link" href="/rooms">
              Ver todas
            </Link>
          </div>
          <div className="dashboard-list">
            {myRooms.length === 0 ? (
              <p className="muted empty-inline">Todavia no perteneces a ninguna sala.</p>
            ) : (
              myRooms.map(({ room, role }) => (
                <Link className="dashboard-list-row" href={`/rooms/${room.id}`} key={room.id}>
                  <div>
                    <strong>{room.name}</strong>
                    <span>{room.tournamentName}</span>
                  </div>
                  <small>
                    {role} · {room.members.length} miembros
                  </small>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Próximos partidos</h2>
            <Link className="table-link" href="/calendar">
              Calendario
            </Link>
          </div>
          <div className="dashboard-list">
            {upcomingMatches.length === 0 ? (
              <p className="muted empty-inline">No hay partidos próximos registrados.</p>
            ) : (
              upcomingMatches.map((match) => (
                <div className="dashboard-list-row" key={match.id}>
                  <div>
                    <strong className="dashboard-match-teams">
                      <TeamLabel
                        name={match.homeTeam?.name ?? match.homePlaceholder ?? "Local"}
                        logoUrl={match.homeTeam?.logoUrl}
                        compact
                      />
                      <span className="muted">vs</span>
                      <TeamLabel
                        name={match.awayTeam?.name ?? match.awayPlaceholder ?? "Visitante"}
                        logoUrl={match.awayTeam?.logoUrl}
                        compact
                      />
                    </strong>
                    <span>
                      {match.competition.name}
                      {match.phase ? ` · ${match.phase.name}` : ""}
                    </span>
                  </div>
                  <small>{match.kickoffAt ? formatAppDateTime(match.kickoffAt) : "Sin fecha"}</small>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Competiciones recientes</h2>
          <span>{competitions.length} visibles</span>
        </div>
        <div className="competition-summary-grid">
          {competitions.length === 0 ? (
            <p className="muted empty-inline">Registra competiciones desde Admin para poblar el calendario.</p>
          ) : (
            competitions.map((competition) => (
              <Link
                className="competition-summary-card"
                href={`/calendar?competition=${competition.id}`}
                key={competition.id}
              >
                <span>{tournamentTypeLabels[competition.type]}</span>
                <strong>{competition.name}</strong>
                <small>
                  {competition._count.phases} fases · {competition._count.teams} equipos ·{" "}
                  {competition._count.matches} partidos
                </small>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
