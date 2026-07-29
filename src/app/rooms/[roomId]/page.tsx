import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildBracket } from "@/lib/bracket";
import { tournamentTypeLabels } from "@/lib/room-presets";
import { BracketView } from "@/components/BracketView";
import { RoomHeader } from "@/components/RoomHeader";
import { StandingsView } from "@/components/StandingsView";

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  const { roomId } = await params;
  const query = await searchParams;
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      members: { select: { userId: true, role: true } },
      competition: {
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
        },
      },
    },
  });

  if (!room) notFound();
  const currentMember = room.members.find((member) => member.userId === user.id);
  if (!currentMember) notFound();

  const canManage = currentMember.role === "OWNER" || currentMember.role === "ADMIN";
  const bracket = room.competition ? buildBracket(room.competition.phases) : null;
  const view = query.view === "bracket" && bracket ? "bracket" : "standings";

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
        activeTab="info"
        canManage={canManage}
      />

      <p className="room-tournament-line">
        <Trophy size={15} />
        <strong>{room.tournamentName}</strong>
        <span>{tournamentTypeLabels[room.tournamentType]}</span>
      </p>

      {room.competition ? (
        <>
          <nav className="competition-view-tabs">
            <Link
              className={view === "standings" ? "active" : ""}
              href={`/rooms/${room.id}?view=standings`}
            >
              <BarChart3 size={17} />
              Posiciones
            </Link>
            {bracket ? (
              <Link
                className={view === "bracket" ? "active" : ""}
                href={`/rooms/${room.id}?view=bracket`}
              >
                <Trophy size={17} />
                Eliminatoria
              </Link>
            ) : null}
          </nav>

          {view === "bracket" && bracket ? (
            <BracketView bracket={bracket} />
          ) : (
            <StandingsView competition={room.competition} />
          )}
        </>
      ) : (
        <section className="panel empty-state-panel">
          <h2>Esta sala no tiene una competicion asociada</h2>
          <p className="muted">Las posiciones y la eliminatoria apareceran cuando se enlace una.</p>
        </section>
      )}
    </div>
  );
}
