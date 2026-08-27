import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { applyMatchResult, isFixtureFinished, verifyIntegrationSecret } from "@/lib/football-integration";

const bodySchema = z.object({
  match_id: z.string().min(1),
  home_score: z.number().int().min(0),
  away_score: z.number().int().min(0),
  status: z.string().min(1),
});

/**
 * Variante de /result que identifica el partido por nuestro id interno en vez de un
 * externalFixtureId de un proveedor de datos. La usa el flujo de n8n que resuelve el
 * marcador via busqueda por IA (AI Agent + Tavily) en lugar de una API de futbol.
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
  const { match_id: matchId, home_score: homeScore, away_score: awayScore, status } = parsed.data;

  if (!isFixtureFinished(status)) {
    return NextResponse.json({ ignored: true, reason: "NOT_FINISHED" }, { status: 202 });
  }

  const outcome = await applyMatchResult(prisma, matchId, homeScore, awayScore);
  if ("error" in outcome) {
    return NextResponse.json(outcome, { status: 404 });
  }
  return NextResponse.json(outcome);
}
