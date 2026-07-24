import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireRoomMembership } from "@/lib/rooms";
import { RoomHeader } from "@/components/RoomHeader";

export default async function RoomLeaderboardPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const user = await requireUser();
  const { roomId } = await params;
  const { room, membership } = await requireRoomMembership(roomId, user.id);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const [entries, hitGroups] = await Promise.all([
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
  ]);

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
    </div>
  );
}
