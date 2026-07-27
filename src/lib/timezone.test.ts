import assert from "node:assert/strict";
import test from "node:test";
import { parseAppDateTime, toAppDateTimeInput } from "./timezone";

test("el input datetime-local muestra hora de Guatemala, no UTC", () => {
  // 2026-06-11T14:00 GT se guarda como 20:00 UTC; el form debe volver a mostrar 14:00.
  const saved = parseAppDateTime("2026-06-11T14:00");
  assert.equal(saved?.toISOString(), "2026-06-11T20:00:00.000Z");
  assert.equal(toAppDateTimeInput(saved), "2026-06-11T14:00");
});

test("reeditar sin tocar la fecha no la mueve", () => {
  let date = parseAppDateTime("2026-07-19T19:30");
  for (let i = 0; i < 3; i += 1) date = parseAppDateTime(toAppDateTimeInput(date));
  assert.equal(date?.toISOString(), "2026-07-20T01:30:00.000Z");
});

test("sin fecha devuelve vacio", () => {
  assert.equal(toAppDateTimeInput(null), "");
});
