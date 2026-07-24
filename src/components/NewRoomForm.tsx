"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { createRoomAction } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import {
  marketsForPreset,
  roomMarketCatalog,
  roomPresetDescription,
  roomPresetLabels,
  type RoomMarketDefinition,
} from "@/lib/room-presets";
import type { RoomConfigPreset } from "@prisma/client";

type Competition = { id: string; name: string; type: string; season: string | null };

const presets: RoomConfigPreset[] = ["BASIC", "INTERMEDIATE", "COMPLETE", "CUSTOM"];

const deadlineModeLabels: Record<string, string> = {
  PER_MATCH: "Antes de cada partido",
  PHASE: "Antes de cada fase",
};

const popularLabels: Record<string, string> = {
  ALWAYS: "Mostrar siempre",
  AFTER_PICK: "Despues de hacer mi pick",
  AFTER_DEADLINE: "Despues del cierre",
  HIDDEN: "No mostrar",
};

const marketGroupLabels: Record<RoomMarketDefinition["group"], string> = {
  base: "Base",
  goals: "Goles y resultado",
  discipline: "Disciplina",
  knockout: "Definicion de eliminatoria",
  advanced: "Estadisticas especiales",
};

const marketGroups = ["base", "goals", "knockout", "discipline", "advanced"] as const;

type Summary = {
  name: string;
  competition: string;
  deadlineMode: string;
  deadlineHoursBefore: string;
  popular: string;
  championEnabled: boolean;
  championPoints: string;
};

export function NewRoomForm({
  competitions,
  error,
}: {
  competitions: Competition[];
  error?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [preset, setPreset] = useState<RoomConfigPreset>("BASIC");
  const [competitionId, setCompetitionId] = useState(competitions[0]?.id ?? "");
  const [summary, setSummary] = useState<Summary | null>(null);

  const selectedCompetition = competitions.find((comp) => comp.id === competitionId);
  const presetMarkets = useMemo(() => new Set(marketsForPreset(preset)), [preset]);
  const isCustom = preset === "CUSTOM";

  const goToReview = () => {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const data = new FormData(form);
    setSummary({
      name: String(data.get("name") ?? ""),
      competition: selectedCompetition?.name ?? String(data.get("tournamentName") ?? ""),
      deadlineMode: String(data.get("deadlineMode") ?? "PER_MATCH"),
      deadlineHoursBefore: String(data.get("deadlineHoursBefore") ?? "1"),
      popular: String(data.get("popularPredictionsVisibility") ?? "AFTER_PICK"),
      championEnabled: data.get("championPickEnabled") === "on",
      championPoints: String(data.get("championPickPoints") ?? "5"),
    });
    setStep(2);
    window.scrollTo({ top: 0 });
  };

  const backToEdit = () => {
    setStep(1);
    window.scrollTo({ top: 0 });
  };

  return (
    <form ref={formRef} action={createRoomAction} className="panel stack-form room-form">
      {error ? (
        <p className="form-error">Revisa los datos de la sala antes de continuar.</p>
      ) : null}

      <div hidden={step !== 1} className="stack-form room-wizard-step">
        <label>
          Nombre de la sala
          <input name="name" placeholder="Ej. Oficina, familia, cuates" required minLength={3} />
        </label>

        {competitions.length > 0 ? (
          <label>
            Competencia
            <select
              name="competitionId"
              value={competitionId}
              onChange={(event) => setCompetitionId(event.target.value)}
            >
              {competitions.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.name}
                  {comp.season ? ` (${comp.season})` : ""}
                </option>
              ))}
            </select>
            <input type="hidden" name="tournamentName" value={selectedCompetition?.name ?? ""} />
            <input
              type="hidden"
              name="tournamentType"
              value={selectedCompetition?.type ?? "CUSTOM"}
            />
          </label>
        ) : (
          <>
            <label>
              Nombre del torneo
              <input
                name="tournamentName"
                placeholder="Ej. Mundial 2026"
                required
                minLength={2}
              />
            </label>
            <input type="hidden" name="tournamentType" value="CUSTOM" />
          </>
        )}

        <fieldset className="room-preset-fieldset">
          <legend>Configuracion inicial</legend>
          <div className="room-preset-grid">
            {presets.map((option) => (
              <label className="room-preset-option" key={option}>
                <input
                  type="radio"
                  name="configPreset"
                  value={option}
                  checked={preset === option}
                  onChange={() => setPreset(option)}
                />
                <span>
                  <strong>{roomPresetLabels[option]}</strong>
                  <small>{roomPresetDescription(option)}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="room-preset-fieldset">
          <legend>Cierre de pronosticos</legend>
          <div className="room-preset-grid">
            <label className="room-preset-option">
              <input type="radio" name="deadlineMode" value="PER_MATCH" defaultChecked />
              <span>
                <strong>Antes de cada partido</strong>
                <small>Cada partido se puede editar hasta el margen definido antes de su inicio.</small>
              </span>
            </label>
            <label className="room-preset-option">
              <input type="radio" name="deadlineMode" value="PHASE" />
              <span>
                <strong>Antes de cada fase</strong>
                <small>Todos los partidos de una fase cierran juntos antes del primer partido de esa fase.</small>
              </span>
            </label>
          </div>
          <label className="room-inline-number">
            Horas antes del inicio
            <input type="number" name="deadlineHoursBefore" min="0" max="168" defaultValue="1" />
          </label>
        </fieldset>

        <fieldset className="room-preset-fieldset">
          <legend>Experiencia de pronosticos</legend>
          <label>
            Predicciones populares
            <select name="popularPredictionsVisibility" defaultValue="AFTER_PICK">
              <option value="ALWAYS">Mostrar siempre</option>
              <option value="AFTER_PICK">Despues de hacer mi pick</option>
              <option value="AFTER_DEADLINE">Despues del cierre</option>
              <option value="HIDDEN">No mostrar</option>
            </select>
            <small>Solo se muestran porcentajes anonimos, nunca quien eligio cada opcion.</small>
          </label>
          <div className="room-inline-settings">
            <label className="checkbox-label">
              <input type="checkbox" name="championPickEnabled" defaultChecked />
              Permitir pronostico de campeon
            </label>
            <label className="room-inline-number">
              Puntos por acertar
              <input type="number" name="championPickPoints" min="0" max="99" defaultValue="5" />
            </label>
          </div>
        </fieldset>

        <button type="button" className="primary-button" onClick={goToReview}>
          Continuar
        </button>
      </div>

      <div hidden={step !== 2} className="stack-form room-wizard-step">
        {summary ? (
          <dl className="room-review-summary">
            <div><dt>Sala</dt><dd>{summary.name}</dd></div>
            <div><dt>Competencia</dt><dd>{summary.competition}</dd></div>
            <div><dt>Configuracion</dt><dd>{roomPresetLabels[preset]}</dd></div>
            <div>
              <dt>Cierre</dt>
              <dd>
                {deadlineModeLabels[summary.deadlineMode] ?? summary.deadlineMode}
                {` · ${summary.deadlineHoursBefore} h antes`}
              </dd>
            </div>
            <div><dt>Predicciones populares</dt><dd>{popularLabels[summary.popular] ?? summary.popular}</dd></div>
            <div>
              <dt>Pronostico de campeon</dt>
              <dd>{summary.championEnabled ? `Si · ${summary.championPoints} pts` : "No"}</dd>
            </div>
          </dl>
        ) : null}

        <fieldset className="room-preset-fieldset">
          <legend>
            Reglas de la quiniela
            <span className="room-rules-hint">
              {isCustom
                ? "Marca o desmarca los mercados que quieras."
                : "Definidas por la configuracion elegida."}
            </span>
          </legend>
          {/* key por preset: al cambiar de preset se reinician los defaultChecked */}
          <div className="room-rules-list" key={preset}>
            {marketGroups.map((group) => {
              const items = roomMarketCatalog.filter((market) => market.group === group);
              return (
                <section className="room-rules-group" key={group}>
                  <h4>{marketGroupLabels[group]}</h4>
                  {items.map((market) => {
                    const included = presetMarkets.has(market.key);
                    return (
                      <label
                        className={`room-rule${!isCustom && !included ? " is-off" : ""}`}
                        key={market.key}
                      >
                        <input
                          type="checkbox"
                          name="market"
                          value={market.key}
                          defaultChecked={included}
                          disabled={!isCustom}
                        />
                        <span className="room-rule-body">
                          <strong>{market.label}</strong>
                          <small>{market.description}</small>
                        </span>
                        <span className="room-rule-points">{market.defaultPoints} pts</span>
                      </label>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </fieldset>

        <div className="room-wizard-actions">
          <button type="button" className="ghost-button" onClick={backToEdit}>
            <ArrowLeft size={16} />
            Volver a editar
          </button>
          <SubmitButton className="primary-button" pendingText="Creando..." icon={<Check size={18} />}>
            Crear sala
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
