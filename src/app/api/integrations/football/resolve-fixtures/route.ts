import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { linkFixtures, resolveFixtures, verifyIntegrationSecret } from "@/lib/football-integration";

const fixtureSchema = z.object({
  fixtureId: z.number().int(),
  leagueId: z.number().int(),
  homeTeamName: z.string().min(1),
  awayTeamName: z.string().min(1),
  kickoffAtUtc: z.string().min(1),
});

const bodySchema = z.object({ fixtures: z.array(fixtureSchema).max(200) });

/**
 * Llamado por n8n justo despues de traer los partidos del dia desde API-Football.
 * Cruza cada fixture con nuestras CompetitionMatch (por liga + nombres de equipo + kickoff)
 * y persiste el externalFixtureId para que el webhook de resultado final pueda encontrarlas.
 */
export async function POST(request: Request) {
  if (!verifyIntegrationSecret(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY", details: parsed.error.flatten() }, { status: 400 });
  }

  const resolved = await resolveFixtures(prisma, parsed.data.fixtures);
  const linked = await linkFixtures(prisma, resolved);

  return NextResponse.json({ resolved, linked });
}
