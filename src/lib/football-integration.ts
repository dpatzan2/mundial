import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import type { PickSide, Prisma, PrismaClient } from "@prisma/client";
import { recalculateScoresInScope } from "@/lib/score-recalculation";

type DbClient = PrismaClient | Prisma.TransactionClient;

/** fixture.status.short de API-Football que marcan un partido como terminado. */
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

export function isFixtureFinished(status: string) {
  return FINISHED_STATUSES.has(status.trim().toUpperCase());
}

export function normalizeTeamName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function timingSafeEqualStrings(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Acepta el header `X-Webhook-Secret` o `Authorization: Bearer <secret>`. */
export function verifyIntegrationSecret(request: Request) {
  const secret = process.env.FOOTBALL_INTEGRATION_SECRET;
  if (!secret) return false;

  const headerSecret = request.headers.get("x-webhook-secret");
  if (headerSecret && timingSafeEqualStrings(headerSecret, secret)) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (timingSafeEqualStrings(token, secret)) return true;
  }

  return false;
}

export type IncomingFixture = {
  fixtureId: number;
  leagueId: number;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAtUtc: string;
};

export type ResolvedFixture = {
  fixtureId: number;
  matchId: string;
};

// Cubre desfases de zona horaria / reprogramaciones menores entre el fixture y nuestro kickoffAt.
const KICKOFF_TOLERANCE_MS = 18 * 60 * 60 * 1000;

export async function resolveFixtures(
  db: DbClient,
  fixtures: IncomingFixture[],
): Promise<ResolvedFixture[]> {
  if (fixtures.length === 0) return [];

  const leagueIds = [...new Set(fixtures.map((fixture) => fixture.leagueId))];
  const competitions = await db.competition.findMany({
    where: { apiFootballLeagueId: { in: leagueIds } },
    select: {
      apiFootballLeagueId: true,
      teams: { select: { id: true, normalizedName: true } },
      matches: {
        where: { status: { not: "FINISHED" } },
        select: { id: true, homeTeamId: true, awayTeamId: true, kickoffAt: true, externalFixtureId: true },
      },
    },
  });
  const competitionByLeague = new Map(
    competitions
      .filter((competition) => competition.apiFootballLeagueId !== null)
      .map((competition) => [competition.apiFootballLeagueId as number, competition]),
  );

  const resolved: ResolvedFixture[] = [];
  for (const fixture of fixtures) {
    const competition = competitionByLeague.get(fixture.leagueId);
    if (!competition) continue;

    const homeTeamId = competition.teams.find(
      (team) => team.normalizedName === normalizeTeamName(fixture.homeTeamName),
    )?.id;
    const awayTeamId = competition.teams.find(
      (team) => team.normalizedName === normalizeTeamName(fixture.awayTeamName),
    )?.id;
    if (!homeTeamId || !awayTeamId) continue;

    const kickoffAtUtc = new Date(fixture.kickoffAtUtc).getTime();
    const match = competition.matches.find((candidate) => {
      if (candidate.homeTeamId !== homeTeamId || candidate.awayTeamId !== awayTeamId) return false;
      if (candidate.externalFixtureId && candidate.externalFixtureId !== fixture.fixtureId) return false;
      if (!candidate.kickoffAt || Number.isNaN(kickoffAtUtc)) return true;
      return Math.abs(candidate.kickoffAt.getTime() - kickoffAtUtc) <= KICKOFF_TOLERANCE_MS;
    });
    if (!match) continue;

    resolved.push({ fixtureId: fixture.fixtureId, matchId: match.id });
  }

  return resolved;
}

export async function linkFixtures(db: DbClient, resolved: ResolvedFixture[]) {
  let linked = 0;
  for (const { fixtureId, matchId } of resolved) {
    try {
      const result = await db.competitionMatch.updateMany({
        where: { id: matchId, OR: [{ externalFixtureId: null }, { externalFixtureId: fixtureId }] },
        data: { externalFixtureId: fixtureId },
      });
      linked += result.count;
    } catch {
      // fixtureId ya asignado a otro match (colision de datos): se ignora y sigue con el resto.
    }
  }
  return linked;
}

export async function notifyRoomsForMatch(
  db: DbClient,
  matchId: string,
  homeScore: number,
  awayScore: number,
) {
  const match = await db.competitionMatch.findUnique({
    where: { id: matchId },
    select: {
      competitionId: true,
      homePlaceholder: true,
      awayPlaceholder: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (!match) return;

  const homeName = match.homeTeam?.name ?? match.homePlaceholder ?? "Local";
  const awayName = match.awayTeam?.name ?? match.awayPlaceholder ?? "Visitante";
  const title = "Resultados actualizados";
  const body = `${homeName} ${homeScore} - ${awayScore} ${awayName}`;

  const rooms = await db.room.findMany({
    where: { externalTournamentId: match.competitionId },
    select: { id: true, members: { select: { userId: true } } },
  });

  for (const room of rooms) {
    if (room.members.length === 0) continue;
    await db.notification.create({
      data: {
        roomId: room.id,
        competitionMatchId: matchId,
        title,
        body,
        recipients: { create: room.members.map((member) => ({ userId: member.userId })) },
      },
    });
  }
}

export type ApplyMatchResultOutcome =
  | { error: "MATCH_NOT_FOUND" }
  | { updated: false; alreadyFinished: true; matchId: string }
  | { updated: true; matchId: string };

/**
 * Aplica un resultado final a un CompetitionMatch por su id interno: actualiza marcador,
 * recalcula puntos de las salas afectadas y genera las notificaciones in-app.
 * Compartido por los dos webhooks de resultado (por externalFixtureId y por matchId directo).
 */
export async function applyMatchResult(
  prisma: PrismaClient,
  matchId: string,
  homeScore: number,
  awayScore: number,
): Promise<ApplyMatchResultOutcome> {
  const existing = await prisma.competitionMatch.findUnique({
    where: { id: matchId },
    select: { id: true, homeTeamId: true, awayTeamId: true, status: true, homeScore: true, awayScore: true },
  });
  if (!existing) return { error: "MATCH_NOT_FOUND" };

  const alreadyProcessed =
    existing.status === "FINISHED" && existing.homeScore === homeScore && existing.awayScore === awayScore;
  if (alreadyProcessed) return { updated: false, alreadyFinished: true, matchId: existing.id };

  const actualWinnerSide: PickSide | null =
    homeScore === awayScore ? null : homeScore > awayScore ? "HOME" : "AWAY";
  const actualWinnerTeamId =
    actualWinnerSide === "HOME"
      ? existing.homeTeamId
      : actualWinnerSide === "AWAY"
        ? existing.awayTeamId
        : null;

  await prisma.$transaction(
    async (tx) => {
      await tx.competitionMatch.update({
        where: { id: existing.id },
        data: { homeScore, awayScore, status: "FINISHED", actualWinnerSide, actualWinnerTeamId },
      });
      await recalculateScoresInScope(tx, { matchId: existing.id });
      await notifyRoomsForMatch(tx, existing.id, homeScore, awayScore);
    },
    { maxWait: 5_000, timeout: 20_000 },
  );

  revalidatePath("/admin");
  revalidatePath("/calendar");
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  revalidatePath("/rooms");

  return { updated: true, matchId: existing.id };
}

export type PendingAutomatedMatch = {
  matchId: string;
  competitionName: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAtUtc: string;
};

// Ventana hacia adelante: cubre "los partidos de hoy" sin importar a que hora del dia corra el cron.
const PENDING_MATCH_HORIZON_MS = 24 * 60 * 60 * 1000;

/**
 * Partidos de competencias con automatizacion habilitada (apiFootballLeagueId seteado, ahora
 * usado solo como bandera de opt-in, ya no para llamar a esa API) que ya arrancaron o arrancan
 * dentro de las proximas 24h y todavia no tienen resultado. Fuente para el paso de busqueda por
 * IA (n8n) en vez de resolver fixtures contra un proveedor externo.
 */
export async function getPendingAutomatedMatches(db: DbClient): Promise<PendingAutomatedMatch[]> {
  const horizon = new Date(Date.now() + PENDING_MATCH_HORIZON_MS);

  const competitions = await db.competition.findMany({
    where: { apiFootballLeagueId: { not: null } },
    select: {
      name: true,
      matches: {
        where: { status: { not: "FINISHED" }, kickoffAt: { lte: horizon } },
        select: {
          id: true,
          kickoffAt: true,
          homePlaceholder: true,
          awayPlaceholder: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  const pending: PendingAutomatedMatch[] = [];
  for (const competition of competitions) {
    for (const match of competition.matches) {
      const homeTeamName = match.homeTeam?.name ?? match.homePlaceholder;
      const awayTeamName = match.awayTeam?.name ?? match.awayPlaceholder;
      if (!match.kickoffAt || !homeTeamName || !awayTeamName) continue;
      pending.push({
        matchId: match.id,
        competitionName: competition.name,
        homeTeamName,
        awayTeamName,
        kickoffAtUtc: match.kickoffAt.toISOString(),
      });
    }
  }
  return pending;
}
