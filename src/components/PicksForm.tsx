"use client";

import { Save, Trophy } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { savePredictionsAction, saveRoomPredictionsAction } from "@/app/actions";
import { DateCarousel, DateStatsRow } from "@/components/DateCarousel";
import { FormFeedback, useActionFeedback } from "@/components/FormFeedback";
import { MatchPickCard } from "@/components/MatchPickCard";
import { PhaseTabs } from "@/components/PhaseTabs";
import { RoomMarketFields } from "@/components/RoomMarketFields";
import { SubmitButton } from "@/components/SubmitButton";
import { PredictionResultSummary } from "@/components/PredictionResultSummary";
import { PopularPredictions } from "@/components/PopularPredictions";
import { collectDateTabs, defaultDateKey, groupMatchesByPhase, TBD_DATE_KEY } from "@/lib/match-ui";
import type { DisplayMarketAnswer, DisplayMatch, DisplayPrediction, PeerPrediction, PopularPrediction } from "@/lib/match-ui";
import {
  canViewPeerPredictions,
  deadlinesByStage,
  phaseDeadlineBanner,
  type PickDeadlineMode,
  type SerializedPhaseDeadline,
} from "@/lib/phase-deadlines";
import { stageLabels } from "@/lib/stages";
import { bonusMarketsForStage, type RoomMarketKey } from "@/lib/room-presets";

const GROUP_BY_STORAGE_KEY = "picks-group-by";

type PicksFormProps = {
  matches: DisplayMatch[];
  predictions: Record<string, DisplayPrediction>;
  peersByMatch: Record<string, PeerPrediction[]>;
  phaseDeadlines: SerializedPhaseDeadline[];
  roomId?: string;
  roomMarkets?: RoomMarketKey[];
  marketAnswers?: Record<string, Partial<Record<RoomMarketKey, DisplayMarketAnswer>>>;
  officialMarketResults?: Record<
    string,
    Partial<Record<RoomMarketKey, Record<string, unknown>>>
  >;
  deadlineMode?: PickDeadlineMode;
  deadlineHoursBefore?: number;
  popularPredictions?: Record<string, PopularPrediction>;
  competitionName?: string;
  championPick?: {
    enabled: boolean;
    locked: boolean;
    deadlineLabel: string | null;
    selectedTeamId: string | null;
    points: number;
    teams: Array<{ id: string; name: string }>;
  };
};

export function PicksForm({
  matches,
  predictions,
  peersByMatch,
  phaseDeadlines,
  roomId,
  roomMarkets = [],
  marketAnswers = {},
  officialMarketResults = {},
  deadlineMode,
  deadlineHoursBefore,
  popularPredictions = {},
  competitionName,
  championPick,
}: PicksFormProps) {
  const deadlineMap = deadlinesByStage(phaseDeadlines);
  const hasOpenPhases = useMemo(
    () => phaseDeadlines.some((item) => !item.locked),
    [phaseDeadlines],
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"date" | "phase">("date");
  // ponytail: preferencia local por navegador; si algun dia debe seguir al usuario entre dispositivos, va al perfil.
  useEffect(() => {
    if (localStorage.getItem(GROUP_BY_STORAGE_KEY) === "phase") setGroupBy("phase");
  }, []);
  const chooseGroupBy = (value: "date" | "phase") => {
    setGroupBy(value);
    localStorage.setItem(GROUP_BY_STORAGE_KEY, value);
  };
  const saveHandler = roomId ? saveRoomPredictionsAction : savePredictionsAction;
  const [saveState, saveAction, isSaving] = useActionState(saveHandler, null);
  const feedback = useActionFeedback(saveState);
  const completedPicks = Object.values(predictions).filter(
    (prediction) =>
      prediction.predictedHomeScore !== null && prediction.predictedAwayScore !== null,
  ).length;

  const now = useMemo(() => new Date(), []);
  const dateTabs = collectDateTabs(matches);
  const effectiveDateKey =
    selectedDateKey && dateTabs.some((tab) => tab.dateKey === selectedDateKey)
      ? selectedDateKey
      : defaultDateKey(dateTabs, now);

  const byDate = groupBy === "date";
  const dayMatches = byDate
    ? matches.filter((match) => (match.dateKey ?? TBD_DATE_KEY) === effectiveDateKey)
    : matches;
  const hiddenMatches = byDate
    ? matches.filter((match) => (match.dateKey ?? TBD_DATE_KEY) !== effectiveDateKey)
    : [];
  const dayStats = {
    total: dayMatches.length,
    predicted: dayMatches.filter((match) => {
      const prediction = predictions[match.id];
      return (
        prediction?.predictedHomeScore !== null &&
        prediction?.predictedHomeScore !== undefined &&
        prediction?.predictedAwayScore !== null &&
        prediction?.predictedAwayScore !== undefined
      );
    }).length,
    live: dayMatches.filter((match) => match.status === "LIVE").length,
  };
  const phaseGroups = groupMatchesByPhase(dayMatches);
  const allDayMatchesLocked =
    byDate && dayMatches.length > 0 && dayMatches.every((match) => match.locked);
  const stages = useMemo(
    () => [...new Set(matches.map((match) => match.stage))],
    [matches],
  );
  const groupCodes = useMemo(
    () =>
      [...new Set(
        matches.flatMap((match) =>
          match.stage === "GROUP" && match.groupCode ? [match.groupCode] : [],
        ),
      )].sort(),
    [matches],
  );

  const renderMatchEntry = (match: DisplayMatch, isVisible: boolean) => {
    const prediction = predictions[match.id];
    const deadline = deadlineMap[match.stage];
    const peerPicksVisible = match.peerPicksVisible ?? canViewPeerPredictions(deadline);
    const availableBonusMarkets = bonusMarketsForStage(roomMarkets, match.stage);

    return (
      <div className={isVisible ? "match-day-entry" : "match-day-entry is-hidden"} key={match.id}>
        <div className={isVisible ? "match-pick-stack" : "match-pick-stack is-hidden"}>
          <MatchPickCard
            match={match}
            prediction={prediction}
            peers={peersByMatch[match.id] ?? []}
            peerPicksVisible={peerPicksVisible}
            phaseStartsLabel={deadline?.startsLabel}
            hidden={!isVisible}
          />
          {isVisible ? (
            <PopularPredictions match={match} prediction={popularPredictions[match.id]} />
          ) : null}
          {isVisible ? (
            <PredictionResultSummary
              match={match}
              scorePoints={prediction?.points ?? 0}
              predictedHomeScore={prediction?.predictedHomeScore ?? null}
              predictedAwayScore={prediction?.predictedAwayScore ?? null}
              answers={marketAnswers[match.id] ?? {}}
              officialResults={officialMarketResults[match.id] ?? {}}
            />
          ) : null}
          {isVisible && availableBonusMarkets.length > 0 ? (
            <details className="picks-market-details">
              <summary>
                <span>Bonus opcionales</span>
                <small>{availableBonusMarkets.length} selecciones</small>
              </summary>
              <div className="picks-market-content">
                <RoomMarketFields
                  match={match}
                  markets={availableBonusMarkets}
                  answers={Object.fromEntries(
                    Object.entries(marketAnswers[match.id] ?? {}).map(([key, answer]) => [
                      key,
                      answer?.value ?? {},
                    ]),
                  )}
                />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <form action={saveAction} className="prediction-form">
      {roomId ? <input type="hidden" name="roomId" value={roomId} /> : null}
      <div className="picks-overview panel">
        <div>
          <span className="eyebrow">{competitionName ?? "Competencia"}</span>
          <strong>{completedPicks} de {matches.length} pronosticados</strong>
        </div>
        <progress value={completedPicks} max={Math.max(matches.length, 1)} />
      </div>

      {championPick?.enabled ? (
        <section className="champion-pick panel">
          <Trophy size={22} />
          <div>
            <span className="eyebrow">Candidato de la competicion</span>
            <strong>¿Quien sera campeon?</strong>
            <small>
              {championPick.deadlineLabel
                ? `Limite: ${championPick.deadlineLabel}`
                : "Sin fecha limite disponible"}
              {` · ${championPick.points} pts`}
            </small>
          </div>
          <select
            name="championTeamId"
            defaultValue={championPick.selectedTeamId ?? ""}
            disabled={championPick.locked}
            aria-label="Campeon de la competicion"
          >
            <option value="">Sin candidato</option>
            {championPick.teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </section>
      ) : null}

      <div className="view-toggle" role="group" aria-label="Modo de vista">
        <button
          type="button"
          className={byDate ? "active" : ""}
          aria-pressed={byDate}
          onClick={() => chooseGroupBy("date")}
        >
          Por fecha
        </button>
        <button
          type="button"
          className={byDate ? "" : "active"}
          aria-pressed={!byDate}
          onClick={() => chooseGroupBy("phase")}
        >
          Por fase
        </button>
      </div>

      {byDate ? (
      <section className="panel scoreboard-panel">
        {dateTabs.length > 1 ? (
          <DateCarousel
            tabs={dateTabs}
            selectedDateKey={effectiveDateKey}
            onSelect={setSelectedDateKey}
          />
        ) : null}
        {dateTabs.length > 0 ? (
          <DateStatsRow total={dayStats.total} predicted={dayStats.predicted} live={dayStats.live} />
        ) : null}

        <div className="panel-head">
          <h2>{competitionName ?? "Competencia"}</h2>
        </div>

        <div className="group-stack">
          {phaseGroups.map((group) => {
            const deadline = deadlineMap[group.stage];
            const banner = deadline
              ? phaseDeadlineBanner(deadline, {
                  editable: true,
                  deadlineMode,
                  deadlineHoursBefore,
                })
              : null;
            const title =
              group.stage === "GROUP" && group.groupCode
                ? `${stageLabels.GROUP} · Grupo ${group.groupCode}`
                : stageLabels[group.stage];

            return (
              <div className="group-block" key={group.key}>
                <div className="group-head">
                  <h3>{title}</h3>
                  <span>{group.matches.length} partidos</span>
                </div>
                <div className="group-block-body">
                  {banner ? (
                    <div className={`phase-deadline${banner.closed ? " closed" : ""}`}>
                      <strong>{banner.title}</strong>
                      <span>{banner.message}</span>
                    </div>
                  ) : null}
                  {group.matches.map((match) => renderMatchEntry(match, true))}
                </div>
              </div>
            );
          })}
          {phaseGroups.length === 0 ? (
            <p className="empty-inline muted">No hay partidos programados para esta fecha.</p>
          ) : null}
        </div>

        <div style={{ display: "none" }} aria-hidden="true">
          {hiddenMatches.map((match) => renderMatchEntry(match, false))}
        </div>
      </section>
      ) : (
        <PhaseTabs availableStages={stages} groupCodes={groupCodes} phaseDeadlines={deadlineMap}>
          {({ stage, groupCode }) => {
            const isVisible = (match: DisplayMatch) =>
              match.stage === stage && (stage !== "GROUP" || match.groupCode === groupCode);
            const visibleMatches = matches.filter(isVisible);
            const deadline = deadlineMap[stage];
            const banner = deadline
              ? phaseDeadlineBanner(deadline, { editable: true, deadlineMode, deadlineHoursBefore })
              : null;

            return (
              <section className="panel scoreboard-panel">
                <div className="panel-head">
                  <h2>
                    {stage === "GROUP" && groupCode
                      ? `${stageLabels.GROUP} · Grupo ${groupCode}`
                      : stageLabels[stage]}
                  </h2>
                  <span>{visibleMatches.length} partidos</span>
                </div>
                {banner ? (
                  <div className={`phase-deadline${banner.closed ? " closed" : ""}`}>
                    <strong>{banner.title}</strong>
                    <span>{banner.message}</span>
                  </div>
                ) : null}
                <div className="group-block-body">
                  {matches.map((match) => renderMatchEntry(match, isVisible(match)))}
                </div>
              </section>
            );
          }}
        </PhaseTabs>
      )}

      <div className="sticky-actions picks-actions">
        <FormFeedback feedback={feedback} />
        {!hasOpenPhases ? (
          <p className="picks-actions-note closed">Todos los pronosticos estan cerrados.</p>
        ) : allDayMatchesLocked ? (
          <p className="picks-actions-note closed">
            Los partidos de esta fecha ya estan cerrados. Cambia de fecha para seguir pronosticando.
          </p>
        ) : null}
        <SubmitButton
          isPending={isSaving}
          pendingLabel="Guardando..."
          label={hasOpenPhases ? "Guardar pronosticos" : "Pronosticos cerrados"}
          disabled={!hasOpenPhases}
          icon={<Save size={18} />}
        />
      </div>
    </form>
  );
}
