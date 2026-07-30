import Link from "next/link";
import { ArrowLeft, CalendarX2 } from "lucide-react";
import type { MatchStage, PopularPredictionsVisibility } from "@prisma/client";
import { PicksForm } from "@/components/PicksForm";
import { RoomHeader } from "@/components/RoomHeader";
import { requireUser } from "@/lib/auth";
import { popularOutcome, recentForm } from "@/lib/competition-insights";
import { prisma } from "@/lib/db";
import type {
  DisplayMarketAnswer,
  PeerPrediction,
  PopularPrediction,
} from "@/lib/match-ui";
import { withGuatemalaSchedule } from "@/lib/match-ui";
import {
  canViewPeerPredictionsForMatch,
  championPickDeadlineAt,
  computePhaseDeadlines,
  DEVELOPMENT_PHASE_UNLOCKS,
  isMatchLockedForPicks,
  matchDeadlineAt,
  roomDeadlineConfig,
  serializePhaseDeadlines,
} from "@/lib/phase-deadlines";
import { bonusMarketsFor, parseEnabledMarkets, type RoomMarketKey } from "@/lib/room-presets";
import { requireRoomMembership } from "@/lib/rooms";
import { firstLegMatchIds } from "@/lib/two-legged";
import { formatAppDateTime } from "@/lib/timezone";

function stageFor(phase: { stage: MatchStage | null; format: string } | null): MatchStage {
  if (phase?.stage) return phase.stage;
  return phase?.format === "KNOCKOUT" ? "ROUND_OF_16" : "GROUP";
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function popularVisible(
  visibility: PopularPredictionsVisibility,
  hasOwnPick: boolean,
  locked: boolean,
) {
  if (visibility === "ALWAYS") return true;
  if (visibility === "AFTER_PICK") return hasOwnPick;
  if (visibility === "AFTER_DEADLINE") return locked;
  return false;
}

export default async function RoomPicksPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const user = await requireUser();
  const { roomId } = await params;
  const { room, membership } = await requireRoomMembership(roomId, user.id);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  if (!room.externalTournamentId) {
    return (
      <div className="page">
        <Link className="back-link" href="/rooms"><ArrowLeft size={16} />Volver a salas</Link>
        <RoomHeader roomId={room.id} roomName={room.name} accessCode={room.accessCode} activeTab="picks" canManage={canManage} />
        <section className="panel empty-state-panel">
          <CalendarX2 size={24} />
          <h2>Esta sala no tiene una competencia asociada</h2>
          <p className="muted">El administrador de la sala debe seleccionar una competencia.</p>
        </section>
      </div>
    );
  }

  const competition = await prisma.competition.findUnique({
    where: { id: room.externalTournamentId },
    include: {
      teams: { orderBy: { name: "asc" } },
      matches: {
        include: { phase: true, homeTeam: true, awayTeam: true },
        orderBy: [{ kickoffAt: "asc" }, { matchNumber: "asc" }],
      },
    },
  });
  if (!competition) {
    return (
      <div className="page">
        <Link className="back-link" href="/rooms"><ArrowLeft size={16} />Volver a salas</Link>
        <RoomHeader roomId={room.id} roomName={room.name} accessCode={room.accessCode} activeTab="picks" canManage={canManage} />
        <section className="panel empty-state-panel"><h2>Competencia no disponible</h2></section>
      </div>
    );
  }

  const matchIds = competition.matches.map((match) => match.id);
  const memberIds = room.members.map((member) => member.userId);
  const roomMarkets = bonusMarketsFor(parseEnabledMarkets(room.ruleSet?.enabledMarkets));
  const deadlineConfig = roomDeadlineConfig(room);
  const deadlineMatches = competition.matches.map((match) => ({
    ...match,
    stage: stageFor(match.phase),
  }));

  const [predictions, allPredictions, predictionAnswers, marketResults, championPick] =
    await Promise.all([
      prisma.prediction.findMany({
        where: { roomId, userId: user.id, competitionMatchId: { in: matchIds } },
      }),
      prisma.prediction.findMany({
        where: { roomId, userId: { in: memberIds }, competitionMatchId: { in: matchIds } },
        include: {
          user: { select: { displayName: true } },
          predictedWinnerCompetitionTeam: { select: { name: true } },
        },
        orderBy: { user: { displayName: "asc" } },
      }),
      prisma.predictionAnswer.findMany({
        where: { roomId, userId: user.id, competitionMatchId: { in: matchIds }, marketKey: { in: roomMarkets } },
      }),
      prisma.matchMarketResult.findMany({
        where: { competitionMatchId: { in: matchIds } },
        select: { competitionMatchId: true, marketKey: true, value: true },
      }),
      room.championPickEnabled
        ? prisma.roomTournamentPick.findUnique({
            where: {
              roomId_userId_competitionId: { roomId, userId: user.id, competitionId: competition.id },
            },
          })
        : null,
    ]);

  const now = new Date();
  const phaseDeadlines = computePhaseDeadlines(deadlineMatches, now, deadlineConfig);
  const ownByMatch = new Map(predictions.map((prediction) => [prediction.competitionMatchId, prediction]));
  const bonusPointsByMatch = new Map<string, number>();
  for (const answer of predictionAnswers) {
    if (!answer.competitionMatchId) continue;
    bonusPointsByMatch.set(
      answer.competitionMatchId,
      (bonusPointsByMatch.get(answer.competitionMatchId) ?? 0) + answer.points,
    );
  }

  const predictionMap = Object.fromEntries(
    predictions.flatMap((prediction) =>
      prediction.competitionMatchId
        ? [[prediction.competitionMatchId, {
            predictedHomeScore: prediction.predictedHomeScore,
            predictedAwayScore: prediction.predictedAwayScore,
            predictedWinnerSide: prediction.predictedWinnerSide,
            points: prediction.points,
            bonusPoints: bonusPointsByMatch.get(prediction.competitionMatchId) ?? 0,
          }]]
        : [],
    ),
  );

  const peersByMatch: Record<string, PeerPrediction[]> = {};
  for (const prediction of allPredictions) {
    if (!prediction.competitionMatchId || prediction.userId === user.id) continue;
    const match = deadlineMatches.find((item) => item.id === prediction.competitionMatchId);
    if (!match || !canViewPeerPredictionsForMatch(match, phaseDeadlines, now, deadlineConfig)) continue;
    (peersByMatch[prediction.competitionMatchId] ??= []).push({
      userId: prediction.userId,
      displayName: prediction.user.displayName,
      predictedHomeScore: prediction.predictedHomeScore,
      predictedAwayScore: prediction.predictedAwayScore,
      predictedWinnerSide: prediction.predictedWinnerSide,
      pickedTeamName: prediction.predictedWinnerCompetitionTeam?.name ?? null,
      points: prediction.points,
    });
  }

  const marketAnswers: Record<string, Partial<Record<RoomMarketKey, DisplayMarketAnswer>>> = {};
  for (const answer of predictionAnswers) {
    if (!answer.competitionMatchId) continue;
    (marketAnswers[answer.competitionMatchId] ??= {})[answer.marketKey as RoomMarketKey] = {
      value: answer.value && typeof answer.value === "object" && !Array.isArray(answer.value)
        ? answer.value as Record<string, unknown>
        : {},
      points: answer.points,
    };
  }

  const officialMarketResults: Record<string, Partial<Record<RoomMarketKey, Record<string, unknown>>>> = {};
  for (const result of marketResults) {
    if (!result.competitionMatchId) continue;
    (officialMarketResults[result.competitionMatchId] ??= {})[result.marketKey as RoomMarketKey] =
      result.value && typeof result.value === "object" && !Array.isArray(result.value)
        ? result.value as Record<string, unknown>
        : {};
  }

  const popularPredictions: Record<string, PopularPrediction> = {};
  for (const match of deadlineMatches) {
    const picks = allPredictions.filter((prediction) => prediction.competitionMatchId === match.id);
    const outcomes = picks.map((pick) => popularOutcome(pick.predictedHomeScore, pick.predictedAwayScore));
    const total = outcomes.filter(Boolean).length;
    const locked = isMatchLockedForPicks(match, phaseDeadlines, now, deadlineConfig);
    const own = ownByMatch.get(match.id);
    popularPredictions[match.id] = {
      visible: popularVisible(room.popularPredictionsVisibility, Boolean(own), locked),
      total,
      homePercent: percent(outcomes.filter((value) => value === "HOME").length, total),
      drawPercent: percent(outcomes.filter((value) => value === "DRAW").length, total),
      awayPercent: percent(outcomes.filter((value) => value === "AWAY").length, total),
      advanceHomePercent: percent(picks.filter((pick) => pick.predictedWinnerSide === "HOME").length, picks.length),
      advanceAwayPercent: percent(picks.filter((pick) => pick.predictedWinnerSide === "AWAY").length, picks.length),
    };
  }

  const firstLegs = firstLegMatchIds(deadlineMatches);
  const displayMatches = competition.matches.map((match, index) => {
    const stage = stageFor(match.phase);
    const deadlineMatch = { ...match, stage };
    const pickDeadline = matchDeadlineAt(deadlineMatch, deadlineConfig);
    return withGuatemalaSchedule({
      id: match.id,
      matchNumber: match.matchNumber ?? index + 1,
      stage,
      groupCode: stage === "GROUP" ? match.phase?.groupCode ?? match.phase?.name ?? "General" : null,
      dateLabel: null,
      timeLabel: null,
      kickoffAt: match.kickoffAt,
      venue: match.venue,
      venueShort: null,
      locked: isMatchLockedForPicks(deadlineMatch, phaseDeadlines, now, deadlineConfig),
      peerPicksVisible: canViewPeerPredictionsForMatch(deadlineMatch, phaseDeadlines, now, deadlineConfig),
      home: match.homeTeam?.name ?? match.homePlaceholder ?? "Local",
      away: match.awayTeam?.name ?? match.awayPlaceholder ?? "Visitante",
      homeLogoUrl: match.homeTeam?.logoUrl ?? null,
      awayLogoUrl: match.awayTeam?.logoUrl ?? null,
      homeForm: match.homeTeamId ? recentForm(competition.matches, match.homeTeamId) : [],
      awayForm: match.awayTeamId ? recentForm(competition.matches, match.awayTeamId) : [],
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      actualWinnerSide: match.actualWinnerSide,
      status: match.status,
      firstLeg: firstLegs.has(match.id),
      pickDeadlineLabel: pickDeadline ? formatAppDateTime(pickDeadline) : null,
    });
  });

  const championDeadline = championPickDeadlineAt(
    competition.matches,
    room.deadlineHoursBefore,
    room.championPickDeadline,
  );

  return (
    <div className="page room-picks-page">
      <Link className="back-link" href="/rooms"><ArrowLeft size={16} />Volver a salas</Link>
      <RoomHeader roomId={room.id} roomName={room.name} accessCode={room.accessCode} activeTab="picks" canManage={canManage} />
      <PicksForm
        roomId={room.id}
        competitionName={competition.name}
        matches={displayMatches}
        predictions={predictionMap}
        peersByMatch={peersByMatch}
        popularPredictions={popularPredictions}
        phaseDeadlines={serializePhaseDeadlines(phaseDeadlines)}
        roomMarkets={roomMarkets}
        marketAnswers={marketAnswers}
        officialMarketResults={officialMarketResults}
        deadlineMode={deadlineConfig.mode}
        deadlineHoursBefore={deadlineConfig.hoursBefore}
        championPick={{
          enabled: room.championPickEnabled,
          locked: !DEVELOPMENT_PHASE_UNLOCKS && Boolean(championDeadline && now >= championDeadline),
          deadlineLabel: championDeadline ? formatAppDateTime(championDeadline) : null,
          selectedTeamId: championPick?.predictedTeamId ?? null,
          points: room.championPickPoints,
          teams: competition.teams.map((team) => ({ id: team.id, name: team.name })),
        }}
      />
    </div>
  );
}
