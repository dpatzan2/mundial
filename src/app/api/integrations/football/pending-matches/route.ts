import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPendingAutomatedMatches, verifyIntegrationSecret } from "@/lib/football-integration";

/**
 * Llamado por n8n al arrancar el cron diario: devuelve los partidos de competencias con
 * automatizacion habilitada que ya arrancaron o arrancan hoy y todavia no tienen resultado.
 * Reemplaza el paso de "resolve-fixtures" contra un proveedor externo: la fuente de la
 * agenda de partidos es nuestra propia base (ya cargada a mano por el admin), no una API de futbol.
 */
export async function GET(request: Request) {
  if (!verifyIntegrationSecret(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const matches = await getPendingAutomatedMatches(prisma);
  return NextResponse.json({ matches });
}
