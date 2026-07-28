import assert from "node:assert/strict";
import test from "node:test";
import { rulesAtKickoff } from "./score-recalculation";

const version = (effectiveFrom: string, exactScorePoints: number) =>
  ({ effectiveFrom: new Date(effectiveFrom), exactScorePoints }) as never;

// ruleVersions llega ordenado desc por effectiveFrom, igual que en la consulta.
const room = {
  ruleSet: { exactScorePoints: 9 } as never,
  ruleVersions: [version("2026-07-28T10:00:00Z", 9), version("1970-01-01T00:00:00Z", 3)],
};

test("un partido posterior a la edicion usa las reglas nuevas", () => {
  const rules = rulesAtKickoff(room, new Date("2026-07-28T20:00:00Z"));
  assert.equal(rules?.exactScorePoints, 9);
});

test("un partido anterior a la edicion conserva las reglas viejas", () => {
  const rules = rulesAtKickoff(room, new Date("2026-07-27T20:00:00Z"));
  assert.equal(rules?.exactScorePoints, 3);
});

test("sala sin versiones usa las reglas actuales", () => {
  const rules = rulesAtKickoff({ ruleSet: { exactScorePoints: 5 } as never, ruleVersions: [] }, new Date());
  assert.equal(rules?.exactScorePoints, 5);
});

test("partido sin fecha usa las reglas actuales", () => {
  assert.equal(rulesAtKickoff(room, null)?.exactScorePoints, 9);
});
