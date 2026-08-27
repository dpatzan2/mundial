import assert from "node:assert/strict";
import test from "node:test";
import { isFixtureFinished, normalizeTeamName, verifyIntegrationSecret } from "@/lib/football-integration";

test("isFixtureFinished recognizes FT, AET and PEN regardless of case", () => {
  assert.equal(isFixtureFinished("FT"), true);
  assert.equal(isFixtureFinished("aet"), true);
  assert.equal(isFixtureFinished("Pen"), true);
});

test("isFixtureFinished rejects in-progress statuses", () => {
  assert.equal(isFixtureFinished("LIVE"), false);
  assert.equal(isFixtureFinished("HT"), false);
  assert.equal(isFixtureFinished("NS"), false);
});

test("normalizeTeamName strips accents, dots and extra spacing", () => {
  assert.equal(normalizeTeamName("Atlético Nacional"), "ATLETICO NACIONAL");
  assert.equal(normalizeTeamName("C.F. Pachuca"), "CF PACHUCA");
  assert.equal(normalizeTeamName("  Real   Madrid  "), "REAL MADRID");
});

test("verifyIntegrationSecret accepts a matching X-Webhook-Secret header", () => {
  process.env.FOOTBALL_INTEGRATION_SECRET = "shared-secret";
  const request = new Request("https://example.com/webhook", {
    headers: { "x-webhook-secret": "shared-secret" },
  });
  assert.equal(verifyIntegrationSecret(request), true);
});

test("verifyIntegrationSecret accepts a matching Bearer token", () => {
  process.env.FOOTBALL_INTEGRATION_SECRET = "shared-secret";
  const request = new Request("https://example.com/webhook", {
    headers: { authorization: "Bearer shared-secret" },
  });
  assert.equal(verifyIntegrationSecret(request), true);
});

test("verifyIntegrationSecret rejects a wrong or missing secret", () => {
  process.env.FOOTBALL_INTEGRATION_SECRET = "shared-secret";
  const wrongHeader = new Request("https://example.com/webhook", {
    headers: { "x-webhook-secret": "nope" },
  });
  const noHeader = new Request("https://example.com/webhook");
  assert.equal(verifyIntegrationSecret(wrongHeader), false);
  assert.equal(verifyIntegrationSecret(noHeader), false);
});

test("verifyIntegrationSecret rejects everything when the env var is unset", () => {
  delete process.env.FOOTBALL_INTEGRATION_SECRET;
  const request = new Request("https://example.com/webhook", {
    headers: { "x-webhook-secret": "shared-secret" },
  });
  assert.equal(verifyIntegrationSecret(request), false);
});
