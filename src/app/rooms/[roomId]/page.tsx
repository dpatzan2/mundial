import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, Settings, Trophy, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  roomMarketLabel,
  roomPresetDescription,
  roomPresetLabels,
  tournamentTypeLabels,
  type RoomMarketKey,
} from "@/lib/room-presets";
import { roomRoleLabels } from "@/lib/rooms";
import { RoomHeader } from "@/components/RoomHeader";

function enabledMarketsFrom(value: unknown): RoomMarketKey[] {
  if (!Array.isArray(value)) return [];
  return value.map(String) as RoomMarketKey[];
}

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const user = await requireUser();
  const { roomId } = await params;
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, displayName: true, username: true },
          },
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      },
      ruleSet: true,
    },
  });

  if (!room) notFound();
  const currentMember = room.members.find((member) => member.userId === user.id);
  if (!currentMember) notFound();

  const canManage = currentMember.role === "OWNER" || currentMember.role === "ADMIN";
  const enabledMarkets = enabledMarketsFrom(room.ruleSet?.enabledMarkets);

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

      <div className="metric-grid">
        <div className="metric">
          <span>
            <Trophy size={18} />
          </span>
          <small>Torneo</small>
          <strong>{room.tournamentName}</strong>
        </div>
        <div className="metric">
          <span>
            <ClipboardList size={18} />
          </span>
          <small>Tipo</small>
          <strong>{tournamentTypeLabels[room.tournamentType]}</strong>
        </div>
        <div className="metric">
          <span>
            <Settings size={18} />
          </span>
          <small>Modo</small>
          <strong>{roomPresetLabels[room.configPreset]}</strong>
        </div>
        <div className="metric">
          <span>
            <Users size={18} />
          </span>
          <small>Miembros</small>
          <strong>{room.members.length}</strong>
        </div>
      </div>

      <div className="two-column">

        <section className="panel">
          <div className="panel-head">
            <h2>Configuracion</h2>
            <span>{roomPresetLabels[room.configPreset]}</span>
          </div>
          <div className="room-config-summary">
            <p>{roomPresetDescription(room.configPreset)}</p>
            <dl>
              <div>
                <dt>Marcador exacto</dt>
                <dd>{room.ruleSet?.exactScorePoints ?? 3} pts</dd>
              </div>
              <div>
                <dt>Resultado</dt>
                <dd>{room.ruleSet?.outcomePoints ?? 1} pt</dd>
              </div>
              <div>
                <dt>Quien pasa</dt>
                <dd>{room.ruleSet?.advancePickPoints ?? 1} pt</dd>
              </div>
              <div>
                <dt>Campeon</dt>
                <dd>{room.championPickEnabled ? `${room.championPickPoints} pts` : "Desactivado"}</dd>
              </div>
              <div>
                <dt>Popular</dt>
                <dd>{
                  room.popularPredictionsVisibility === "ALWAYS" ? "Siempre" :
                  room.popularPredictionsVisibility === "AFTER_PICK" ? "Despues del pick" :
                  room.popularPredictionsVisibility === "AFTER_DEADLINE" ? "Al cierre" : "Oculto"
                }</dd>
              </div>
            </dl>
            {enabledMarkets.length > 0 ? (
              <div className="room-market-summary">
                {enabledMarkets.slice(0, 8).map((market) => (
                  <span key={market}>{roomMarketLabel(market)}</span>
                ))}
              </div>
            ) : null}
            {/* ponytail: <details> nativo en vez de un toggle con estado en cliente. */}
            {enabledMarkets.length > 8 ? (
              <details className="room-market-more">
                <summary>+{enabledMarkets.length - 8} reglas mas</summary>
                <div className="room-market-summary">
                  {enabledMarkets.slice(8).map((market) => (
                    <span key={market}>{roomMarketLabel(market)}</span>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Miembros</h2>
            <span>{room.members.length} usuarios</span>
          </div>
          <div className="stage-list">
            {room.members.map((member) => (
              <div className="stage-row" key={member.id}>
                <strong>{member.user.displayName}</strong>
                <span>{roomRoleLabels[member.role]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
