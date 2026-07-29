import Link from "next/link";
import { BarChart3, CalendarDays, Trophy } from "lucide-react";
import { BracketView } from "@/components/BracketView";
import { CalendarSyncButtons } from "@/components/CalendarSyncButtons";
import { FixtureCalendar } from "@/components/FixtureCalendar";
import { StandingsView } from "@/components/StandingsView";
import { requireUser } from "@/lib/auth";
import { buildBracket } from "@/lib/bracket";
import { prisma } from "@/lib/db";
import { tournamentTypeLabels } from "@/lib/room-presets";

const statusLabels = { DRAFT: "Borrador", ACTIVE: "Activa", ARCHIVED: "Archivada" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; view?: string }>;
}) {
  await requireUser();
  const query = await searchParams;
  const competitions = await prisma.competition.findMany({
    where: { status: "ACTIVE" },
    include: {
      teams: { orderBy: { name: "asc" } },
      phases: {
        include: {
          matches: {
            include: { homeTeam: true, awayTeam: true },
            orderBy: [{ kickoffAt: "asc" }, { matchNumber: "asc" }],
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      matches: {
        include: { phase: true, homeTeam: true, awayTeam: true },
        orderBy: [{ kickoffAt: "asc" }, { matchNumber: "asc" }],
      },
    },
    orderBy: [{ startsAt: "desc" }, { name: "asc" }],
  });
  const selected = competitions.find((competition) => competition.id === query.competition) ?? competitions[0] ?? null;
  const bracket = selected ? buildBracket(selected.phases) : null;
  const view =
    query.view === "standings" || (query.view === "bracket" && bracket) ? query.view : "fixture";

  if (!selected) {
    return (
      <div className="page">
        <header className="page-header"><div><span className="eyebrow">Competiciones</span><h1>Calendario</h1></div></header>
        <section className="panel empty-state-panel">
          <CalendarDays size={24} /><h2>No hay competiciones activas</h2>
          <p className="muted">Los torneos publicados por el administrador apareceran aqui.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page competition-page">
      <header className="competition-hero">
        <div className="competition-identity">
          {selected.logoUrl ? <img src={selected.logoUrl} alt="" /> : <span className="competition-logo-placeholder"><CalendarDays size={24} /></span>}
          <div>
            <span className="eyebrow">{tournamentTypeLabels[selected.type]}</span>
            <h1>{selected.name}</h1>
            <p>{selected.season ?? "Temporada actual"} · {statusLabels[selected.status]}</p>
          </div>
        </div>
        <CalendarSyncButtons competitionId={selected.id} competitionName={selected.name} />
      </header>

      <nav className="competition-switcher" aria-label="Seleccionar competicion">
        {competitions.map((competition) => (
          <Link
            className={competition.id === selected.id ? "active" : ""}
            href={`/calendar?competition=${competition.id}&view=${view}`}
            key={competition.id}
          >
            {competition.logoUrl ? <img src={competition.logoUrl} alt="" /> : null}
            <span>{competition.name}</span>
            <small>{competition.season ?? "Actual"}</small>
          </Link>
        ))}
      </nav>

      <nav className="competition-view-tabs">
        <Link className={view === "fixture" ? "active" : ""} href={`/calendar?competition=${selected.id}&view=fixture`}>
          <CalendarDays size={17} />Calendario
        </Link>
        <Link className={view === "standings" ? "active" : ""} href={`/calendar?competition=${selected.id}&view=standings`}>
          <BarChart3 size={17} />Posiciones
        </Link>
        {bracket ? (
          <Link className={view === "bracket" ? "active" : ""} href={`/calendar?competition=${selected.id}&view=bracket`}>
            <Trophy size={17} />Eliminatoria
          </Link>
        ) : null}
      </nav>

      {view === "fixture" ? <FixtureCalendar matches={selected.matches} /> : null}
      {view === "standings" ? <StandingsView competition={selected} /> : null}
      {view === "bracket" && bracket ? <BracketView bracket={bracket} /> : null}
    </div>
  );
}
