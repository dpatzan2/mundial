import assert from "node:assert/strict";
import test from "node:test";
import type { DisplayMatch } from "./match-ui";
import { derivedMarkets, derivedMarketResult } from "./market-result-display";
import { roomMarketCatalog } from "./room-presets";

const finished = { home: "A", away: "B", homeScore: 2, awayScore: 1 } as DisplayMatch;

test("derivedMarkets coincide con lo que derivedMarketResult sabe calcular", () => {
  for (const { key } of roomMarketCatalog) {
    assert.equal(
      derivedMarketResult(key, finished) !== null,
      derivedMarkets.includes(key),
      `${key} esta desincronizado entre derivedMarkets y derivedMarketResult`,
    );
  }
});

test("goles por equipo se derivan para ambos equipos", () => {
  assert.deepEqual(derivedMarketResult("TEAM_TOTAL_GOALS", finished), { home: 2, away: 1 });
});
