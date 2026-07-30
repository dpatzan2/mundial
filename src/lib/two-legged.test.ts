import assert from "node:assert/strict";
import test from "node:test";
import { firstLegMatchIds } from "./two-legged";

const leg = (
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  day: number,
  stage = "SEMIFINAL",
  phaseId = "p1",
) => ({
  id,
  stage,
  phaseId,
  homeTeamId,
  awayTeamId,
  kickoffAt: new Date(2026, 5, day),
  matchNumber: day,
});

test("en una llave a doble partido solo la ida no define quien pasa", () => {
  const ids = firstLegMatchIds([leg("ida", "a", "b", 1), leg("vuelta", "b", "a", 8)]);
  assert.deepEqual([...ids], ["ida"]);
});

test("detecta la ida aunque el fixture use una fase por partido", () => {
  const ids = firstLegMatchIds([
    leg("ida", "a", "b", 1, "SEMIFINAL", "ida-phase"),
    leg("vuelta", "b", "a", 8, "SEMIFINAL", "vuelta-phase"),
  ]);
  assert.deepEqual([...ids], ["ida"]);
});

test("una llave a partido unico no tiene ida", () => {
  assert.equal(firstLegMatchIds([leg("final", "a", "b", 1)]).size, 0);
});

test("el rol de una liga repite el par pero ahi nadie pasa", () => {
  const ids = firstLegMatchIds([
    leg("j1", "a", "b", 1, "GROUP"),
    leg("j2", "b", "a", 8, "GROUP"),
  ]);
  assert.equal(ids.size, 0);
});
