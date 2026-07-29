import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireRoomMembership } from "@/lib/rooms";
import { RoomHeader } from "@/components/RoomHeader";
import { personalPerformance, type PerformanceRow } from "@/lib/personal-performance";
import { roomMarketLabel, type RoomMarketKey } from "@/lib/room-presets";

function PerformanceGroup({
  tone,
  title,
  rows,
}: {
  tone: "good" | "bad";
  title: string;
  rows: PerformanceRow[];
}) {
  return (
    <div className={`performance-group ${tone}`}>
      <span className="eyebrow">{title}</span>
      <ul className="performance-list">
        {rows.map((row) => (
          <li className="performance-row" key={row.key}>
            <span className="performance-label">{row.label}</span>
            <span className="performance-detail">
              {row.hits}/{row.attempts} · {row.points} pts
            </span>
            <b className="performance-accuracy">{row.accuracy}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function RoomLeaderboardPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const user = await requireUser();
  const { roomId } = await params;
  const { room, membership } = await requireRoomMembership(roomId, user.id);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  // Solo partidos terminados: los pendientes valen 0 y contarian como fallo.
  const myFinished = { roomId, userId: user.id, competitionMatch: { status: "FINISHED" as const } };
  const [entries, hitGroups, myScores, bonusAttempts, bonusHits] = await Promise.all([
    prisma.roomLeaderboardEntry.findMany({
      where: { roomId },
      include: { user: { select: { displayName: true } } },
      orderBy: [{ totalPoints: "desc" }, { predictionCount: "desc" }, { userId: "asc" }],
    }),
    // Aciertos = pronosticos que sumaron puntos (mas relevante que el total de pronosticos).
    prisma.prediction.groupBy({
      by: ["userId"],
      where: { roomId, points: { gt: 0 } },
      _count: { _all: true },
    }),
    prisma.prediction.findMany({
      where: myFinished,
      select: {
        predictedHomeScore: true,
        predictedAwayScore: true,
        points: true,
        competitionMatch: { select: { homeScore: true, awayScore: true } },
      },
    }),
    prisma.predictionAnswer.groupBy({
      by: ["marketKey"],
      where: myFinished,
      _count: { _all: true },
      _sum: { points: true },
    }),
    prisma.predictionAnswer.groupBy({
      by: ["marketKey"],
      where: { ...myFinished, points: { gt: 0 } },
      _count: { _all: true },
    }),
  ]);

  const bonusHitsByMarket = new Map(bonusHits.map((group) => [group.marketKey, group._count._all]));
  const performance = personalPerformance(
    myScores.map((prediction) => ({
      predictedHomeScore: prediction.predictedHomeScore,
      predictedAwayScore: prediction.predictedAwayScore,
      homeScore: prediction.competitionMatch?.homeScore ?? null,
      awayScore: prediction.competitionMatch?.awayScore ?? null,
      points: prediction.points,
    })),
    bonusAttempts.map((group) => ({
      key: group.marketKey,
      label: roomMarketLabel(group.marketKey as RoomMarketKey),
      attempts: group._count._all,
      hits: bonusHitsByMarket.get(group.marketKey) ?? 0,
      points: group._sum.points ?? 0,
    })),
  );

  const hitsByUserId = new Map(hitGroups.map((group) => [group.userId, group._count._all]));
  const leaderPoints = entries[0]?.totalPoints ?? 0;
  const rows = entries.map((entry) => ({
    id: entry.userId,
    name: entry.user.displayName,
    hits: hitsByUserId.get(entry.userId) ?? 0,
    points: entry.totalPoints,
    gap: leaderPoints - entry.totalPoints,
  }));

  const podiumRows = rows.slice(0, 3);
  const restRows = rows.slice(3);

  return (
    <div className="page">
      <Link className="back-link" href="/rooms">
        <ArrowLeft size={16} />
        Volver a salas
      </Link>
      <RoomHeader
        roomId={room.id}
        roomName={room.name}
        accessCode={room.accessCode}
        activeTab="leaderboard"
        canManage={canManage}
      />

      {rows.length === 0 ? (
        <section className="panel empty-state-panel">
          <h2>Todavia no hay pronosticos puntuados</h2>
          <p>La tabla aparecera aqui en cuanto haya resultados.</p>
        </section>
      ) : (
        <>
          <div className="podium">
            {podiumRows.map((row, index) => {
              const place = index + 1;
              const isYou = row.id === user.id;
              return (
                <div key={row.id} className={`podium-place podium-place-${place}`}>
                  <div className={`podium-card${isYou ? " is-you" : ""}`}>
                    {place === 1 && <Trophy className="podium-trophy" size={20} />}
                    <strong className="podium-name">
                      {row.name}
                      {isYou ? <em className="rank-you-tag">tú</em> : null}
                    </strong>
                    <span className="podium-meta">
                      {place === 1 ? "Líder de la sala" : `${row.gap} pts del líder`}
                    </span>
                    <span className="podium-meta">{row.hits} aciertos</span>
                    <span className="podium-points">{row.points} pts</span>
                  </div>
                  <div className="podium-block">
                    <span className="podium-rank">{place}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {restRows.length > 0 && (
            <ol className="rank-list panel">
              {restRows.map((row, index) => {
                const isYou = row.id === user.id;
                return (
                  <li key={row.id} className={`rank-row${isYou ? " is-you" : ""}`}>
                    <span className="rank-pos">{index + 4}</span>
                    <span className="rank-avatar" aria-hidden="true">
                      {row.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="rank-identity">
                      <strong>
                        {row.name}
                        {isYou ? <em className="rank-you-tag">tú</em> : null}
                      </strong>
                      <span className="rank-gap">{row.gap} pts del líder</span>
                    </span>
                    <span className="rank-preds">
                      <b>{row.hits}</b>
                      aciertos
                    </span>
                    <span className="rank-points">{row.points} pts</span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}

      <section className="panel performance-panel">
        <div className="panel-head">
          <h2>Tu rendimiento</h2>
        </div>

        {performance.best.length === 0 ? (
          <p className="muted performance-empty">
            Cuando termines mas partidos verás aquí en qué tipo de pronóstico te va mejor.
          </p>
        ) : (
          <div className="performance-groups">
            <PerformanceGroup tone="good" title="Se te da bien" rows={performance.best} />
            {performance.worst.length > 0 ? (
              <PerformanceGroup tone="bad" title="Se te complica" rows={performance.worst} />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
