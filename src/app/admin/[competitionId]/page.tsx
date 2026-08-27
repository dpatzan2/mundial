import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
  createCompetitionPhaseAction,
  createCompetitionTeamAction,
  createCompetitionMatchAction,
  updateCompetitionMatchAction,
  updateCompetitionAction,
  deleteCompetitionPhaseAction,
  deleteCompetitionTeamAction,
  deleteCompetitionMatchAction,
  updateCompetitionPhaseAction,
  saveCompetitionMatchResultAction,
} from "@/app/actions";
import { RoomMarketFields } from "@/components/RoomMarketFields";
import { roomMarketCatalog } from "@/lib/room-presets";
import { derivedMarkets } from "@/lib/market-result-display";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stageLabels } from "@/lib/stages";
import { formatAppDateTime, toAppDateTimeInput } from "@/lib/timezone";
import { CompetitionTabs } from "@/components/CompetitionTabs";
import { DeleteCompetitionButton } from "@/components/DeleteCompetitionButton";
import { SubmitButton } from "@/components/SubmitButton";
import { AdminFormBehaviors } from "@/components/AdminFormBehaviors";
import { redirect } from "next/navigation";

const competitionStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
const phaseFormats = ["GROUP", "KNOCKOUT", "LEAGUE"] as const;
const stages = [
  "GROUP",
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTER_FINAL",
  "SEMIFINAL",
  "THIRD_PLACE",
  "FINAL",
] as const;

const statusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  ARCHIVED: "Archivada",
};

const statusClass: Record<string, string> = {
  DRAFT: "draft",
  ACTIVE: "active",
  ARCHIVED: "archived",
};

const formatLabels: Record<string, string> = {
  GROUP: "Grupos",
  KNOCKOUT: "Eliminatoria",
  LEAGUE: "Liga",
};

export default async function CompetitionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<{ tab?: string; created?: string; saved?: string; deleted?: string; error?: string; editMatchId?: string; editDetailsId?: string; editPhaseId?: string; addMatchPhaseId?: string }>;
}) {
  await requireAdmin();
  const { competitionId } = await params;
  const query = await searchParams;
  const tab = query.tab || "overview";

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      phases: { orderBy: { sortOrder: "asc" } },
      teams: { orderBy: { name: "asc" } },
      matches: {
        include: {
          phase: true,
          homeTeam: true,
          awayTeam: true,
        },
        orderBy: [{ kickoffAt: "asc" }, { matchNumber: "asc" }],
      },
    },
  });

  if (!competition) redirect("/admin");

  const globalTeams = await prisma.team.findMany({ orderBy: { name: "asc" } });

  // Calculate distinct group codes from GROUP format phases and names from LEAGUE format phases
  const groupOptions = new Set<string>();
  competition.phases.forEach((phase) => {
    if (phase.format === "GROUP" && phase.groupCode) {
      groupOptions.add(phase.groupCode);
    } else if (phase.format === "LEAGUE") {
      groupOptions.add(phase.name);
    }
  });
  const sortedGroups = Array.from(groupOptions).sort();

  // Find default phase for matches

  // Calculate next match number for matches
  const maxMatchNumber = competition.matches.reduce(
    (max, match) => Math.max(max, match.matchNumber ?? 0),
    0
  );
  const nextMatchNumber = maxMatchNumber + 1;

  // Fetch existing market results for all matches of this competition to avoid nested async mappings
  const matchIds = competition.matches.map((m) => m.id);
  const allMarketResults = await prisma.matchMarketResult.findMany({
    where: { competitionMatchId: { in: matchIds } }
  });
  
  // Group results by matchId
  const marketResultsByMatch: Record<string, Record<string, Record<string, unknown>>> = {};
  allMarketResults.forEach((r) => {
    if (!r.competitionMatchId) return;
    if (!marketResultsByMatch[r.competitionMatchId]) {
      marketResultsByMatch[r.competitionMatchId] = {};
    }
    marketResultsByMatch[r.competitionMatchId][r.marketKey] = r.value as Record<string, unknown>;
  });

  return (
    <div className="page">
      <AdminFormBehaviors />
      <Link className="back-link" href="/admin">
        <ArrowLeft size={16} />
        Competiciones
      </Link>

      <header className="admin-detail-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span className={`status-badge ${statusClass[competition.status]}`}>
              {statusLabels[competition.status]}
            </span>
            {competition.season ? (
              <span className="muted" style={{ fontSize: "0.88rem" }}>{competition.season}</span>
            ) : null}
          </div>
          <h1>{competition.name}</h1>
        </div>
      </header>

      {query.created ? (
        <p className="form-action-feedback success">Registro creado correctamente.</p>
      ) : null}
      {query.saved ? (
        <p className="form-action-feedback success">Cambios guardados.</p>
      ) : null}
      {query.deleted ? (
        <p className="form-action-feedback success">Registro eliminado.</p>
      ) : null}
      {query.error ? (
        <p className="form-action-feedback error">No se pudo completar la accion. Revisa los datos.</p>
      ) : null}

      <CompetitionTabs
        competitionId={competitionId}
        counts={{
          phases: competition.phases.length,
          teams: competition.teams.length,
          matches: competition.matches.length,
        }}
      />

      {tab === "overview" && (
        <div className="admin-tab-panel">
          <div className="admin-overview-grid">
            <form action={updateCompetitionAction} className="panel stack-form room-form">
              <input type="hidden" name="id" value={competition.id} />
              <div className="panel-inline-head">
                <h2>Informacion general</h2>
              </div>
              <label>
                Nombre
                <input name="name" defaultValue={competition.name} required minLength={2} />
              </label>
              <label>
                Temporada
                <input name="season" defaultValue={competition.season ?? ""} placeholder="Ej. 2026/27" />
              </label>
              <div className="scoring-rules-grid">
                <label>
                  Pais o region
                  <input name="countryCode" defaultValue={competition.countryCode ?? ""} placeholder="Ej. GT, UEFA" />
                </label>
                <label>
                  URL del logo
                  <input name="logoUrl" type="url" defaultValue={competition.logoUrl ?? ""} placeholder="https://..." />
                </label>
              </div>
              <label>
                URL de portada
                <input name="bannerUrl" type="url" defaultValue={competition.bannerUrl ?? ""} placeholder="https://..." />
              </label>
              <label>
                Habilitar automatización de resultados
                <input
                  name="apiFootballLeagueId"
                  type="number"
                  defaultValue={competition.apiFootballLeagueId ?? ""}
                  placeholder="Ej. 1 (cualquier número habilita)"
                />
                <small>Cualquier valor numérico habilita la actualización automática de resultados vía n8n para esta competencia.</small>
              </label>
              <label>
                Campeon oficial
                <select name="championTeamId" defaultValue={competition.championTeamId ?? ""}>
                  <option value="">Aun no definido</option>
                  {competition.teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
                <small>Al definirlo se recalculan los puntos de campeon en todas las salas.</small>
              </label>
              <label>
                Estado
                <select name="status" defaultValue={competition.status}>
                  {competitionStatuses.map((status) => (
                    <option value={status} key={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="scoring-rules-grid">
                <label>
                  Inicio
                  <input
                    type="datetime-local"
                    name="startsAt"
                    defaultValue={toAppDateTimeInput(competition.startsAt)}
                  />
                </label>
                <label>
                  Fin
                  <input
                    type="datetime-local"
                    name="endsAt"
                    defaultValue={toAppDateTimeInput(competition.endsAt)}
                  />
                </label>
              </div>
              <button className="primary-button" type="submit">
                Guardar cambios
              </button>
            </form>

            <div className="admin-overview-stats">
              <div className="admin-stat-row">
                <span>Fases</span>
                <strong>{competition.phases.length}</strong>
              </div>
              <div className="admin-stat-row">
                <span>Equipos</span>
                <strong>{competition.teams.length}</strong>
              </div>
              <div className="admin-stat-row">
                <span>Partidos</span>
                <strong>{competition.matches.length}</strong>
              </div>
              <div className="admin-stat-row">
                <span>Programados</span>
                <strong>{competition.matches.filter((m) => m.status === "SCHEDULED").length}</strong>
              </div>
              <div className="admin-stat-row">
                <span>Finalizados</span>
                <strong>{competition.matches.filter((m) => m.status === "FINISHED").length}</strong>
              </div>
            </div>
          </div>

          <div className="admin-danger-zone">
            <h3>Zona peligrosa</h3>
            <p>
              Al eliminar esta competencia se borrarán permanentemente todas las fases,
              equipos y partidos asociados.
            </p>
            <DeleteCompetitionButton
              competitionId={competition.id}
              competitionName={competition.name}
            />
          </div>
        </div>
      )}

      {tab === "phases" && (
        <div className="admin-tab-panel">
          <details className="admin-inline-form" style={{ marginBottom: "20px", border: "1px dashed var(--primary)" }}>
            <summary style={{ cursor: "pointer", fontWeight: "bold", color: "var(--primary-dark)", padding: "4px", userSelect: "none" }}>
              + Agregar fase
            </summary>
            <div style={{ marginTop: "14px" }}>
              <form action={createCompetitionPhaseAction} className="stack-form">
                <input type="hidden" name="competitionId" value={competition.id} />
                <label>
                  Nombre
                  <input name="name" placeholder="Ej. Grupo A, Cuartos de final, Jornada 1" required />
                </label>
                <div className="scoring-rules-grid">
                  <label>
                    Formato
                    <select name="format" id="phase-format-select" defaultValue="GROUP">
                      {phaseFormats.map((format) => (
                        <option value={format} key={format}>
                          {formatLabels[format]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {/* Automatically set sortOrder as hidden input */}
                  <input type="hidden" name="sortOrder" value={competition.phases.length} />
                  
                  <div className="scoring-rules-grid" id="phase-dates-container" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <label>
                      Fecha y hora inicio
                      <input type="datetime-local" name="startsAt" />
                    </label>
                    <label>
                      Fecha y hora fin
                      <input type="datetime-local" name="endsAt" />
                    </label>
                  </div>
                </div>

                <div className="scoring-rules-grid" id="phase-conditional-container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label id="stage-field-container">
                    Etapa compatible
                    <select name="stage" defaultValue="">
                      <option value="">Sin etapa fija</option>
                      {stages.map((stage) => (
                        <option value={stage} key={stage}>
                          {stageLabels[stage]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label id="group-field-container">
                    Grupo
                    <input name="groupCode" placeholder="A, B, Norte..." />
                  </label>
                </div>
                <div className="scoring-rules-grid">
                  <label>
                    Clasificados directos
                    <input type="number" name="automaticQualifiers" min="0" max="64" defaultValue="0" />
                  </label>
                  <label>
                    Mejores terceros clasificados
                    <input type="number" name="bestThirdQualifiers" min="0" max="64" defaultValue="0" />
                  </label>
                </div>
                <SubmitButton className="primary-button">
                  Crear fase
                </SubmitButton>
              </form>
            </div>
          </details>

          <div className="admin-item-list">
            {competition.phases.length === 0 ? (
              <p className="muted" style={{ padding: "12px 0" }}>
                No hay fases registradas todavia.
              </p>
            ) : (
              competition.phases.map((phase) => {
                const isEditingPhase = query.editPhaseId === phase.id;

                return (
                <div className="admin-item-row" key={phase.id}>
                  <div className="admin-item-info">
                    <strong>{phase.name}</strong>
                    <span>
                      {formatLabels[phase.format]} · Orden {phase.sortOrder}
                      {phase.groupCode ? ` · Grupo ${phase.groupCode}` : ""}
                      {phase.stage ? ` · ${stageLabels[phase.stage]}` : ""}
                      {phase.automaticQualifiers ? ` · ${phase.automaticQualifiers} directos` : ""}
                      {phase.bestThirdQualifiers ? ` · ${phase.bestThirdQualifiers} mejores terceros` : ""}
                    </span>
                  </div>
                  <div className="admin-item-actions">
                    <span className="muted" style={{ fontSize: "0.82rem" }}>
                      {competition.matches.filter((m) => m.phaseId === phase.id).length} partidos
                    </span>
                    <Link
                      href={`/admin/${competition.id}?tab=phases&editPhaseId=${isEditingPhase ? "" : phase.id}`}
                      scroll={false}
                      className="ghost-button compact"
                      style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: "30px", background: isEditingPhase ? "var(--muted)" : "transparent", borderRadius: "6px", textDecoration: "none" }}
                    >
                      {isEditingPhase ? "Cancelar" : "Editar"}
                    </Link>
                    <form action={deleteCompetitionPhaseAction}>
                      <input type="hidden" name="id" value={phase.id} />
                      <input type="hidden" name="competitionId" value={competition.id} />
                      <button
                        type="submit"
                        className="danger-button"
                        title="Eliminar fase"
                      >
                        <Trash2 size={14} />
                      </button>
                    </form>
                  </div>
                  {isEditingPhase ? (
                    <form action={updateCompetitionPhaseAction} className="stack-form" style={{ gridColumn: "1 / -1", marginTop: "10px", background: "var(--panel-soft)", border: "1px dashed var(--line)", padding: "16px", borderRadius: "8px" }}>
                      <input type="hidden" name="id" value={phase.id} />
                      <input type="hidden" name="competitionId" value={competition.id} />
                      <label>
                        Nombre
                        <input name="name" defaultValue={phase.name} required />
                      </label>
                      <div className="scoring-rules-grid">
                        <label>
                          Formato
                          <select name="format" defaultValue={phase.format}>
                            {phaseFormats.map((format) => (
                              <option value={format} key={format}>{formatLabels[format]}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Orden
                          <input type="number" name="sortOrder" min="0" max="999" defaultValue={phase.sortOrder} />
                        </label>
                        <label>
                          Etapa compatible
                          <select name="stage" defaultValue={phase.stage ?? ""}>
                            <option value="">Sin etapa fija</option>
                            {stages.map((stage) => (
                              <option value={stage} key={stage}>{stageLabels[stage]}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Grupo
                          <input name="groupCode" defaultValue={phase.groupCode ?? ""} placeholder="A, B, Norte..." />
                        </label>
                        <label>
                          Fecha y hora inicio
                          <input type="datetime-local" name="startsAt" defaultValue={toAppDateTimeInput(phase.startsAt)} />
                        </label>
                        <label>
                          Fecha y hora fin
                          <input type="datetime-local" name="endsAt" defaultValue={toAppDateTimeInput(phase.endsAt)} />
                        </label>
                        <label>
                          Clasificados directos
                          <input type="number" name="automaticQualifiers" min="0" max="64" defaultValue={phase.automaticQualifiers} />
                        </label>
                        <label>
                          Mejores terceros
                          <input type="number" name="bestThirdQualifiers" min="0" max="64" defaultValue={phase.bestThirdQualifiers} />
                        </label>
                      </div>
                      <SubmitButton className="primary-button" style={{ marginTop: "14px" }}>
                        Guardar fase
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {tab === "teams" && (
        <div className="admin-tab-panel">
          <details className="admin-inline-form" style={{ marginBottom: "20px", border: "1px dashed var(--primary)" }}>
            <summary style={{ cursor: "pointer", fontWeight: "bold", color: "var(--primary-dark)", padding: "4px", userSelect: "none" }}>
              + Agregar equipo
            </summary>
            <div style={{ marginTop: "14px" }}>
              <form action={createCompetitionTeamAction} className="stack-form">
                <input type="hidden" name="competitionId" value={competition.id} />
                <label>
                  Nombre del equipo
                  <select name="nameSelect" id="team-name-select" required defaultValue="">
                    <option value="" disabled>Selecciona un equipo del catálogo...</option>
                    {globalTeams.map((team) => (
                      <option key={team.id} value={team.name}>
                        {team.name}
                      </option>
                    ))}
                    <option value="__NEW__" style={{ fontWeight: "bold", color: "var(--primary)" }}>
                      + Crear y registrar nuevo equipo...
                    </option>
                  </select>
                </label>

                <label id="new-team-name-container" style={{ display: "none" }}>
                  Nombre del nuevo equipo
                  <input name="customName" id="new-team-name-input" placeholder="Ej. Real Madrid, Chelsea" />
                </label>

                <label id="new-team-logo-container" style={{ display: "none", marginTop: "10px" }}>
                  Escudo / Logo URL
                  <input name="logoUrl" id="new-team-logo-input" placeholder="Ej. https://domain.com/logo.png (Opcional)" />
                </label>

                <label>
                  Grupo
                  {sortedGroups.length > 0 ? (
                    <select name="groupCode" defaultValue="">
                      <option value="">Ninguno (Opcional)</option>
                      {sortedGroups.map((group) => (
                        <option key={group} value={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input name="groupCode" placeholder="Opcional" />
                  )}
                </label>
                <SubmitButton className="primary-button">
                  Guardar equipo
                </SubmitButton>
              </form>
            </div>
          </details>

          <div className="admin-item-list">
            {competition.teams.length === 0 ? (
              <p className="muted" style={{ padding: "12px 0" }}>
                No hay equipos registrados todavia.
              </p>
            ) : (
              competition.teams.map((team) => (
                <div className="admin-item-row" key={team.id}>
                  <div className="admin-item-info">
                    <strong>{team.name}</strong>
                    {team.groupCode ? <span>Grupo {team.groupCode}</span> : null}
                  </div>
                  <div className="admin-item-actions">
                    <form action={deleteCompetitionTeamAction}>
                      <input type="hidden" name="id" value={team.id} />
                      <input type="hidden" name="competitionId" value={competition.id} />
                      <button type="submit" className="danger-button" title="Eliminar equipo">
                        <Trash2 size={14} />
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "matches" && (
        <div className="admin-tab-panel">
          <div style={{ display: "grid", gap: "16px", marginBottom: "20px" }}>
            {competition.matches.length === 0 && competition.phases.length === 0 ? (
              <p className="muted" style={{ padding: "12px 0", textAlign: "center" }}>
                No hay fases ni partidos registrados todavía. Crea una fase primero.
              </p>
            ) : (
              competition.phases.map((phase) => {
                const phaseMatches = competition.matches.filter((m) => m.phaseId === phase.id);
                const isAddingMatchThisPhase = query.addMatchPhaseId === phase.id;
                const isEditingMatchThisPhase = query.editMatchId || query.editDetailsId ? phaseMatches.some(m => m.id === query.editMatchId || m.id === query.editDetailsId) : false;
                const isOpen = isAddingMatchThisPhase || isEditingMatchThisPhase;

                return (
                  <details
                    key={phase.id}
                    className="panel"
                    open={isOpen}
                    style={{ padding: "0", overflow: "hidden" }}
                  >
                    <summary
                      style={{
                        padding: "14px 18px",
                        cursor: "pointer",
                        background: "var(--panel)",
                        fontWeight: 800,
                        fontSize: "1.05rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        listStyle: "none",
                        borderBottom: "1px solid var(--line)",
                        userSelect: "none"
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {phase.name}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--muted)", fontWeight: 700 }}>
                          {phaseMatches.length} partidos
                        </span>
                        <Link
                          href={`/admin/${competition.id}?tab=matches&addMatchPhaseId=${isAddingMatchThisPhase ? "" : phase.id}`}
                          className="primary-button compact add-match-btn"
                          style={{
                            padding: "2px 10px",
                            fontSize: "0.8rem",
                            minHeight: "26px",
                            borderRadius: "4px",
                            textDecoration: "none",
                            background: isAddingMatchThisPhase ? "var(--muted)" : "var(--primary-dark)",
                            color: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: "bold",
                            border: "none"
                          }}
                        >
                          {isAddingMatchThisPhase ? "Cancelar" : "+"}
                        </Link>
                      </div>
                    </summary>
                    <div className="admin-item-list" style={{ padding: "14px", background: "var(--panel)", display: "grid", gap: "12px" }}>
                      
                      {/* Formulario 3: Agregar Partido a esta fase específica */}
                      {isAddingMatchThisPhase && (
                        <form
                          action={createCompetitionMatchAction}
                          className="panel stack-form"
                          style={{
                            background: "var(--panel-soft)",
                            border: "1px dashed var(--primary)",
                            padding: "16px",
                            borderRadius: "8px"
                          }}
                        >
                          <input type="hidden" name="competitionId" value={competition.id} />
                          <input type="hidden" name="phaseId" value={phase.id} />

                          <div className="panel-inline-head" style={{ marginBottom: "12px" }}>
                            <h3 style={{ margin: "0", fontSize: "0.95rem" }}>Agregar Partido a {phase.name}</h3>
                          </div>

                          <div className="scoring-rules-grid">
                            <label>
                              No. partido
                              <input
                                type="number"
                                min="1"
                                name="matchNumber"
                                defaultValue={nextMatchNumber}
                                required
                              />
                            </label>
                            <label>
                              Fecha y hora
                              <input type="datetime-local" name="kickoffAt" />
                            </label>
                          </div>

                          <div className="scoring-rules-grid">
                            <label>
                              Local
                              <select name="homeTeamId" defaultValue="">
                                <option value="">Por definir (Pendiente)</option>
                                {competition.teams.map((team) => (
                                  <option value={team.id} key={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Visitante
                              <select name="awayTeamId" defaultValue="">
                                <option value="">Por definir (Pendiente)</option>
                                {competition.teams.map((team) => (
                                  <option value={team.id} key={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="scoring-rules-grid">
                            <label>
                              Placeholder local
                              <input name="homePlaceholder" placeholder="Ej. Ganador Grupo A" />
                            </label>
                            <label>
                              Placeholder visitante
                              <input name="awayPlaceholder" placeholder="Ej. Segundo Grupo B" />
                            </label>
                          </div>

                          <label style={{ display: "grid", gap: "6px" }}>
                            Sede
                            <input name="venue" placeholder="Estadio / ciudad" />
                          </label>

                          <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                            <SubmitButton className="primary-button" style={{ flex: 1 }}>
                              Crear partido
                            </SubmitButton>
                            <Link
                              href={`/admin/${competition.id}?tab=matches`}
                              className="ghost-button"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "0 16px",
                                height: "44px",
                                textDecoration: "none",
                                borderRadius: "6px",
                                fontSize: "0.9rem",
                                fontWeight: "bold",
                                background: "var(--panel-soft)",
                                color: "var(--primary)"
                              }}
                            >
                              Cancelar
                            </Link>
                          </div>
                        </form>
                      )}

                      {phaseMatches.length === 0 ? (
                        <p className="muted" style={{ padding: "12px 0", textAlign: "center", fontStyle: "italic", fontSize: "0.9rem" }}>
                          No hay partidos programados en esta fase.
                        </p>
                      ) : (
                        phaseMatches.map((match) => {
                          const isEditing = query.editMatchId === match.id;
                          const isEditingDetails = query.editDetailsId === match.id;
                          const marketResultsMap = marketResultsByMatch[match.id] ?? {};

                          const manualMarkets = roomMarketCatalog
                            .map((m) => m.key)
                            .filter(
                              (k) =>
                                k !== "EXACT_SCORE" &&
                                k !== "MATCH_OUTCOME" &&
                                k !== "ADVANCING_TEAM" &&
                                !derivedMarkets.includes(k),
                            );

                          const homeName = match.homeTeam?.name ?? match.homePlaceholder ?? "Local";
                          const awayName = match.awayTeam?.name ?? match.awayPlaceholder ?? "Visitante";

                          return (
                            <div key={match.id} style={{ display: "grid", gap: "10px", padding: "14px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--panel)" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
                                <div className="admin-item-info">
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                                    <strong style={{ fontSize: "0.96rem" }}>{homeName} vs {awayName}</strong>
                                    {match.homeScore !== null && match.awayScore !== null ? (
                                      <span style={{ background: "#e2f5ea", color: "#1a6b3c", padding: "2px 8px", borderRadius: "999px", fontSize: "0.76rem", fontWeight: "bold" }}>
                                        {match.homeScore} : {match.awayScore}
                                      </span>
                                    ) : null}
                                    {match.status === "FINISHED" ? (
                                      <span className="status-badge active" style={{ fontSize: "0.68rem", padding: "1px 6px" }}>Fin</span>
                                    ) : null}
                                  </div>
                                  <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                                    {match.matchNumber ? `#${match.matchNumber}` : ""}
                                    {match.kickoffAt ? ` · ${formatAppDateTime(match.kickoffAt)}` : ""}
                                    {match.venue ? ` · ${match.venue}` : ""}
                                  </span>
                                </div>
                                <div className="admin-item-actions">
                                  <Link
                                    href={`/admin/${competition.id}?tab=matches&editDetailsId=${isEditingDetails ? "" : match.id}`}
                                    scroll={false}
                                    className="ghost-button compact"
                                    style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: "30px", background: isEditingDetails ? "var(--muted)" : "transparent", borderRadius: "6px", textDecoration: "none" }}
                                  >
                                    {isEditingDetails ? "Cancelar" : "Editar"}
                                  </Link>
                                  <Link
                                    href={`/admin/${competition.id}?tab=matches&editMatchId=${isEditing ? "" : match.id}`}
                                    scroll={false}
                                    className="primary-button compact"
                                    style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: "30px", background: isEditing ? "var(--muted)" : "var(--primary-dark)", color: "#fff", textDecoration: "none", borderRadius: "6px" }}
                                  >
                                    {isEditing ? "Cancelar" : "Resultado"}
                                  </Link>
                                  <form action={deleteCompetitionMatchAction} style={{ display: "inline" }}>
                                    <input type="hidden" name="id" value={match.id} />
                                    <input type="hidden" name="competitionId" value={competition.id} />
                                    <button type="submit" className="danger-button" title="Eliminar partido" style={{ padding: "4px 8px", minHeight: "30px" }}>
                                      <Trash2 size={14} />
                                    </button>
                                  </form>
                                </div>
                              </div>

                              {/* Formulario 1: Modificar Resultados */}
                              {isEditing && (
                                <form action={saveCompetitionMatchResultAction} className="panel stack-form" style={{ marginTop: "10px", background: "var(--panel-soft)", border: "1px dashed var(--line)", padding: "16px", borderRadius: "8px" }}>
                                  <input type="hidden" name="competitionId" value={competition.id} />
                                  <input type="hidden" name="matchId" value={match.id} />
                                  
                                  <div className="panel-inline-head" style={{ marginBottom: "12px" }}>
                                    <h3 style={{ margin: "0", fontSize: "0.95rem" }}>Registrar Marcador Oficial</h3>
                                  </div>

                                  <div className="scoring-rules-grid">
                                    <label>
                                      Goles {homeName}
                                      <input
                                        type="number"
                                        min="0"
                                        name={`actualHome:${match.id}`}
                                        defaultValue={match.homeScore ?? ""}
                                        placeholder="0"
                                        style={{ width: "100%" }}
                                      />
                                    </label>
                                    <label>
                                      Goles {awayName}
                                      <input
                                        type="number"
                                        min="0"
                                        name={`actualAway:${match.id}`}
                                        defaultValue={match.awayScore ?? ""}
                                        placeholder="0"
                                        style={{ width: "100%" }}
                                      />
                                    </label>
                                  </div>

                                  <div className="scoring-rules-grid">
                                    {match.phase?.stage !== "GROUP" ? (
                                      <label>
                                        Ganador del cruce (Pasa de ronda)
                                        <select name={`actualWinner:${match.id}`} defaultValue={""}>
                                          <option value="">Por defecto (Autocalcular o Empate)</option>
                                          <option value="HOME">{homeName} pasa</option>
                                          <option value="AWAY">{awayName} pasa</option>
                                        </select>
                                      </label>
                                    ) : <div />}
                                    
                                    <label>
                                      Estado del partido
                                      <select name={`status:${match.id}`} defaultValue={match.status}>
                                        <option value="SCHEDULED">Programado (No finalizado)</option>
                                        <option value="FINISHED">Finalizado (Guardar marcador oficial)</option>
                                      </select>
                                    </label>
                                  </div>

                                  <details className="admin-market-results" style={{ marginTop: "12px" }}>
                                    <summary style={{ cursor: "pointer", fontWeight: "bold", fontSize: "0.86rem", color: "var(--primary-dark)" }}>
                                      Resultados bonus (opcional)
                                    </summary>
                                    <div style={{ marginTop: "8px" }}>
                                      <RoomMarketFields
                                        match={{
                                          id: match.id,
                                          home: homeName,
                                          away: awayName,
                                          stage: match.phase?.stage ?? "GROUP",
                                        }}
                                        markets={manualMarkets}
                                        answers={marketResultsMap}
                                      />
                                    </div>
                                  </details>

                                  <SubmitButton className="primary-button" style={{ marginTop: "14px" }}>
                                    Guardar Resultado
                                  </SubmitButton>
                                </form>
                              )}

                              {/* Formulario 2: Modificar Detalles (Equipos, Sede, Fecha/Hora, Placeholders) */}
                              {isEditingDetails && (
                                <form action={updateCompetitionMatchAction} className="panel stack-form" style={{ marginTop: "10px", background: "var(--panel-soft)", border: "1px dashed var(--line)", padding: "16px", borderRadius: "8px" }}>
                                  <input type="hidden" name="id" value={match.id} />
                                  <input type="hidden" name="competitionId" value={competition.id} />

                                  <div className="panel-inline-head" style={{ marginBottom: "12px" }}>
                                    <h3 style={{ margin: "0", fontSize: "0.95rem" }}>Editar Detalles de Partido</h3>
                                  </div>

                                  <div className="scoring-rules-grid">
                                    <label>
                                      Fase
                                      <select name="phaseId" defaultValue={match.phaseId ?? ""}>
                                        <option value="">Sin fase</option>
                                        {competition.phases.map((p) => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      No. partido
                                      <input type="number" min="1" name="matchNumber" defaultValue={match.matchNumber ?? ""} required />
                                    </label>
                                  </div>

                                  <div className="scoring-rules-grid">
                                    <label>
                                      Equipo Local
                                      <select name="homeTeamId" defaultValue={match.homeTeamId ?? ""}>
                                        <option value="">Por definir (Pendiente)</option>
                                        {competition.teams.map((team) => (
                                          <option key={team.id} value={team.id}>{team.name}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      Equipo Visitante
                                      <select name="awayTeamId" defaultValue={match.awayTeamId ?? ""}>
                                        <option value="">Por definir (Pendiente)</option>
                                        {competition.teams.map((team) => (
                                          <option key={team.id} value={team.id}>{team.name}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>

                                  <div className="scoring-rules-grid">
                                    <label>
                                      Placeholder Local
                                      <input name="homePlaceholder" defaultValue={match.homePlaceholder ?? ""} placeholder="Ej. Ganador Grupo A" />
                                    </label>
                                    <label>
                                      Placeholder Visitante
                                      <input name="awayPlaceholder" defaultValue={match.awayPlaceholder ?? ""} placeholder="Ej. Segundo Grupo B" />
                                    </label>
                                  </div>

                                  <div className="scoring-rules-grid">
                                    <label>
                                      Fecha y hora
                                      <input
                                        type="datetime-local"
                                        name="kickoffAt"
                                        defaultValue={toAppDateTimeInput(match.kickoffAt)}
                                      />
                                    </label>
                                    <label>
                                      Sede / Estadio
                                      <input name="venue" defaultValue={match.venue ?? ""} placeholder="Ej. Estadio Nacional" />
                                    </label>
                                  </div>

                                  <SubmitButton className="primary-button" style={{ marginTop: "14px" }}>
                                    Guardar Detalles
                                  </SubmitButton>
                                </form>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </details>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
