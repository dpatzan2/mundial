"use client";

import type { DisplayMatch } from "@/lib/match-ui";
import {
  bonusMarketsForStage,
  roomMarketCatalog,
  type RoomMarketKey,
  type RoomMarketDefinition,
} from "@/lib/room-presets";

type MarketMatch = Pick<DisplayMatch, "id" | "home" | "away" | "stage">;

type MarketAnswerValue = Record<string, unknown>;

function stringValue(value: MarketAnswerValue | undefined, key: string) {
  const raw = value?.[key];
  return typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
}

function optionName(match: MarketMatch, side: "HOME" | "AWAY") {
  return side === "HOME" ? match.home : match.away;
}

function marketFieldName(market: RoomMarketKey, matchId: string, field: string) {
  return `market:${market}:${matchId}:${field}`;
}

const goalRangeOptions = [
  ["0-1", "0-1"],
  ["2-3", "2-3"],
  ["4-5", "4-5"],
  ["6+", "6+"],
];

const firstGoalMinuteOptions = [
  ["NO_GOAL", "Sin gol"],
  ["1-15", "1-15"],
  ["16-30", "16-30"],
  ["31-45_PLUS", "31-45+"],
  ["46-60", "46-60"],
  ["61-75", "61-75"],
  ["76-90_PLUS", "76-90+"],
  ["EXTRA_TIME", "Tiempo extra"],
];

const yellowCardRangeOptions = [
  ["0-2", "0-2"],
  ["3-4", "3-4"],
  ["5-6", "5-6"],
  ["7+", "7+"],
];

const cornerRangeOptions = [
  ["0-6", "0-6"],
  ["7-9", "7-9"],
  ["10-12", "10-12"],
  ["13+", "13+"],
];

export function RoomMarketFields({
  match,
  markets,
  answers,
}: {
  match: MarketMatch;
  markets: RoomMarketKey[];
  answers: Partial<Record<RoomMarketKey, MarketAnswerValue>>;
}) {
  const availableMarkets = bonusMarketsForStage(markets, match.stage);
  if (availableMarkets.length === 0) return null;
  const definitions = availableMarkets
    .map((market) => roomMarketCatalog.find((item) => item.key === market))
    .filter((item): item is RoomMarketDefinition => Boolean(item));
  const groups = ["goals", "discipline", "knockout", "advanced"] as const;
  const groupLabels = {
    goals: "Goles y resultado",
    discipline: "Disciplina",
    knockout: "Definicion de eliminatoria",
    advanced: "Estadisticas especiales",
  };

  return (
    <div className="room-market-fields">
      {/* Marca que este partido si trae sus bonus en el form; sin esto el server no puede
          distinguir "sin pick" de "campos no renderizados" y borraria lo guardado. */}
      <input type="hidden" name={`marketsShown:${match.id}`} value="1" />
      {groups.map((group) => {
        const items = definitions.filter((definition) => definition.group === group);
        if (items.length === 0) return null;
        return (
          <section className="room-market-group" key={group}>
            <h4>{groupLabels[group]}</h4>
            <div className="room-market-grid">
              {items.map((definition) => (
                <div className="room-market-pick" key={definition.key}>
                  <div className="room-market-pick-head">
                    <strong>{definition.label}</strong>
                    <small>{definition.description}</small>
                  </div>
                  <MarketInput
                    market={definition.key}
                    match={match}
                    value={answers[definition.key]}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MarketInput({
  market,
  match,
  value,
}: {
  market: RoomMarketKey;
  match: MarketMatch;
  value?: MarketAnswerValue;
}) {
  if (market === "HALFTIME_SCORE") {
    return (
      <div className="room-market-score-inputs">
        <input
          type="number"
          min="0"
          name={marketFieldName(market, match.id, "home")}
          defaultValue={stringValue(value, "home")}
          aria-label={`${match.home} al descanso`}
        />
        <span>:</span>
        <input
          type="number"
          min="0"
          name={marketFieldName(market, match.id, "away")}
          defaultValue={stringValue(value, "away")}
          aria-label={`${match.away} al descanso`}
        />
      </div>
    );
  }

  if (
    market === "BOTH_TEAMS_SCORE" ||
    market === "PENALTY_IN_MATCH" ||
    market === "PENALTY_SCORED" ||
    market === "RED_CARD_IN_MATCH" ||
    market === "EXTRA_TIME" ||
    market === "PENALTY_SHOOTOUT" ||
    market === "COMEBACK_WIN" ||
    market === "GOAL_IN_BOTH_HALVES"
  ) {
    return (
      <ChoiceGroup
        name={marketFieldName(market, match.id, "value")}
        value={stringValue(value, "value")}
        options={[["", "Sin pick"], ["YES", "Si"], ["NO", "No"]]}
      />
    );
  }

  if (
    market === "HALFTIME_RESULT" ||
    market === "SECOND_HALF_RESULT"
  ) {
    return (
      <ChoiceGroup
        name={marketFieldName(market, match.id, "value")}
        value={stringValue(value, "value")}
        options={[["", "Sin pick"], ["HOME", optionName(match, "HOME")], ["DRAW", "Empate"], ["AWAY", optionName(match, "AWAY")]]}
      />
    );
  }

  if (market === "DOUBLE_CHANCE") {
    return (
      <ChoiceGroup
        name={marketFieldName(market, match.id, "value")}
        value={stringValue(value, "value")}
        options={[["", "Sin pick"], ["HOME_DRAW", `${optionName(match, "HOME")} o empate`], ["HOME_AWAY", `${optionName(match, "HOME")} o ${optionName(match, "AWAY")}`], ["DRAW_AWAY", `Empate o ${optionName(match, "AWAY")}`]]}
      />
    );
  }

  if (market === "OVER_UNDER_2_5") {
    return (
      <ChoiceGroup
        name={marketFieldName(market, match.id, "value")}
        value={stringValue(value, "value")}
        options={[["", "Sin pick"], ["OVER_2_5", "Mas de 2.5"], ["UNDER_2_5", "Menos de 2.5"]]}
      />
    );
  }

  if (market === "ODD_EVEN_TOTAL_GOALS") {
    return (
      <ChoiceGroup
        name={marketFieldName(market, match.id, "value")}
        value={stringValue(value, "value")}
        options={[["", "Sin pick"], ["EVEN", "Par"], ["ODD", "Impar"]]}
      />
    );
  }

  if (market === "HIGHEST_SCORING_HALF") {
    return (
      <ChoiceGroup
        name={marketFieldName(market, match.id, "value")}
        value={stringValue(value, "value")}
        options={[["", "Sin pick"], ["FIRST_HALF", "Primer tiempo"], ["SECOND_HALF", "Segundo tiempo"], ["EQUAL", "Igual cantidad"]]}
      />
    );
  }

  if (
    market === "FIRST_GOAL_TEAM" ||
    market === "LAST_GOAL_TEAM" ||
    market === "CLEAN_SHEET" ||
    market === "WIN_TO_NIL" ||
    market === "PENALTY_AWARDED_TEAM" ||
    market === "RED_CARD_TEAM" ||
    market === "TEAM_MOST_CORNERS" ||
    market === "TEAM_MOST_CARDS"
  ) {
    return (
      <ChoiceGroup
        name={marketFieldName(market, match.id, "side")}
        value={stringValue(value, "side")}
        options={[["", "Sin pick"], ["HOME", optionName(match, "HOME")], ["AWAY", optionName(match, "AWAY")], ["NONE", "Ninguno"]]}
      />
    );
  }

  if (market === "TEAM_TOTAL_GOALS") {
    return (
      <div className="room-market-combo">
        <select name={marketFieldName(market, match.id, "side")} defaultValue={stringValue(value, "side")}>
          <option value="">Equipo</option>
          <option value="HOME">{optionName(match, "HOME")}</option>
          <option value="AWAY">{optionName(match, "AWAY")}</option>
        </select>
        <input
          type="number"
          min="0"
          name={marketFieldName(market, match.id, "total")}
          defaultValue={stringValue(value, "total")}
          aria-label="Goles del equipo"
        />
      </div>
    );
  }

  if (market === "WIN_MARGIN" || market === "EXACT_TOTAL_GOALS") {
    return (
      <input
        type="number"
        min="0"
        name={marketFieldName(market, match.id, "value")}
        defaultValue={stringValue(value, "value")}
        placeholder={market === "WIN_MARGIN" ? "Diferencia" : "Total"}
      />
    );
  }

  if (market === "TOTAL_GOALS") {
    return <RangeSelect market={market} matchId={match.id} value={value} options={goalRangeOptions} />;
  }

  if (market === "FIRST_GOAL_MINUTE_RANGE") {
    const options = match.stage === "GROUP"
      ? firstGoalMinuteOptions.filter(([optionValue]) => optionValue !== "EXTRA_TIME")
      : firstGoalMinuteOptions;
    return <RangeSelect market={market} matchId={match.id} value={value} options={options} />;
  }

  if (market === "YELLOW_CARD_RANGE") {
    return <RangeSelect market={market} matchId={match.id} value={value} options={yellowCardRangeOptions} />;
  }

  if (market === "TOTAL_CORNERS_RANGE") {
    return <RangeSelect market={market} matchId={match.id} value={value} options={cornerRangeOptions} />;
  }

  return null;
}

function RangeSelect({
  market,
  matchId,
  value,
  options,
}: {
  market: RoomMarketKey;
  matchId: string;
  value?: MarketAnswerValue;
  options: string[][];
}) {
  return (
    <ChoiceGroup
      name={marketFieldName(market, matchId, "value")}
      value={stringValue(value, "value")}
      options={[["", "Sin pick"], ...options]}
    />
  );
}

function ChoiceGroup({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: string[][];
}) {
  return (
    <div className="market-choice-grid">
      {options.map(([optionValue, label]) => (
        <label className="market-choice" key={optionValue || "empty"}>
          <input
            type="radio"
            name={name}
            value={optionValue}
            defaultChecked={value === optionValue}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
