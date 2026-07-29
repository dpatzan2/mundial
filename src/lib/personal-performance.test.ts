import assert from "node:assert/strict";
import test from "node:test";
import { personalPerformance } from "./personal-performance";

const score = (
  predictedHomeScore: number,
  predictedAwayScore: number,
  homeScore: number,
  awayScore: number,
  points: number,
) => ({ predictedHomeScore, predictedAwayScore, homeScore, awayScore, points });

// 2-1 exacto (5 pts), 3-0 acerto ganador (2 pts), 0-2 fallado.
const scores = [score(2, 1, 2, 1, 5), score(3, 0, 1, 0, 2), score(0, 2, 1, 1, 0)];

const bonus = (key: string, hits: number, points = 0) => ({
  key,
  label: key,
  attempts: 3,
  hits,
  points,
});

test("separa marcador exacto de resultado sin duplicar puntos", () => {
  const { best } = personalPerformance(scores, []);
  const exact = best.find((row) => row.key === "EXACT_SCORE")!;
  const outcome = best.find((row) => row.key === "MATCH_OUTCOME")!;

  assert.equal(exact.hits, 1);
  assert.equal(exact.points, 5);
  assert.equal(outcome.hits, 2, "el exacto tambien acierta el resultado");
  assert.equal(outcome.points, 2, "pero sus puntos ya se contaron en el exacto");
});

test("devuelve top 3 arriba y top 3 abajo sin repetir filas", () => {
  const { best, worst } = personalPerformance(scores, [
    bonus("a", 3),
    bonus("b", 3),
    bonus("c", 2),
    bonus("d", 1),
    bonus("e", 0),
  ]);

  assert.equal(best.length, 3);
  assert.equal(worst.length, 3);
  assert.equal(worst[0].key, "e", "el peor primero");
  assert.equal(best[0].accuracy, 100);
  const repeated = best.filter((row) => worst.some((other) => other.key === row.key));
  assert.deepEqual(repeated, []);
});

test("ignora tipos sin intentos suficientes", () => {
  const { best, worst } = personalPerformance([score(1, 0, 1, 0, 5)], [
    { key: "TOTAL_GOALS", label: "Total de goles", attempts: 0, hits: 0, points: 0 },
  ]);

  assert.deepEqual(best, [], "un solo partido no alcanza para sacar conclusiones");
  assert.deepEqual(worst, []);
});
