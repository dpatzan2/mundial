import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PickSide } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recalculateScoresInScope } from "@/lib/score-recalculation";
import { isFixtureFinished, notifyRoomsForMatch, verifyIntegrationSecret } from "@/lib/football-integration";

const bodySchema = z.object({
  fixture_id: z.number().int(),
  home_score: z.number().int().min(0),
  away_score: z.number().int().min(0),
  status: z.string().min(1),
});

/**
 * Webhook final del flujo de n8n: se llama una vez que el partido ya termino (FT/AET/PEN).
 * Actualiza el marcador, recalcula puntos de todas las salas afectadas y genera las
 * notificaciones in-app de "Resultados actualizados".
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
  const { fixture_id: fixtureId, home_score: homeScore, away_score: awayScore, status } = parsed.data;

  if (!isFixtureFinished(status)) {
    return NextResponse.json({ ignored: true, reason: "NOT_FINISHED" }, { status: 202 });
  }

  const existing = await prisma.competitionMatch.findUnique({
    where: { externalFixtureId: fixtureId },
    select: { id: true, homeTeamId: true, awayTeamId: true, status: true, homeScore: true, awayScore: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });
  }

  const alreadyProcessed =
    existing.status === "FINISHED" && existing.homeScore === homeScore && existing.awayScore === awayScore;
  if (alreadyProcessed) {
    return NextResponse.json({ updated: false, alreadyFinished: true, matchId: existing.id });
  }

  const actualWinnerSide: PickSide | null =
    homeScore === awayScore ? null : homeScore > awayScore ? "HOME" : "AWAY";
  const actualWinnerTeamId =
    actualWinnerSide === "HOME"
      ? existing.homeTeamId
      : actualWinnerSide === "AWAY"
        ? existing.awayTeamId
        : null;

  await prisma.$transaction(
    async (tx) => {
      await tx.competitionMatch.update({
        where: { id: existing.id },
        data: { homeScore, awayScore, status: "FINISHED", actualWinnerSide, actualWinnerTeamId },
      });
      await recalculateScoresInScope(tx, { matchId: existing.id });
      await notifyRoomsForMatch(tx, existing.id, homeScore, awayScore);
    },
    { maxWait: 5_000, timeout: 20_000 },
  );

  revalidatePath("/admin");
  revalidatePath("/calendar");
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  revalidatePath("/rooms");

  return NextResponse.json({ updated: true, matchId: existing.id });
}
