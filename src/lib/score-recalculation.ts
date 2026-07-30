import { Prisma, type PrismaClient, type RoomRuleSet, type RoomRuleVersion } from "@prisma/client";
import { roomMarketPoints, scoreEnabledMarketAnswer } from "@/lib/market-scoring";
import { marketsForStage, parseEnabledMarkets } from "@/lib/room-presets";
import { scorePrediction } from "@/lib/scoring";
import { firstLegMatchIds } from "@/lib/two-legged";
import { defaultScoringRules, getScoringRules } from "@/lib/scoring-settings";
import { scoringRulesFromRoomRuleSet } from "@/lib/rooms";

type DbClient = PrismaClient | Prisma.TransactionClient;
type Scope = { matchId?: string; roomId?: string };

function predictionWhere(scope: Scope) {
  return {
    ...(scope.roomId ? { roomId: scope.roomId } : {}),
    ...(scope.matchId
      ? { OR: [{ competitionMatchId: scope.matchId }, { matchId: scope.matchId }] }
      : {}),
  };
}

async function updatePoints(
  db: DbClient,
  table: "Prediction" | "PredictionAnswer" | "RoomTournamentPick",
  rows: Array<{ id: string; points: number }>,
) {
  if (rows.length === 0) return;

  const values = Prisma.join(
    rows.map((row) => Prisma.sql`(${row.id}::text, ${row.points}::integer)`),
  );
  await db.$executeRaw(Prisma.sql`
    UPDATE ${Prisma.raw(`"${table}"`)} AS target
    SET points = updates.points
    FROM (VALUES ${values}) AS updates(id, points)
    WHERE target.id = updates.id
      AND target.points IS DISTINCT FROM updates.points
  `);
}

export async function refreshRoomLeaderboards(db: DbClient, roomIds: string[]) {
  const uniqueRoomIds = [...new Set(roomIds)];
  if (uniqueRoomIds.length === 0) return;

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "RoomLeaderboardEntry" (
      "roomId", "userId", "totalPoints", "predictionCount", "updatedAt"
    )
    SELECT
      member."roomId",
      member."userId",
      COALESCE(scores."totalPoints", 0),
      COALESCE(scores."predictionCount", 0),
      CURRENT_TIMESTAMP
    FROM "RoomMember" member
    LEFT JOIN (
      SELECT
        entries."roomId",
        entries."userId",
        SUM(entries.points)::INTEGER AS "totalPoints",
        COUNT(*)::INTEGER AS "predictionCount"
      FROM (
        SELECT "roomId", "userId", points
        FROM "Prediction"
        WHERE "roomId" IN (${Prisma.join(uniqueRoomIds)})
        UNION ALL
        SELECT "roomId", "userId", points
        FROM "PredictionAnswer"
        WHERE "roomId" IN (${Prisma.join(uniqueRoomIds)})
        UNION ALL
        SELECT "roomId", "userId", points
        FROM "RoomTournamentPick"
        WHERE "roomId" IN (${Prisma.join(uniqueRoomIds)})
      ) entries
      GROUP BY entries."roomId", entries."userId"
    ) scores
      ON scores."roomId" = member."roomId"
      AND scores."userId" = member."userId"
    WHERE member."roomId" IN (${Prisma.join(uniqueRoomIds)})
    ON CONFLICT ("roomId", "userId") DO UPDATE SET
      "totalPoints" = EXCLUDED."totalPoints",
      "predictionCount" = EXCLUDED."predictionCount",
      "updatedAt" = CURRENT_TIMESTAMP
  `);
}

type RoomWithRules = {
  ruleSet: RoomRuleSet | null;
  ruleVersions: RoomRuleVersion[];
};

/**
 * Reglas vigentes al kickoff del partido: un cambio de reglas solo afecta a los partidos que
 * empiezan despues del guardado. Sin versiones (sala que nunca edito ajustes) usa las actuales.
 */
export function rulesAtKickoff(room: RoomWithRules | null | undefined, kickoffAt: Date | null) {
  if (!room) return null;
  const version = kickoffAt
    ? room.ruleVersions.find((candidate) => candidate.effectiveFrom <= kickoffAt)
    : undefined;
  return version ?? room.ruleSet;
}

const roomRules = {
  include: { ruleSet: true, ruleVersions: { orderBy: { effectiveFrom: "desc" } } },
} as const;

export async function recalculateScoresInScope(db: DbClient, scope: Scope = {}) {
  const [predictions, answers, championPicks] = await Promise.all([
    db.prediction.findMany({
      where: predictionWhere(scope),
      include: {
        match: true,
        competitionMatch: { include: { phase: true } },
        room: roomRules,
      },
    }),
    db.predictionAnswer.findMany({
      where: predictionWhere(scope),
      include: {
        match: true,
        competitionMatch: { include: { phase: true } },
        room: roomRules,
      },
    }),
    scope.matchId
      ? Promise.resolve([])
      : db.roomTournamentPick.findMany({
          where: scope.roomId ? { roomId: scope.roomId } : {},
          include: { room: true, competition: true },
        }),
  ]);

  const matchIds = [
    ...new Set(
      answers.flatMap((answer) =>
        answer.competitionMatchId ?? answer.matchId
          ? [answer.competitionMatchId ?? answer.matchId!]
          : [],
      ),
    ),
  ];
  const marketResults = matchIds.length
    ? await db.matchMarketResult.findMany({
        where: {
          OR: [
            { competitionMatchId: { in: matchIds } },
            { matchId: { in: matchIds } },
          ],
        },
      })
    : [];
  const resultByMatchAndMarket = new Map(
    marketResults.map((result) => [
      `${result.competitionMatchId ?? result.matchId}:${result.marketKey}`,
      result,
    ]),
  );

  const needsDefaultRules = predictions.some((prediction) => !prediction.roomId);
  const globalRules = needsDefaultRules ? await getScoringRules() : defaultScoringRules;

  // Para saber si un partido es la ida hay que ver los otros de su fase, no solo el propio.
  const phaseIds = [
    ...new Set(
      [...predictions, ...answers]
        .map((row) => row.competitionMatch?.phaseId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const phaseMatches = phaseIds.length
    ? await db.competitionMatch.findMany({
        where: { phaseId: { in: phaseIds } },
        select: {
          id: true,
          phaseId: true,
          homeTeamId: true,
          awayTeamId: true,
          kickoffAt: true,
          matchNumber: true,
          phase: { select: { stage: true } },
        },
      })
    : [];
  const firstLegs = firstLegMatchIds(
    phaseMatches.map((match) => ({ ...match, stage: match.phase?.stage ?? "GROUP" })),
  );

  const predictionUpdates = predictions.map((prediction) => {
    const kickoffAt = prediction.competitionMatch?.kickoffAt ?? prediction.match?.kickoffAt ?? null;
    const ruleSet = rulesAtKickoff(prediction.room, kickoffAt);
    const configuredMarkets = ruleSet
      ? parseEnabledMarkets(ruleSet.enabledMarkets)
      : ["EXACT_SCORE", "MATCH_OUTCOME", "ADVANCING_TEAM"] as const;
    const canonical = prediction.competitionMatch;
    const legacy = prediction.match;
    const firstLeg = canonical ? firstLegs.has(canonical.id) : false;
    const match = canonical
      ? {
          stage: canonical.phase?.stage ?? "GROUP" as const,
          homeScore: canonical.homeScore,
          awayScore: canonical.awayScore,
          status: canonical.status,
          actualWinnerSide: canonical.actualWinnerSide,
          actualWinnerTeamId: canonical.actualWinnerTeamId,
          firstLeg,
        }
      : legacy;
    if (!match) return { id: prediction.id, points: 0 };
    const enabledMarkets = new Set(marketsForStage([...configuredMarkets], match.stage, firstLeg));

    return {
      id: prediction.id,
      points: scorePrediction(
        match,
        {
          ...prediction,
          predictedWinnerTeamId:
            prediction.predictedWinnerCompetitionTeamId ?? prediction.predictedWinnerTeamId,
        },
        ruleSet ? scoringRulesFromRoomRuleSet(ruleSet) : globalRules,
        enabledMarkets,
      ),
    };
  });

  const answerUpdates = answers.map((answer) => {
    const match = answer.competitionMatch ?? answer.match;
    if (!match) return { id: answer.id, points: 0 };
    const stage = answer.competitionMatch?.phase?.stage ?? answer.match?.stage ?? "GROUP";
    const ruleSet = rulesAtKickoff(answer.room, match.kickoffAt);
    const enabledMarkets = new Set(
      marketsForStage(
        parseEnabledMarkets(ruleSet?.enabledMarkets),
        stage,
        firstLegs.has(match.id),
      ),
    );
    const resultKey = answer.competitionMatchId ?? answer.matchId;
    return {
      id: answer.id,
      points: scoreEnabledMarketAnswer({
        answer,
        match,
        result: resultByMatchAndMarket.get(`${resultKey}:${answer.marketKey}`),
        pointsByMarket: roomMarketPoints(ruleSet),
        enabledMarkets,
      }),
    };
  });

  const championUpdates = championPicks.map((pick) => ({
    id: pick.id,
    points:
      pick.competition.championTeamId &&
      pick.competition.championTeamId === pick.predictedTeamId
        ? pick.room.championPickPoints
        : 0,
  }));

  await updatePoints(db, "Prediction", predictionUpdates);
  await updatePoints(db, "PredictionAnswer", answerUpdates);
  await updatePoints(db, "RoomTournamentPick", championUpdates);

  const affectedRoomIds = [
    ...predictions.flatMap((prediction) => (prediction.roomId ? [prediction.roomId] : [])),
    ...answers.map((answer) => answer.roomId),
    ...championPicks.map((pick) => pick.roomId),
    ...(scope.roomId ? [scope.roomId] : []),
  ];
  await refreshRoomLeaderboards(db, affectedRoomIds);

  return {
    predictions: predictionUpdates.length,
    bonusAnswers: answerUpdates.length,
    championPicks: championUpdates.length,
    rooms: new Set(affectedRoomIds).size,
  };
}
