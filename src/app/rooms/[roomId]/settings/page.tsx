import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RoomHeader } from "@/components/RoomHeader";
import {
  regenerateRoomCodeAction,
  removeRoomMemberAction,
  updateRoomMemberRoleAction,
  updateRoomSettingsAction,
} from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DeleteRoomButton } from "@/components/DeleteRoomButton";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRoomMembership, roomRoleLabels } from "@/lib/rooms";
import {
  roomPresetDescription,
  roomPresetLabels,
  roomMarketCatalog,
  tournamentTypeLabels,
  type RoomMarketKey,
} from "@/lib/room-presets";
import { prisma } from "@/lib/db";
import { toAppDateTimeInput } from "@/lib/timezone";

const tournamentTypes = [
  "WORLD_CUP",
  "INTERNATIONAL_CUP",
  "CLUB_TOURNAMENT",
  "DOMESTIC_LEAGUE",
  "CUSTOM",
] as const;

const presets = ["BASIC", "INTERMEDIATE", "COMPLETE", "CUSTOM"] as const;

function enabledMarketsFrom(value: unknown): Set<string> {
  if (Array.isArray(value)) return new Set(value.map(String));
  return new Set<string>();
}

function marketPointsFrom(value: unknown): Partial<Record<RoomMarketKey, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const config = value as { marketPoints?: Record<string, unknown> };
  if (!config.marketPoints || typeof config.marketPoints !== "object") return {};

  return Object.fromEntries(
    Object.entries(config.marketPoints)
      .map(([key, raw]) => [key, typeof raw === "number" ? raw : Number(raw)] as const)
      .filter(([, points]) => Number.isFinite(points)),
  ) as Partial<Record<RoomMarketKey, number>>;
}

function statusMessage(searchParams: { saved?: string; code?: string; members?: string; error?: string }) {
  if (searchParams.saved) return { ok: true, text: "Configuracion guardada." };
  if (searchParams.code) return { ok: true, text: "Codigo regenerado." };
  if (searchParams.members) return { ok: true, text: "Miembros actualizados." };
  if (searchParams.error === "owner-required") {
    return { ok: false, text: "Solo el creador puede hacer ese cambio." };
  }
  if (searchParams.error) return { ok: false, text: "No se pudo completar la accion." };
  return null;
}

export default async function RoomSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ saved?: string; code?: string; members?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { roomId } = await params;
  const query = await searchParams;
  const { room, membership } = await requireRoomMembership(roomId, user.id);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";
  const isOwner = membership.role === "OWNER";
  const message = statusMessage(query);
  const enabledMarkets = enabledMarketsFrom(room.ruleSet?.enabledMarkets);
  const customMarketPoints = marketPointsFrom(room.ruleSet?.customMarketConfig);

  const competitions = await prisma.competition.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, season: true },
  });

  if (room.externalTournamentId && !competitions.some((c) => c.id === room.externalTournamentId)) {
    const currentComp = await prisma.competition.findUnique({
      where: { id: room.externalTournamentId },
      select: { id: true, name: true, type: true, season: true },
    });
    if (currentComp) {
      competitions.push(currentComp);
    }
  }

  if (!canManage) notFound();

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
        activeTab="settings"
        canManage={canManage}
      />

      {message ? (
        <p className={`form-action-feedback${message.ok ? " success" : " error"}`}>
          {message.text}
        </p>
      ) : null}

      <div className="two-column">
        <form action={updateRoomSettingsAction} className="panel stack-form room-form">
          <input type="hidden" name="roomId" value={room.id} />
          <div className="panel-inline-head">
            <h2>Datos y reglas</h2>
            <span>{roomPresetLabels[room.configPreset]}</span>
          </div>

          <label>
            Nombre de la sala
            <input name="name" defaultValue={room.name} required minLength={3} />
          </label>

          {competitions.length > 0 ? (
            <label>
              Competencia / Torneo
              <select
                name="competitionId"
                defaultValue={room.externalTournamentId ?? ""}
                id="competition-select"
              >
                {competitions.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name}
                    {comp.season ? ` (${comp.season})` : ""}
                  </option>
                ))}
              </select>
              <input
                type="hidden"
                name="tournamentName"
                defaultValue={room.tournamentName}
                id="tournament-name-hidden"
              />
              <input
                type="hidden"
                name="tournamentType"
                defaultValue={room.tournamentType}
                id="tournament-type-hidden"
              />
            </label>
          ) : (
            <>
              <label>
                Nombre del torneo
                <input
                  name="tournamentName"
                  defaultValue={room.tournamentName}
                  required
                  minLength={2}
                />
              </label>
              <input type="hidden" name="tournamentType" value="CUSTOM" />
            </>
          )}

          {competitions.length > 0 ? (
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  (function() {
                    var map = ${JSON.stringify(Object.fromEntries(competitions.map((c) => [c.id, { name: c.name, type: c.type }])))};
                    var sel = document.getElementById('competition-select');
                    var nameField = document.getElementById('tournament-name-hidden');
                    var typeField = document.getElementById('tournament-type-hidden');
                    if (!sel || !nameField || !typeField) return;
                    function sync() {
                      var c = map[sel.value];
                      if (c) {
                        nameField.value = c.name;
                        typeField.value = c.type;
                      }
                    }
                    sel.addEventListener('change', sync);
                    sync();
                  })();
                `
              }}
            />
          ) : null}

          <label>
            Modo de quiniela
            <select name="configPreset" defaultValue={room.configPreset}>
              {presets.map((preset) => (
                <option key={preset} value={preset}>
                  {roomPresetLabels[preset]} - {roomPresetDescription(preset)}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="room-preset-fieldset compact">
            <legend>Cierre de pronosticos</legend>
            <div className="room-preset-grid">
              <label className="room-preset-option">
                <input
                  type="radio"
                  name="deadlineMode"
                  value="PER_MATCH"
                  defaultChecked={room.deadlineMode === "PER_MATCH"}
                />
                <span>
                  <strong>Antes de cada partido</strong>
                  <small>Cada partido cierra por separado antes de su inicio.</small>
                </span>
              </label>
              <label className="room-preset-option">
                <input
                  type="radio"
                  name="deadlineMode"
                  value="PHASE"
                  defaultChecked={room.deadlineMode === "PHASE"}
                />
                <span>
                  <strong>Antes de cada fase</strong>
                  <small>La fase completa cierra antes del primer partido de esa fase.</small>
                </span>
              </label>
            </div>
            <label className="room-inline-number">
              Horas antes del inicio
              <input
                type="number"
                name="deadlineHoursBefore"
                min="0"
                max="168"
                defaultValue={room.deadlineHoursBefore}
              />
            </label>
          </fieldset>

          <fieldset className="room-preset-fieldset compact">
            <legend>Experiencia de pronosticos</legend>
            <label>
              Predicciones populares
              <select
                name="popularPredictionsVisibility"
                defaultValue={room.popularPredictionsVisibility}
              >
                <option value="ALWAYS">Mostrar siempre</option>
                <option value="AFTER_PICK">Despues de hacer mi pick</option>
                <option value="AFTER_DEADLINE">Despues del cierre</option>
                <option value="HIDDEN">No mostrar</option>
              </select>
              <small>Los resultados son porcentajes anonimos.</small>
            </label>
            <div className="room-inline-settings">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="championPickEnabled"
                  defaultChecked={room.championPickEnabled}
                />
                Permitir pronostico de campeon
              </label>
              <label className="room-inline-number">
                Puntos por acertar
                <input
                  type="number"
                  name="championPickPoints"
                  min="0"
                  max="99"
                  defaultValue={room.championPickPoints}
                />
              </label>
              <label className="room-inline-number">
                Cierre del pronostico de campeon
                <input
                  type="datetime-local"
                  name="championPickDeadline"
                  defaultValue={toAppDateTimeInput(room.championPickDeadline)}
                />
                <small>Vacio = antes del primer partido, segun las horas de arriba.</small>
              </label>
            </div>
          </fieldset>

          <div className="scoring-rules-grid">
            <label>
              Marcador exacto
              <input
                type="number"
                name="exactScorePoints"
                min="0"
                max="99"
                defaultValue={room.ruleSet?.exactScorePoints ?? 3}
              />
            </label>
            <label>
              Resultado
              <input
                type="number"
                name="outcomePoints"
                min="0"
                max="99"
                defaultValue={room.ruleSet?.outcomePoints ?? 1}
              />
            </label>
            <label>
              Quien pasa
              <input
                type="number"
                name="advancePickPoints"
                min="0"
                max="99"
                defaultValue={room.ruleSet?.advancePickPoints ?? 1}
              />
            </label>
          </div>

          <fieldset className="room-market-fieldset">
            <legend>Mercados configurables</legend>
            <p className="muted">
              En modo custom se usan los mercados seleccionados. En los otros modos se guardan como
              base para cuando cambies a custom.
            </p>
            <div className="room-market-grid">
              {roomMarketCatalog.map((market) => (
                <label className="room-market-option" key={market.key}>
                  <input
                    type="checkbox"
                    name="enabledMarkets"
                    value={market.key}
                    defaultChecked={enabledMarkets.has(market.key)}
                  />
                  <span>
                    <strong>{market.label}</strong>
                    <small>{market.description}</small>
                    <input
                      type="number"
                      name={`marketPoints:${market.key}`}
                      min="0"
                      max="99"
                      defaultValue={customMarketPoints[market.key] ?? market.defaultPoints}
                      aria-label={`Puntos para ${market.label}`}
                    />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <ConfirmButton
            tone="primary"
            title="Los cambios aplican hacia adelante"
            message={
              <>
                <p>
                  Las reglas nuevas solo cuentan para los partidos que empiecen despues de este
                  momento.
                </p>
                <p>
                  Los partidos que ya empezaron o terminaron conservan las reglas con las que se
                  jugaron, asi que los puntos ya repartidos no cambian.
                </p>
              </>
            }
            confirmText="Guardar configuracion"
          >
            Guardar configuracion
          </ConfirmButton>
        </form>

        <section className="panel room-form">
          <div className="panel-inline-head">
            <h2>Codigo de acceso</h2>
            <span>{isOwner ? "Owner" : "Solo lectura"}</span>
          </div>
          <p className="muted">
            Comparte este codigo para que otros usuarios puedan unirse a la sala.
          </p>
          <div className="room-access-code-display">{room.accessCode}</div>
          <form action={regenerateRoomCodeAction}>
            <input type="hidden" name="roomId" value={room.id} />
            <SubmitButton className="ghost-button full-width-button" pendingText="Generando..." disabled={!isOwner}>
              Regenerar codigo
            </SubmitButton>
          </form>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Miembros</h2>
          <span>{room.members.length} usuarios</span>
        </div>
        <div className="room-members-list">
          {room.members.map((member) => {
            const isProtectedOwner = member.role === "OWNER";
            const canEditRole = isOwner && !isProtectedOwner;
            const canRemove =
              member.userId === user.id ||
              (isOwner && !isProtectedOwner) ||
              (membership.role === "ADMIN" && member.role === "MEMBER");

            return (
              <div className="room-member-row" key={member.id}>
                <div>
                  <strong>{member.user.displayName}</strong>
                  <span>@{member.user.username}</span>
                </div>

                <form action={updateRoomMemberRoleAction} className="room-member-role-form">
                  <input type="hidden" name="roomId" value={room.id} />
                  <input type="hidden" name="memberId" value={member.id} />
                  <select name="role" defaultValue={member.role} disabled={!canEditRole}>
                    {isProtectedOwner ? <option value="OWNER">Creador</option> : null}
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Miembro</option>
                  </select>
                  <SubmitButton className="ghost-button" pendingText="Actualizando..." disabled={!canEditRole}>
                    Actualizar
                  </SubmitButton>
                </form>

                <form action={removeRoomMemberAction}>
                  <input type="hidden" name="roomId" value={room.id} />
                  <input type="hidden" name="memberId" value={member.id} />
                  <SubmitButton className="danger-button" pendingText={member.userId === user.id ? "Saliendo..." : "Quitando..."} disabled={!canRemove || isProtectedOwner}>
                    {member.userId === user.id ? "Salir" : "Quitar"}
                  </SubmitButton>
                </form>

                <span className="room-member-role-pill">{roomRoleLabels[member.role]}</span>
              </div>
            );
          })}
        </div>
      </section>

      {isOwner ? (
        <div className="admin-danger-zone" style={{ marginTop: "24px" }}>
          <h3>Zona peligrosa</h3>
          <p>
            Al eliminar esta sala se borrarán permanentemente todos sus miembros,
            pronósticos y configuraciones asociadas. Esta acción no se puede deshacer.
          </p>
          <DeleteRoomButton roomId={room.id} roomName={room.name} />
        </div>
      ) : null}
    </div>
  );
}
