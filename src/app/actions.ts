"use server";

import {
  Role,
  type PickSide,
  type CompetitionPhaseFormat,
  type CompetitionStatus,
  type RoomConfigPreset,
  type RoomDeadlineMode,
  type PopularPredictionsVisibility,
  type RoomMemberRole,
  type TournamentType,
  MatchStatus,
  Prisma,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { signIn, signOut, requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canParticipateInPool } from "@/lib/participants";
import { championPickDeadlineAt, computePhaseDeadlines, DEVELOPMENT_PHASE_UNLOCKS, isMatchLockedForPicks, roomDeadlineConfig } from "@/lib/phase-deadlines";
import { SCORING_SETTINGS_ID } from "@/lib/scoring-settings";
import { syncWc2026Matches } from "@/lib/wc2026";
import type { ActionFeedbackState } from "@/lib/form-action-state";
import { safeRedirectPath } from "@/lib/session-cookie";
import { recalculateScoresInScope, refreshRoomLeaderboards } from "@/lib/score-recalculation";
import {
  bonusMarketsFor,
  bonusMarketsForStage,
  marketsForPreset,
  parseEnabledMarkets,
  roomMarketCatalog,
  type RoomMarketKey,
} from "@/lib/room-presets";
import { parseAppDateTime } from "@/lib/timezone";

function readInt(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function uniqueCompetitionSlug(name: string) {
  const base = slugify(name) || `competencia-${Date.now().toString(36)}`;
  for (let index = 0; index < 20; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await prisma.competition.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function generateRoomAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function createUniqueRoomAccessCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const accessCode = generateRoomAccessCode();
    const existing = await prisma.room.findUnique({ where: { accessCode } });
    if (!existing) return accessCode;
  }

  return `${generateRoomAccessCode()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
}

async function requireRoomManager(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      members: true,
      ruleSet: true,
    },
  });

  if (!room) redirect("/rooms?error=room-not-found");

  const membership = room.members.find((member) => member.userId === userId);
  if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
    redirect(`/rooms/${roomId}?error=forbidden`);
  }

  return { room, membership };
}

async function requireRoomOwner(roomId: string, userId: string) {
  const context = await requireRoomManager(roomId, userId);
  if (context.membership.role !== "OWNER") {
    redirect(`/rooms/${roomId}?error=owner-required`);
  }
  return context;
}

export type SavePredictionsState = ActionFeedbackState;

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(String(formData.get("next") ?? ""));
  const ok = await signIn(username, password);
  if (!ok) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export async function registerAction(formData: FormData) {
  const schema = z.object({
    username: z.string().trim().min(3).max(40),
    displayName: z.string().trim().min(2).max(80),
    password: z.string().min(6),
  });

  const parsed = schema.safeParse({
    username: String(formData.get("username") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    redirect("/register?error=invalid");
  }

  const existing = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });

  if (existing) {
    redirect("/register?error=taken");
  }

  await prisma.user.create({
    data: {
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      role: Role.PLAYER,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
    },
  });

  await signIn(parsed.data.username, parsed.data.password);
  redirect("/dashboard");
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}

export async function createCompetitionAction(formData: FormData) {
  await requireAdmin();

  const schema = z.object({
    name: z.string().trim().min(2).max(120),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    season: z.string().trim().max(40).optional(),
    countryCode: z.string().trim().max(8).optional(),
    logoUrl: z.string().trim().max(500).optional(),
    bannerUrl: z.string().trim().max(500).optional(),
    startsAt: z.string().trim().optional(),
    endsAt: z.string().trim().optional(),
  });

  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? ""),
    status: String(formData.get("status") ?? "DRAFT"),
    season: String(formData.get("season") ?? ""),
    countryCode: String(formData.get("countryCode") ?? ""),
    logoUrl: String(formData.get("logoUrl") ?? ""),
    bannerUrl: String(formData.get("bannerUrl") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
  });

  if (!parsed.success) redirect("/admin?error=competition");

  const competition = await prisma.competition.create({
    data: {
      name: parsed.data.name,
      slug: await uniqueCompetitionSlug(parsed.data.name),
      type: "CUSTOM",
      status: parsed.data.status as CompetitionStatus,
      season: parsed.data.season || null,
      countryCode: parsed.data.countryCode || null,
      logoUrl: parsed.data.logoUrl || null,
      bannerUrl: parsed.data.bannerUrl || null,
      startsAt: parseAppDateTime(parsed.data.startsAt),
      endsAt: parseAppDateTime(parsed.data.endsAt),
    },
  });

  revalidatePath("/admin");
  revalidatePath("/calendar");
  redirect(`/admin/${competition.id}`);
}

export async function createCompetitionPhaseAction(formData: FormData) {
  await requireAdmin();

  const schema = z.object({
    competitionId: z.string().trim().min(1),
    name: z.string().trim().min(2).max(100),
    stage: z
      .enum(["GROUP", "ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL"])
      .optional(),
    format: z.enum(["GROUP", "KNOCKOUT", "LEAGUE"]),
    sortOrder: z.coerce.number().int().min(0).max(999),
    groupCode: z.string().trim().max(12).optional(),
    automaticQualifiers: z.coerce.number().int().min(0).max(64),
    bestThirdQualifiers: z.coerce.number().int().min(0).max(64),
    startsAt: z.string().trim().optional(),
    endsAt: z.string().trim().optional(),
  });

  const rawStage = String(formData.get("stage") ?? "");
  const parsed = schema.safeParse({
    competitionId: String(formData.get("competitionId") ?? ""),
    name: String(formData.get("name") ?? ""),
    stage: rawStage || undefined,
    format: String(formData.get("format") ?? "GROUP"),
    sortOrder: formData.get("sortOrder") ?? "0",
    groupCode: String(formData.get("groupCode") ?? ""),
    automaticQualifiers: formData.get("automaticQualifiers") ?? "0",
    bestThirdQualifiers: formData.get("bestThirdQualifiers") ?? "0",
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
  });

  if (!parsed.success) redirect("/admin?error=phase");

  await prisma.competitionPhase.create({
    data: {
      competitionId: parsed.data.competitionId,
      name: parsed.data.name,
      stage: parsed.data.stage ?? null,
      format: parsed.data.format as CompetitionPhaseFormat,
      sortOrder: parsed.data.sortOrder,
      groupCode: parsed.data.groupCode || null,
      automaticQualifiers: parsed.data.automaticQualifiers,
      bestThirdQualifiers: parsed.data.bestThirdQualifiers,
      startsAt: parseAppDateTime(parsed.data.startsAt),
      endsAt: parseAppDateTime(parsed.data.endsAt),
    },
  });

  revalidatePath("/admin");
  revalidatePath("/calendar");
  redirect(`/admin/${parsed.data.competitionId}?tab=phases&created=phase`);
}

async function syncTeamLogosJson() {
  try {
    const teams = await prisma.team.findMany({
      where: { logoUrl: { not: null } },
      select: { normalizedName: true, logoUrl: true },
    });

    const logosMap: Record<string, string> = {};
    for (const t of teams) {
      if (t.logoUrl) {
        logosMap[t.normalizedName] = t.logoUrl;
      }
    }

    const filePath = path.join(process.cwd(), "src/lib/team-logos.json");
    fs.writeFileSync(filePath, JSON.stringify(logosMap, null, 2), "utf-8");
  } catch (error) {
    console.error("Error syncing team-logos.json:", error);
  }
}

export async function createCompetitionTeamAction(formData: FormData) {
  await requireAdmin();

  const nameSelect = String(formData.get("nameSelect") ?? "").trim();
  const customName = String(formData.get("customName") ?? "").trim();
  const resolvedName = nameSelect === "__NEW__" ? customName : nameSelect;

  const schema = z.object({
    competitionId: z.string().trim().min(1),
    name: z.string().trim().min(2).max(100),
    groupCode: z.string().trim().max(12).optional(),
  });

  const parsed = schema.safeParse({
    competitionId: String(formData.get("competitionId") ?? ""),
    name: resolvedName,
    groupCode: String(formData.get("groupCode") ?? ""),
  });

  if (!parsed.success) redirect("/admin?error=team");

  // Create team in the global catalog if it's a new custom team
  const formLogoUrl = String(formData.get("logoUrl") ?? "").trim() || null;
  if (nameSelect === "__NEW__") {
    await prisma.team.upsert({
      where: {
        normalizedName: normalizeText(customName),
      },
      update: {
        name: customName,
        logoUrl: formLogoUrl
      },
      create: {
        name: customName,
        normalizedName: normalizeText(customName),
        logoUrl: formLogoUrl
      },
    });
  }

  // Resolve logoUrl
  const globalTeam = await prisma.team.findUnique({
    where: { normalizedName: normalizeText(parsed.data.name) },
    select: { logoUrl: true }
  });
  const logoUrl = globalTeam?.logoUrl ?? formLogoUrl;

  await prisma.competitionTeam.upsert({
    where: {
      competitionId_normalizedName: {
        competitionId: parsed.data.competitionId,
        normalizedName: normalizeText(parsed.data.name),
      },
    },
    update: {
      name: parsed.data.name,
      groupCode: parsed.data.groupCode || null,
      logoUrl,
    },
    create: {
      competitionId: parsed.data.competitionId,
      name: parsed.data.name,
      normalizedName: normalizeText(parsed.data.name),
      groupCode: parsed.data.groupCode || null,
      logoUrl,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/calendar");
  await syncTeamLogosJson();
  redirect(`/admin/${parsed.data.competitionId}?tab=teams&created=team`);
}

export async function createGlobalTeamAction(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;
  if (!name || name.length < 2) redirect("/admin?error=team-name");

  const normalized = normalizeText(name);

  // 1. Create or get global team
  await prisma.team.upsert({
    where: { normalizedName: normalized },
    update: { name, logoUrl },
    create: { name, normalizedName: normalized, logoUrl },
  });

  // 2. Associate with checked competitions
  const selectedComps = formData.getAll("competitions").map(String);
  for (const compId of selectedComps) {
    await prisma.competitionTeam.upsert({
      where: {
        competitionId_normalizedName: {
          competitionId: compId,
          normalizedName: normalized,
        },
      },
      update: { name, logoUrl },
      create: {
        competitionId: compId,
        name,
        normalizedName: normalized,
        logoUrl,
      },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/calendar");
  // Also revalidate the specific competitions
  for (const compId of selectedComps) {
    revalidatePath(`/admin/${compId}`);
  }

  await syncTeamLogosJson();
  redirect("/admin?created=global-team");
}

export async function updateGlobalTeamAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;

  if (!id || name.length < 2) {
    redirect("/admin/teams?error=invalid");
  }

  const normalized = normalizeText(name);

  const oldTeam = await prisma.team.findUnique({
    where: { id },
    select: { normalizedName: true },
  });

  if (!oldTeam) {
    redirect("/admin/teams?error=notfound");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: { id },
        data: { name, normalizedName: normalized, logoUrl },
      });

      await tx.competitionTeam.updateMany({
        where: { normalizedName: oldTeam.normalizedName },
        data: { name, normalizedName: normalized, logoUrl },
      });
    });
  } catch (err) {
    console.error(err);
    redirect("/admin/teams?error=duplicate");
  }

  revalidatePath("/admin/teams");
  revalidatePath("/admin");
  await syncTeamLogosJson();
  redirect("/admin/teams?saved=team");
}

export async function createCompetitionMatchAction(formData: FormData) {
  await requireAdmin();

  const schema = z.object({
    competitionId: z.string().trim().min(1),
    phaseId: z.string().trim().optional(),
    matchNumber: z.coerce.number().int().min(1).max(9999).optional(),
    homeTeamId: z.string().trim().optional(),
    awayTeamId: z.string().trim().optional(),
    homePlaceholder: z.string().trim().max(80).optional(),
    awayPlaceholder: z.string().trim().max(80).optional(),
    kickoffAt: z.string().trim().optional(),
    venue: z.string().trim().max(120).optional(),
  });

  const matchNumberRaw = String(formData.get("matchNumber") ?? "").trim();
  const parsed = schema.safeParse({
    competitionId: String(formData.get("competitionId") ?? ""),
    phaseId: String(formData.get("phaseId") ?? ""),
    matchNumber: matchNumberRaw ? matchNumberRaw : undefined,
    homeTeamId: String(formData.get("homeTeamId") ?? ""),
    awayTeamId: String(formData.get("awayTeamId") ?? ""),
    homePlaceholder: String(formData.get("homePlaceholder") ?? ""),
    awayPlaceholder: String(formData.get("awayPlaceholder") ?? ""),
    kickoffAt: String(formData.get("kickoffAt") ?? ""),
    venue: String(formData.get("venue") ?? ""),
  });

  if (!parsed.success) redirect("/admin?error=match");

  await prisma.competitionMatch.create({
    data: {
      competitionId: parsed.data.competitionId,
      phaseId: parsed.data.phaseId || null,
      matchNumber: parsed.data.matchNumber ?? null,
      homeTeamId: parsed.data.homeTeamId || null,
      awayTeamId: parsed.data.awayTeamId || null,
      homePlaceholder: parsed.data.homePlaceholder || null,
      awayPlaceholder: parsed.data.awayPlaceholder || null,
      kickoffAt: parseAppDateTime(parsed.data.kickoffAt),
      venue: parsed.data.venue || null,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/calendar");
  redirect(`/admin/${parsed.data.competitionId}?tab=matches&created=match`);
}

export async function updateCompetitionMatchAction(formData: FormData) {
  await requireAdmin();

  const schema = z.object({
    id: z.string().trim().min(1),
    competitionId: z.string().trim().min(1),
    phaseId: z.string().trim().optional(),
    matchNumber: z.coerce.number().int().min(1),
    kickoffAt: z.string().trim().optional(),
    venue: z.string().trim().optional(),
    homeTeamId: z.string().trim().optional(),
    awayTeamId: z.string().trim().optional(),
    homePlaceholder: z.string().trim().optional(),
    awayPlaceholder: z.string().trim().optional(),
  });

  const parsed = schema.safeParse({
    id: String(formData.get("id") ?? ""),
    competitionId: String(formData.get("competitionId") ?? ""),
    phaseId: String(formData.get("phaseId") ?? ""),
    matchNumber: formData.get("matchNumber"),
    kickoffAt: String(formData.get("kickoffAt") ?? ""),
    venue: String(formData.get("venue") ?? ""),
    homeTeamId: String(formData.get("homeTeamId") ?? ""),
    awayTeamId: String(formData.get("awayTeamId") ?? ""),
    homePlaceholder: String(formData.get("homePlaceholder") ?? ""),
    awayPlaceholder: String(formData.get("awayPlaceholder") ?? ""),
  });

  if (!parsed.success) {
    redirect(`/admin/${formData.get("competitionId")}?tab=matches&error=update`);
  }

  const {
    id,
    competitionId,
    phaseId,
    matchNumber,
    kickoffAt,
    venue,
    homeTeamId,
    awayTeamId,
    homePlaceholder,
    awayPlaceholder,
  } = parsed.data;

  const updatedCompMatch = await prisma.competitionMatch.update({
    where: { id },
    data: {
      phaseId: phaseId || null,
      matchNumber,
      kickoffAt: parseAppDateTime(kickoffAt),
      venue: venue || null,
      homeTeamId: homeTeamId || null,
      awayTeamId: awayTeamId || null,
      homePlaceholder: homePlaceholder || null,
      awayPlaceholder: awayPlaceholder || null,
    },
    include: {
      phase: true,
      homeTeam: true,
      awayTeam: true,
    }
  });

  const legacyMatch = await prisma.match.findUnique({
    where: { id },
  });

  if (legacyMatch) {
    let homeLegacyId: string | null = null;
    let awayLegacyId: string | null = null;

    if (updatedCompMatch.homeTeam) {
      let t = await prisma.team.findFirst({
        where: {
          OR: [
            { name: updatedCompMatch.homeTeam.name },
            { normalizedName: updatedCompMatch.homeTeam.normalizedName },
          ],
        },
      });
      if (!t) {
        t = await prisma.team.create({
          data: { name: updatedCompMatch.homeTeam.name, normalizedName: updatedCompMatch.homeTeam.normalizedName },
        });
      }
      homeLegacyId = t.id;
    }

    if (updatedCompMatch.awayTeam) {
      let t = await prisma.team.findFirst({
        where: {
          OR: [
            { name: updatedCompMatch.awayTeam.name },
            { normalizedName: updatedCompMatch.awayTeam.normalizedName },
          ],
        },
      });
      if (!t) {
        t = await prisma.team.create({
          data: { name: updatedCompMatch.awayTeam.name, normalizedName: updatedCompMatch.awayTeam.normalizedName },
        });
      }
      awayLegacyId = t.id;
    }

    const mappedGroupCode = updatedCompMatch.phase?.groupCode || updatedCompMatch.phase?.name || null;
    const mappedStage = updatedCompMatch.phase?.stage ?? "GROUP";

    await prisma.match.update({
      where: { id },
      data: {
        stage: mappedStage,
        groupCode: mappedGroupCode,
        kickoffAt: updatedCompMatch.kickoffAt,
        venue: updatedCompMatch.venue,
        homeTeamId: homeLegacyId,
        awayTeamId: awayLegacyId,
        homePlaceholder: updatedCompMatch.homePlaceholder,
        awayPlaceholder: updatedCompMatch.awayPlaceholder,
      },
    });
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/${competitionId}`);
  revalidatePath("/calendar");
  redirect(`/admin/${competitionId}?tab=matches&saved=match`);
}

export async function updateCompetitionAction(formData: FormData) {
  await requireAdmin();

  const schema = z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(2).max(120),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    season: z.string().trim().max(40).optional(),
    countryCode: z.string().trim().max(8).optional(),
    logoUrl: z.string().trim().max(500).optional(),
    bannerUrl: z.string().trim().max(500).optional(),
    championTeamId: z.string().trim().optional(),
    startsAt: z.string().trim().optional(),
    endsAt: z.string().trim().optional(),
  });

  const parsed = schema.safeParse({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    status: String(formData.get("status") ?? "DRAFT"),
    season: String(formData.get("season") ?? ""),
    countryCode: String(formData.get("countryCode") ?? ""),
    logoUrl: String(formData.get("logoUrl") ?? ""),
    bannerUrl: String(formData.get("bannerUrl") ?? ""),
    championTeamId: String(formData.get("championTeamId") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
  });

  if (!parsed.success) redirect(`/admin?error=update`);

  await prisma.competition.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      status: parsed.data.status as CompetitionStatus,
      season: parsed.data.season || null,
      countryCode: parsed.data.countryCode || null,
      logoUrl: parsed.data.logoUrl || null,
      bannerUrl: parsed.data.bannerUrl || null,
      championTeamId: parsed.data.championTeamId || null,
      startsAt: parseAppDateTime(parsed.data.startsAt),
      endsAt: parseAppDateTime(parsed.data.endsAt),
    },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/${parsed.data.id}`);
  revalidatePath("/calendar");
  await recalculateScores();
  redirect(`/admin/${parsed.data.id}?saved=competition`);
}

export async function deleteCompetitionAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin");

  await prisma.competition.delete({ where: { id } });

  revalidatePath("/admin");
  revalidatePath("/calendar");
  redirect("/admin?deleted=competition");
}

export async function deleteCompetitionPhaseAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const competitionId = String(formData.get("competitionId") ?? "").trim();
  if (!id || !competitionId) redirect("/admin");

  await prisma.competitionPhase.delete({ where: { id } });

  revalidatePath("/admin");
  revalidatePath(`/admin/${competitionId}`);
  revalidatePath("/calendar");
  redirect(`/admin/${competitionId}?tab=phases&deleted=phase`);
}

export async function updateCompetitionPhaseAction(formData: FormData) {
  await requireAdmin();
  const schema = z.object({
    id: z.string().trim().min(1),
    competitionId: z.string().trim().min(1),
    name: z.string().trim().min(2).max(100),
    stage: z
      .enum(["GROUP", "ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL"])
      .optional(),
    format: z.enum(["GROUP", "KNOCKOUT", "LEAGUE"]),
    sortOrder: z.coerce.number().int().min(0).max(999),
    groupCode: z.string().trim().max(12).optional(),
    automaticQualifiers: z.coerce.number().int().min(0).max(64),
    bestThirdQualifiers: z.coerce.number().int().min(0).max(64),
    startsAt: z.string().trim().optional(),
    endsAt: z.string().trim().optional(),
  });
  const rawStage = String(formData.get("stage") ?? "");
  const parsed = schema.safeParse({
    id: String(formData.get("id") ?? ""),
    competitionId: String(formData.get("competitionId") ?? ""),
    name: String(formData.get("name") ?? ""),
    stage: rawStage || undefined,
    format: String(formData.get("format") ?? "GROUP"),
    sortOrder: formData.get("sortOrder") ?? "0",
    groupCode: String(formData.get("groupCode") ?? ""),
    automaticQualifiers: formData.get("automaticQualifiers") ?? "0",
    bestThirdQualifiers: formData.get("bestThirdQualifiers") ?? "0",
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
  });
  if (!parsed.success) redirect("/admin?error=phase-rules");

  await prisma.competitionPhase.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      stage: parsed.data.stage ?? null,
      format: parsed.data.format as CompetitionPhaseFormat,
      sortOrder: parsed.data.sortOrder,
      groupCode: parsed.data.groupCode || null,
      automaticQualifiers: parsed.data.automaticQualifiers,
      bestThirdQualifiers: parsed.data.bestThirdQualifiers,
      startsAt: parseAppDateTime(parsed.data.startsAt),
      endsAt: parseAppDateTime(parsed.data.endsAt),
    },
  });
  revalidatePath(`/admin/${parsed.data.competitionId}`);
  revalidatePath("/calendar");
  redirect(`/admin/${parsed.data.competitionId}?tab=phases&saved=rules`);
}

export async function deleteCompetitionTeamAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const competitionId = String(formData.get("competitionId") ?? "").trim();
  if (!id || !competitionId) redirect("/admin");

  await prisma.competitionTeam.delete({ where: { id } });

  revalidatePath("/admin");
  revalidatePath(`/admin/${competitionId}`);
  revalidatePath("/calendar");
  redirect(`/admin/${competitionId}?tab=teams&deleted=team`);
}

export async function deleteCompetitionMatchAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const competitionId = String(formData.get("competitionId") ?? "").trim();
  if (!id || !competitionId) redirect("/admin");

  await prisma.competitionMatch.delete({ where: { id } });

  revalidatePath("/admin");
  revalidatePath(`/admin/${competitionId}`);
  revalidatePath("/calendar");
  redirect(`/admin/${competitionId}?tab=matches&deleted=match`);
}

export async function saveCompetitionMatchResultAction(formData: FormData) {
  await requireAdmin();

  const competitionId = String(formData.get("competitionId") ?? "").trim();
  const matchId = String(formData.get("matchId") ?? "").trim();
  if (!competitionId || !matchId) redirect("/admin");

  const homeScore = readInt(formData.get(`actualHome:${matchId}`));
  const awayScore = readInt(formData.get(`actualAway:${matchId}`));
  const winnerSideRaw = formData.get(`actualWinner:${matchId}`);
  const status = String(formData.get(`status:${matchId}`) ?? "SCHEDULED");

  if (status === "FINISHED" && (homeScore === null || awayScore === null)) {
    redirect(`/admin/${competitionId}?tab=matches&editMatchId=${matchId}&error=missing-score`);
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.competitionMatch.findUnique({
      where: { id: matchId },
      select: { homeTeamId: true, awayTeamId: true },
    });
    if (!current) throw new Error("Competition match not found");

    const actualWinnerSide: PickSide | null =
      winnerSideRaw === "HOME" || winnerSideRaw === "AWAY"
        ? winnerSideRaw as PickSide
        : homeScore !== null && awayScore !== null && homeScore !== awayScore
          ? homeScore > awayScore ? "HOME" : "AWAY"
          : null;
    const actualWinnerTeamId =
      actualWinnerSide === "HOME"
        ? current.homeTeamId
        : actualWinnerSide === "AWAY"
          ? current.awayTeamId
          : null;

    await tx.competitionMatch.update({
      where: { id: matchId },
      data: {
        homeScore,
        awayScore,
        status: status as MatchStatus,
        actualWinnerSide,
        actualWinnerTeamId,
      },
    });

    // 3. Save MatchMarketResults for all manual markets
    const manualMarkets = roomMarketCatalog
      .map((m) => m.key)
      .filter((k) => k !== "EXACT_SCORE" && k !== "MATCH_OUTCOME" && k !== "ADVANCING_TEAM");

    await saveMatchMarketResults({
      db: tx,
      matchId,
      markets: manualMarkets,
      formData,
      competitionMatch: true,
    });
    await recalculateScoresInScope(tx, { matchId });
  }, { maxWait: 5_000, timeout: 20_000 });

  revalidatePath("/admin");
  revalidatePath(`/admin/${competitionId}`);
  revalidatePath("/calendar");
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  revalidatePath("/rooms");

  redirect(`/admin/${competitionId}?tab=matches&saved=match-result`);
}

export async function createRoomAction(formData: FormData) {
  const user = await requireUser();
  const schema = z.object({
    name: z.string().trim().min(3).max(80),
    tournamentName: z.string().trim().min(2).max(100),
    tournamentType: z.enum([
      "WORLD_CUP",
      "INTERNATIONAL_CUP",
      "CLUB_TOURNAMENT",
      "DOMESTIC_LEAGUE",
      "CUSTOM",
    ]),
    configPreset: z.enum(["BASIC", "INTERMEDIATE", "COMPLETE", "CUSTOM"]),
    deadlineMode: z.enum(["PER_MATCH", "PHASE"]),
    deadlineHoursBefore: z.coerce.number().int().min(0).max(168),
    popularPredictionsVisibility: z.enum(["ALWAYS", "AFTER_PICK", "AFTER_DEADLINE", "HIDDEN"]),
    championPickEnabled: z.boolean(),
    championPickPoints: z.coerce.number().int().min(0).max(99),
  });

  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? ""),
    tournamentName: String(formData.get("tournamentName") ?? ""),
    tournamentType: String(formData.get("tournamentType") ?? "WORLD_CUP"),
    configPreset: String(formData.get("configPreset") ?? "BASIC"),
    deadlineMode: String(formData.get("deadlineMode") ?? "PER_MATCH"),
    deadlineHoursBefore: formData.get("deadlineHoursBefore") ?? "1",
    popularPredictionsVisibility: String(formData.get("popularPredictionsVisibility") ?? "AFTER_PICK"),
    championPickEnabled: formData.get("championPickEnabled") === "on",
    championPickPoints: formData.get("championPickPoints") ?? "5",
  });

  if (!parsed.success) {
    redirect("/rooms/new?error=invalid");
  }

  const competitionId = formData.get("competitionId") ? String(formData.get("competitionId")) : null;
  const accessCode = await createUniqueRoomAccessCode();
  const configPreset = parsed.data.configPreset as RoomConfigPreset;
  // CUSTOM respeta los mercados marcados en el paso de revision; el resto usa su preset.
  const customMarkets = parseEnabledMarkets(formData.getAll("market"));
  const enabledMarkets =
    configPreset === "CUSTOM" && customMarkets.length > 0
      ? customMarkets
      : marketsForPreset(configPreset);

  const room = await prisma.room.create({
    data: {
      name: parsed.data.name,
      tournamentName: parsed.data.tournamentName,
      tournamentType: parsed.data.tournamentType as TournamentType,
      externalTournamentId: competitionId,
      configPreset,
      deadlineMode: parsed.data.deadlineMode as RoomDeadlineMode,
      deadlineHoursBefore: parsed.data.deadlineHoursBefore,
      popularPredictionsVisibility:
        parsed.data.popularPredictionsVisibility as PopularPredictionsVisibility,
      championPickEnabled: parsed.data.championPickEnabled,
      championPickPoints: parsed.data.championPickPoints,
      accessCode,
      ownerId: user.id,
      members: {
        create: {
          userId: user.id,
          role: "OWNER",
        },
      },
      ruleSet: {
        create: {
          preset: configPreset,
          enabledMarkets,
        },
      },
      leaderboardEntries: {
        create: { userId: user.id },
      },
    },
  });

  revalidatePath("/rooms");
  redirect(`/rooms/${room.id}`);
}

export async function joinRoomAction(formData: FormData) {
  const user = await requireUser();
  const accessCode = String(formData.get("accessCode") ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "");

  if (!accessCode) {
    redirect("/rooms/join?error=invalid");
  }

  const room = await prisma.room.findUnique({ where: { accessCode } });
  if (!room || room.status !== "ACTIVE") {
    redirect("/rooms/join?error=not-found");
  }

  await prisma.roomMember.upsert({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
    update: {},
    create: {
      roomId: room.id,
      userId: user.id,
      role: "MEMBER",
    },
  });
  await refreshRoomLeaderboards(prisma, [room.id]);

  revalidatePath("/rooms");
  redirect(`/rooms/${room.id}`);
}

export async function updateRoomSettingsAction(formData: FormData) {
  const user = await requireUser();
  const schema = z.object({
    roomId: z.string().trim().min(1),
    name: z.string().trim().min(3).max(80),
    tournamentName: z.string().trim().max(100).optional(),
    tournamentType: z.enum([
      "WORLD_CUP",
      "INTERNATIONAL_CUP",
      "CLUB_TOURNAMENT",
      "DOMESTIC_LEAGUE",
      "CUSTOM",
    ]).optional(),
    configPreset: z.enum(["BASIC", "INTERMEDIATE", "COMPLETE", "CUSTOM"]),
    deadlineMode: z.enum(["PER_MATCH", "PHASE"]),
    deadlineHoursBefore: z.coerce.number().int().min(0).max(168),
    popularPredictionsVisibility: z.enum(["ALWAYS", "AFTER_PICK", "AFTER_DEADLINE", "HIDDEN"]),
    championPickEnabled: z.boolean(),
    championPickPoints: z.coerce.number().int().min(0).max(99),
    exactScorePoints: z.coerce.number().int().min(0).max(99),
    outcomePoints: z.coerce.number().int().min(0).max(99),
    advancePickPoints: z.coerce.number().int().min(0).max(99),
  });

  const parsed = schema.safeParse({
    roomId: String(formData.get("roomId") ?? ""),
    name: String(formData.get("name") ?? ""),
    tournamentName: formData.get("tournamentName") ? String(formData.get("tournamentName")) : undefined,
    tournamentType: formData.get("tournamentType") ? String(formData.get("tournamentType")) : undefined,
    configPreset: String(formData.get("configPreset") ?? ""),
    deadlineMode: String(formData.get("deadlineMode") ?? "PER_MATCH"),
    deadlineHoursBefore: formData.get("deadlineHoursBefore") ?? "1",
    popularPredictionsVisibility: String(formData.get("popularPredictionsVisibility") ?? "AFTER_PICK"),
    championPickEnabled: formData.get("championPickEnabled") === "on",
    championPickPoints: formData.get("championPickPoints") ?? "5",
    exactScorePoints: formData.get("exactScorePoints"),
    outcomePoints: formData.get("outcomePoints"),
    advancePickPoints: formData.get("advancePickPoints"),
  });

  if (!parsed.success) {
    console.error("updateRoomSettingsAction schema validation failed:", parsed.error.format());
    redirect(`/rooms/${formData.get("roomId")}/settings?error=invalid-settings`);
  }

  await requireRoomManager(parsed.data.roomId, user.id);
  const configPreset = parsed.data.configPreset as RoomConfigPreset;
  const selectedMarkets = new Set(
    formData
      .getAll("enabledMarkets")
      .map((value) => String(value))
      .filter((value): value is RoomMarketKey =>
        roomMarketCatalog.some((market) => market.key === value),
      ),
  );
  const enabledMarkets =
    configPreset === "CUSTOM" && selectedMarkets.size > 0
      ? Array.from(selectedMarkets)
      : marketsForPreset(configPreset);
  const marketPoints = Object.fromEntries(
    roomMarketCatalog.map((market) => {
      const raw = readInt(formData.get(`marketPoints:${market.key}`));
      return [market.key, raw ?? market.defaultPoints];
    }),
  );
  const customMarketConfig = {
    marketPoints,
  };

  const competitionId = formData.get("competitionId") ? String(formData.get("competitionId")).trim() : null;

  let tournamentName = parsed.data.tournamentName || "";
  let tournamentType = (parsed.data.tournamentType as TournamentType) || "CUSTOM";

  if (competitionId) {
    const comp = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { name: true, type: true }
    });
    if (comp) {
      tournamentName = comp.name;
      tournamentType = comp.type;
    }
  }

  if (!tournamentName || tournamentName.trim().length < 2) {
    console.error("updateRoomSettingsAction failed: tournamentName is required and must be min 2 chars");
    redirect(`/rooms/${parsed.data.roomId}/settings?error=invalid-tournament-name`);
  }

  await prisma.room.update({
    where: { id: parsed.data.roomId },
    data: {
      name: parsed.data.name,
      tournamentName,
      tournamentType,
      externalTournamentId: competitionId,
      configPreset,
      deadlineMode: parsed.data.deadlineMode as RoomDeadlineMode,
      deadlineHoursBefore: parsed.data.deadlineHoursBefore,
      popularPredictionsVisibility:
        parsed.data.popularPredictionsVisibility as PopularPredictionsVisibility,
      championPickEnabled: parsed.data.championPickEnabled,
      championPickPoints: parsed.data.championPickPoints,
      ruleSet: {
        upsert: {
          update: {
            preset: configPreset,
            exactScorePoints: parsed.data.exactScorePoints,
            outcomePoints: parsed.data.outcomePoints,
            advancePickPoints: parsed.data.advancePickPoints,
            enabledMarkets,
            customMarketConfig,
          },
          create: {
            preset: configPreset,
            exactScorePoints: parsed.data.exactScorePoints,
            outcomePoints: parsed.data.outcomePoints,
            advancePickPoints: parsed.data.advancePickPoints,
            enabledMarkets,
            customMarketConfig,
          },
        },
      },
    },
  });

  await recalculateScores(parsed.data.roomId);
  revalidatePath("/rooms");
  revalidatePath(`/rooms/${parsed.data.roomId}`);
  revalidatePath(`/rooms/${parsed.data.roomId}/settings`);
  revalidatePath(`/rooms/${parsed.data.roomId}/leaderboard`);
  redirect(`/rooms/${parsed.data.roomId}/settings?saved=1`);
}

export async function regenerateRoomCodeAction(formData: FormData) {
  const user = await requireUser();
  const roomId = String(formData.get("roomId") ?? "").trim();
  if (!roomId) redirect("/rooms");

  await requireRoomOwner(roomId, user.id);
  await prisma.room.update({
    where: { id: roomId },
    data: { accessCode: await createUniqueRoomAccessCode() },
  });

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${roomId}`);
  revalidatePath(`/rooms/${roomId}/settings`);
  redirect(`/rooms/${roomId}/settings?code=updated`);
}

export async function deleteRoomAction(formData: FormData) {
  const user = await requireUser();
  const roomId = String(formData.get("roomId") ?? "").trim();
  if (!roomId) redirect("/rooms");

  await requireRoomOwner(roomId, user.id);

  await prisma.room.delete({
    where: { id: roomId },
  });

  revalidatePath("/rooms");
  redirect("/rooms?deleted=1");
}

export async function updateRoomMemberRoleAction(formData: FormData) {
  const user = await requireUser();
  const roomId = String(formData.get("roomId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  const role = String(formData.get("role") ?? "") as RoomMemberRole;
  if (!roomId || !memberId || (role !== "ADMIN" && role !== "MEMBER")) {
    redirect(roomId ? `/rooms/${roomId}/settings?error=invalid-member` : "/rooms");
  }

  await requireRoomOwner(roomId, user.id);
  const target = await prisma.roomMember.findFirst({
    where: { id: memberId, roomId },
  });

  if (!target || target.role === "OWNER") {
    redirect(`/rooms/${roomId}/settings?error=invalid-member`);
  }

  await prisma.roomMember.update({
    where: { id: memberId },
    data: { role },
  });

  revalidatePath(`/rooms/${roomId}`);
  revalidatePath(`/rooms/${roomId}/settings`);
  redirect(`/rooms/${roomId}/settings?members=updated`);
}

export async function removeRoomMemberAction(formData: FormData) {
  const user = await requireUser();
  const roomId = String(formData.get("roomId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!roomId || !memberId) redirect(roomId ? `/rooms/${roomId}/settings` : "/rooms");

  const { membership } = await requireRoomManager(roomId, user.id);
  const target = await prisma.roomMember.findFirst({
    where: { id: memberId, roomId },
  });

  if (!target || target.role === "OWNER") {
    redirect(`/rooms/${roomId}/settings?error=invalid-member`);
  }

  const isSelf = target.userId === user.id;
  const canRemove =
    isSelf ||
    membership.role === "OWNER" ||
    (membership.role === "ADMIN" && target.role === "MEMBER");

  if (!canRemove) {
    redirect(`/rooms/${roomId}/settings?error=forbidden`);
  }

  await prisma.roomMember.delete({ where: { id: memberId } });
  revalidatePath("/rooms");
  revalidatePath(`/rooms/${roomId}`);
  revalidatePath(`/rooms/${roomId}/settings`);
  redirect(isSelf ? "/rooms" : `/rooms/${roomId}/settings?members=updated`);
}

export async function savePredictionsAction(
  _prevState: SavePredictionsState | null,
  formData: FormData,
): Promise<SavePredictionsState> {
  try {
    const user = await requireUser();
    if (!canParticipateInPool(user)) {
      return {
        ok: false,
        message: "Tu cuenta no puede participar en la quiniela.",
      };
    }

    const matches = await prisma.match.findMany({
      orderBy: { matchNumber: "asc" },
    });
    const phaseDeadlines = computePhaseDeadlines(matches);

    for (const match of matches) {
      if (isMatchLockedForPicks(match, phaseDeadlines)) continue;

      const predictedHomeScore = readInt(formData.get(`homeScore:${match.id}`));
      const predictedAwayScore = readInt(formData.get(`awayScore:${match.id}`));
      const side = formData.get(`winnerSide:${match.id}`);
      const predictedWinnerSide =
        predictedHomeScore !== null && predictedAwayScore !== null
          ? predictedHomeScore > predictedAwayScore
            ? "HOME"
            : predictedAwayScore > predictedHomeScore
              ? "AWAY"
              : side === "HOME" || side === "AWAY"
                ? side
                : null
          : null;

      if (match.stage === "GROUP") {
        if (predictedHomeScore === null || predictedAwayScore === null) continue;
        await savePredictionForMatch({
          userId: user.id,
          matchId: match.id,
          data: {
            predictedHomeScore,
            predictedAwayScore,
            predictedWinnerSide: null,
            predictedWinnerTeamId: null,
            points: 0,
          },
        });
      } else if (
        predictedHomeScore !== null &&
        predictedAwayScore !== null &&
        predictedWinnerSide
      ) {
        const teamId = predictedWinnerSide === "HOME" ? match.homeTeamId : match.awayTeamId;
        await savePredictionForMatch({
          userId: user.id,
          matchId: match.id,
          data: {
            predictedHomeScore,
            predictedAwayScore,
            predictedWinnerSide,
            predictedWinnerTeamId: teamId,
            points: 0,
          },
        });
      }
    }

    await recalculateScores();
    revalidatePath("/picks");
    revalidatePath("/leaderboard");

    return {
      ok: true,
      message: "Pronosticos guardados correctamente.",
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("savePredictionsAction failed", error);
    return {
      ok: false,
      message: "No se pudieron guardar los pronosticos. Intenta de nuevo.",
    };
  }
}

export async function saveRoomPredictionsAction(
  _prevState: SavePredictionsState | null,
  formData: FormData,
): Promise<SavePredictionsState> {
  try {
    const user = await requireUser();
    const roomId = String(formData.get("roomId") ?? "").trim();
    if (!roomId) {
      return {
        ok: false,
        message: "No se pudo identificar la sala.",
      };
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: true,
        ruleSet: true,
        competition: {
          include: {
            teams: true,
            matches: { include: { phase: true }, orderBy: { kickoffAt: "asc" } },
          },
        },
      },
    });

    if (!room || room.status !== "ACTIVE") {
      return {
        ok: false,
        message: "Esta sala no esta disponible.",
      };
    }

    const membership = room.members.find((member) => member.userId === user.id);
    if (!membership) {
      return {
        ok: false,
        message: "No perteneces a esta sala.",
      };
    }

    if (!room.competition) {
      return {
        ok: false,
        message: "La sala no tiene una competencia activa asociada.",
      };
    }

    const matches = room.competition.matches.map((match) => ({
      ...match,
      stage: match.phase?.stage ?? "GROUP" as const,
    }));
    const deadlineConfig = roomDeadlineConfig(room);
    const phaseDeadlines = computePhaseDeadlines(matches, new Date(), deadlineConfig);
    const enabledMarkets = parseEnabledMarkets(room.ruleSet?.enabledMarkets);
    const bonusMarkets = bonusMarketsFor(enabledMarkets);
    const matchIds = matches.map((match) => match.id);

    const [existingPredictions, existingAnswers] = await Promise.all([
      prisma.prediction.findMany({
        where: { roomId, userId: user.id, competitionMatchId: { in: matchIds } },
      }),
      prisma.predictionAnswer.findMany({
        where: { roomId, userId: user.id, competitionMatchId: { in: matchIds } },
      }),
    ]);

    const predictionByMatch = new Map(
      existingPredictions.map((prediction) => [prediction.competitionMatchId, prediction]),
    );
    const answerByMatchAndMarket = new Map(
      existingAnswers.map((answer) => [
        `${answer.competitionMatchId}:${answer.marketKey}`,
        answer,
      ]),
    );

    for (const match of matches) {
      if (isMatchLockedForPicks(match, phaseDeadlines, new Date(), deadlineConfig)) continue;

      const predictedHomeScore = readInt(formData.get(`homeScore:${match.id}`));
      const predictedAwayScore = readInt(formData.get(`awayScore:${match.id}`));
      const side = formData.get(`winnerSide:${match.id}`);
      const predictedWinnerSide =
        predictedHomeScore !== null && predictedAwayScore !== null
          ? predictedHomeScore > predictedAwayScore
            ? "HOME"
            : predictedAwayScore > predictedHomeScore
              ? "AWAY"
              : side === "HOME" || side === "AWAY"
                ? side
                : null
          : null;

      const existingPred = predictionByMatch.get(match.id);

      if (match.stage === "GROUP") {
        if (predictedHomeScore !== null && predictedAwayScore !== null) {
          const changed =
            !existingPred ||
            existingPred.predictedHomeScore !== predictedHomeScore ||
            existingPred.predictedAwayScore !== predictedAwayScore ||
            existingPred.predictedWinnerSide !== null ||
            existingPred.predictedWinnerTeamId !== null ||
            existingPred.predictedWinnerCompetitionTeamId !== null;

          if (changed) {
            if (existingPred) {
              await prisma.prediction.update({
                where: { id: existingPred.id },
                data: {
                  predictedHomeScore,
                  predictedAwayScore,
                  predictedWinnerSide: null,
                  predictedWinnerTeamId: null,
                  predictedWinnerCompetitionTeamId: null,
                  points: 0,
                },
              });
            } else {
              await prisma.prediction.create({
                data: {
                  roomId,
                  userId: user.id,
                  competitionMatchId: match.id,
                  predictedHomeScore,
                  predictedAwayScore,
                  predictedWinnerSide: null,
                  predictedWinnerTeamId: null,
                  points: 0,
                },
              });
            }
          }
        }
      } else if (
        predictedHomeScore !== null &&
        predictedAwayScore !== null &&
        predictedWinnerSide
      ) {
        const teamId = predictedWinnerSide === "HOME" ? match.homeTeamId : match.awayTeamId;

        const changed =
          !existingPred ||
          existingPred.predictedHomeScore !== predictedHomeScore ||
          existingPred.predictedAwayScore !== predictedAwayScore ||
          existingPred.predictedWinnerSide !== predictedWinnerSide ||
          existingPred.predictedWinnerCompetitionTeamId !== teamId;

        if (changed) {
          if (existingPred) {
            await prisma.prediction.update({
              where: { id: existingPred.id },
              data: {
                predictedHomeScore,
                predictedAwayScore,
                predictedWinnerSide,
                predictedWinnerTeamId: null,
                predictedWinnerCompetitionTeamId: teamId,
                points: 0,
              },
            });
          } else {
            await prisma.prediction.create({
              data: {
                roomId,
                userId: user.id,
                competitionMatchId: match.id,
                predictedHomeScore,
                predictedAwayScore,
                predictedWinnerSide,
                predictedWinnerCompetitionTeamId: teamId,
                points: 0,
              },
            });
          }
        }
      }

      // Sync market answers (only write to DB on change or deletion)
      // Los partidos de otra fecha/fase no renderizan sus bonus, asi que el form no los trae;
      // sin este guard cada guardado borraba los bonus del resto de partidos.
      const marketsInForm = formData.has(`marketsShown:${match.id}`);

      for (const market of marketsInForm ? bonusMarketsForStage(enabledMarkets, match.stage) : []) {
        const value = readMarketValue(formData, market, match.id);
        const existingKey = `${match.id}:${market}`;
        const existingAnswer = answerByMatchAndMarket.get(existingKey);

        if (!value) {
          if (existingAnswer) {
            await prisma.predictionAnswer.delete({ where: { id: existingAnswer.id } });
          }
          continue;
        }

        const valueJson = JSON.stringify(value);
        const existingJson = existingAnswer ? JSON.stringify(existingAnswer.value) : null;

        if (!existingAnswer) {
          await prisma.predictionAnswer.create({
            data: {
              roomId,
              userId: user.id,
              competitionMatchId: match.id,
              marketKey: market,
              value: value as Prisma.InputJsonValue,
            },
          });
        } else if (valueJson !== existingJson) {
          await prisma.predictionAnswer.update({
            where: { id: existingAnswer.id },
            data: { value: value as Prisma.InputJsonValue, points: 0 },
          });
        }
      }
    }

    const championTeamId = String(formData.get("championTeamId") ?? "").trim();
    const championDeadline = championPickDeadlineAt(matches, room.deadlineHoursBefore);
    const championOpen =
      DEVELOPMENT_PHASE_UNLOCKS ||
      !championDeadline ||
      new Date() < championDeadline;
    const validChampion = room.competition.teams.some((team) => team.id === championTeamId);

    if (room.championPickEnabled && championOpen && validChampion) {
      await prisma.roomTournamentPick.upsert({
        where: {
          roomId_userId_competitionId: {
            roomId,
            userId: user.id,
            competitionId: room.competition.id,
          },
        },
        update: { predictedTeamId: championTeamId, points: 0 },
        create: {
          roomId,
          userId: user.id,
          competitionId: room.competition.id,
          predictedTeamId: championTeamId,
        },
      });
    }

    await recalculateScores(roomId);
    revalidatePath(`/rooms/${roomId}`);
    revalidatePath(`/rooms/${roomId}/picks`);
    revalidatePath(`/rooms/${roomId}/leaderboard`);

    return {
      ok: true,
      message: "Pronosticos guardados correctamente.",
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("saveRoomPredictionsAction failed", error);
    return {
      ok: false,
      message: "No se pudieron guardar los pronosticos. Intenta de nuevo.",
    };
  }
}

export async function createUserAction(
  _prevState: ActionFeedbackState | null,
  formData: FormData,
): Promise<ActionFeedbackState> {
  try {
    await requireAdmin();

    const schema = z.object({
      username: z.string().trim().min(3).max(40),
      displayName: z.string().trim().min(2).max(80),
      password: z.string().min(6),
      role: z.enum(["ADMIN", "PLAYER"]),
    });

    const parsed = schema.safeParse({
      username: String(formData.get("username") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      password: String(formData.get("password") ?? ""),
      role: String(formData.get("role") ?? "PLAYER"),
    });

    if (!parsed.success) {
      return {
        ok: false,
        message: "Revisa los datos del nuevo usuario.",
      };
    }

    const existing = await prisma.user.findUnique({
      where: { username: parsed.data.username },
    });

    if (existing) {
      return {
        ok: false,
        message: "Ese nombre de usuario ya existe.",
      };
    }

    await prisma.user.create({
      data: {
        username: parsed.data.username,
        displayName: parsed.data.displayName,
        role: parsed.data.role as Role,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
      },
    });

    revalidatePath("/admin");

    return {
      ok: true,
      message: "Usuario creado correctamente.",
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("createUserAction failed", error);
    return {
      ok: false,
      message: "No se pudo crear el usuario. Intenta de nuevo.",
    };
  }
}

export async function deleteUserAction(
  _prevState: ActionFeedbackState | null,
  formData: FormData,
): Promise<ActionFeedbackState> {
  try {
    const admin = await requireAdmin();
    const userId = String(formData.get("userId") ?? "").trim();

    if (!userId) {
      return {
        ok: false,
        message: "No se pudo eliminar el usuario.",
      };
    }

    if (userId === admin.id) {
      return {
        ok: false,
        message: "No puedes eliminar tu propia cuenta.",
      };
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return {
        ok: false,
        message: "Ese usuario ya no existe.",
      };
    }

    if (target.role === Role.ADMIN) {
      const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
      if (adminCount <= 1) {
        return {
          ok: false,
          message: "No puedes eliminar al unico administrador.",
        };
      }
    }

    await prisma.user.delete({ where: { id: userId } });

    revalidatePath("/admin");
    revalidatePath("/leaderboard");
    revalidatePath("/dashboard");

    return {
      ok: true,
      message: `${target.displayName} fue eliminado.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("deleteUserAction failed", error);
    return {
      ok: false,
      message: "No se pudo eliminar el usuario. Intenta de nuevo.",
    };
  }
}

export async function saveResultsAction(
  _prevState: ActionFeedbackState | null,
  formData: FormData,
): Promise<ActionFeedbackState> {
  try {
    await requireAdmin();
    const matches = await prisma.match.findMany({ orderBy: { matchNumber: "asc" } });
    const bonusMarkets = bonusMarketsFor(marketsForPreset("CUSTOM"));

    for (const match of matches) {
      const homeScore = readInt(formData.get(`actualHome:${match.id}`));
      const awayScore = readInt(formData.get(`actualAway:${match.id}`));
      const winnerSideRaw = formData.get(`actualWinner:${match.id}`);
      const homeTeamId = String(formData.get(`homeTeam:${match.id}`) ?? "") || null;
      const awayTeamId = String(formData.get(`awayTeam:${match.id}`) ?? "") || null;

      let actualWinnerSide: PickSide | null = null;
      let actualWinnerTeamId: string | null = null;

      if (winnerSideRaw === "HOME" || winnerSideRaw === "AWAY") {
        actualWinnerSide = winnerSideRaw;
        actualWinnerTeamId = winnerSideRaw === "HOME" ? homeTeamId : awayTeamId;
      } else if (match.stage === "GROUP" && homeScore !== null && awayScore !== null) {
        actualWinnerSide = homeScore === awayScore ? null : homeScore > awayScore ? "HOME" : "AWAY";
      }

      await prisma.match.update({
        where: { id: match.id },
        data: {
          homeTeamId,
          awayTeamId,
          homeScore,
          awayScore,
          actualWinnerSide,
          actualWinnerTeamId,
          status:
            match.stage === "GROUP"
              ? homeScore !== null && awayScore !== null
                ? "FINISHED"
                : "SCHEDULED"
              : actualWinnerSide
                ? "FINISHED"
                : "SCHEDULED",
        },
      });

      await saveMatchMarketResults({
        matchId: match.id,
        markets: bonusMarkets,
        formData,
      });
    }

    await recalculateScores();
    revalidatePath("/admin");
    revalidatePath("/leaderboard");
    revalidatePath("/dashboard");
    revalidatePath("/rooms");

    return {
      ok: true,
      message: "Resultados guardados correctamente.",
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("saveResultsAction failed", error);
    return {
      ok: false,
      message: "No se pudieron guardar los resultados. Intenta de nuevo.",
    };
  }
}

export async function syncWc2026Action(
  _prevState: ActionFeedbackState | null,
): Promise<ActionFeedbackState> {
  void _prevState;

  try {
    await requireAdmin();
    await syncWc2026Matches();
    await recalculateScores();
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");

    return {
      ok: true,
      message: "Partidos sincronizados desde la API.",
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("syncWc2026Action failed", error);
    return {
      ok: false,
      message: "No se pudo sincronizar la API. Intenta de nuevo.",
    };
  }
}

async function savePredictionForMatch({
  roomId = null,
  userId,
  matchId,
  data,
}: {
  roomId?: string | null;
  userId: string;
  matchId: string;
  data: {
    predictedHomeScore: number;
    predictedAwayScore: number;
    predictedWinnerSide?: PickSide | null;
    predictedWinnerTeamId?: string | null;
    points: number;
  };
}) {
  const existing = await prisma.prediction.findFirst({
    where: {
      roomId,
      userId,
      matchId,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.prediction.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  await prisma.prediction.create({
    data: {
      roomId,
      userId,
      matchId,
      ...data,
    },
  });
}

function readMarketValue(formData: FormData, market: RoomMarketKey, matchId: string) {
  const field = (name: string) => formData.get(`market:${market}:${matchId}:${name}`);

  if (market === "HALFTIME_SCORE") {
    const home = readInt(field("home"));
    const away = readInt(field("away"));
    if (home === null || away === null) return null;
    return { home, away };
  }

  if (
    market === "TOTAL_GOALS" ||
    market === "FIRST_GOAL_MINUTE_RANGE" ||
    market === "YELLOW_CARD_RANGE" ||
    market === "TOTAL_CORNERS_RANGE" ||
    market === "HALFTIME_RESULT" ||
    market === "SECOND_HALF_RESULT" ||
    market === "DOUBLE_CHANCE" ||
    market === "OVER_UNDER_2_5" ||
    market === "ODD_EVEN_TOTAL_GOALS" ||
    market === "HIGHEST_SCORING_HALF"
  ) {
    const value = String(field("value") ?? "").trim();
    return value ? { value } : null;
  }

  if (
    market === "BOTH_TEAMS_SCORE" ||
    market === "PENALTY_IN_MATCH" ||
    market === "PENALTY_SCORED" ||
    market === "RED_CARD_IN_MATCH" ||
    market === "EXTRA_TIME" ||
    market === "PENALTY_SHOOTOUT" ||
    market === "COMEBACK_WIN" ||
    market === "GOAL_IN_BOTH_HALVES"
  ) {
    const value = String(field("value") ?? "").trim();
    if (value !== "YES" && value !== "NO") return null;
    return { value };
  }

  if (
    market === "FIRST_GOAL_TEAM" ||
    market === "LAST_GOAL_TEAM" ||
    market === "TEAM_TOTAL_GOALS" ||
    market === "CLEAN_SHEET" ||
    market === "WIN_TO_NIL" ||
    market === "PENALTY_AWARDED_TEAM" ||
    market === "RED_CARD_TEAM" ||
    market === "TEAM_MOST_CORNERS" ||
    market === "TEAM_MOST_CARDS"
  ) {
    const side = String(field("side") ?? "").trim();
    if (side !== "HOME" && side !== "AWAY" && side !== "NONE") return null;
    const total = market === "TEAM_TOTAL_GOALS" ? readInt(field("total")) : null;
    if (market === "TEAM_TOTAL_GOALS" && (side === "NONE" || total === null)) return null;
    return market === "TEAM_TOTAL_GOALS" ? { side, total } : { side };
  }

  if (market === "WIN_MARGIN" || market === "EXACT_TOTAL_GOALS") {
    const value = readInt(field("value"));
    return value === null ? null : { value };
  }

  return null;
}

async function saveMatchMarketResults({
  db = prisma,
  matchId,
  markets,
  formData,
  competitionMatch = false,
}: {
  db?: typeof prisma | Prisma.TransactionClient;
  matchId: string;
  markets: RoomMarketKey[];
  formData: FormData;
  competitionMatch?: boolean;
}) {
  const results = markets.flatMap((market) => {
    const value = readMarketValue(formData, market, matchId);
    return value ? [{ market, value }] : [];
  });
  const activeMarkets = new Set(results.map((result) => result.market));
  const removedMarkets = markets.filter((market) => !activeMarkets.has(market));

  if (removedMarkets.length > 0) {
    await db.matchMarketResult.deleteMany({
      where: competitionMatch
        ? { competitionMatchId: matchId, marketKey: { in: removedMarkets } }
        : { matchId, marketKey: { in: removedMarkets } },
    });
  }

  for (const { market, value } of results) {
    if (competitionMatch) {
      await db.matchMarketResult.upsert({
        where: {
          competitionMatchId_marketKey: { competitionMatchId: matchId, marketKey: market },
        },
        update: { value },
        create: { competitionMatchId: matchId, marketKey: market, value },
      });
    } else {
      await db.matchMarketResult.upsert({
        where: { matchId_marketKey: { matchId, marketKey: market } },
        update: { value },
        create: { matchId, marketKey: market, value },
      });
    }
  }
}

async function recalculateScores(roomId?: string, matchId?: string) {
  return recalculateScoresInScope(prisma, { roomId, matchId });
}

export async function saveScoringSettingsAction(
  _prevState: ActionFeedbackState | null,
  formData: FormData,
): Promise<ActionFeedbackState> {
  try {
    await requireAdmin();

    const schema = z.object({
      groupExactPoints: z.coerce.number().int().min(0).max(99),
      groupOutcomePoints: z.coerce.number().int().min(0).max(99),
      knockoutAdvancePoints: z.coerce.number().int().min(0).max(99),
    });

    const parsed = schema.safeParse({
      groupExactPoints: formData.get("groupExactPoints"),
      groupOutcomePoints: formData.get("groupOutcomePoints"),
      knockoutAdvancePoints: formData.get("knockoutAdvancePoints"),
    });

    if (!parsed.success) {
      return {
        ok: false,
        message: "Revisa los valores de puntuacion.",
      };
    }

    await prisma.scoringSettings.upsert({
      where: { id: SCORING_SETTINGS_ID },
      update: parsed.data,
      create: { id: SCORING_SETTINGS_ID, ...parsed.data },
    });

    await recalculateScores();
    revalidatePath("/admin");
    revalidatePath("/leaderboard");
    revalidatePath("/dashboard");
    revalidatePath("/picks");

    return {
      ok: true,
      message: "Reglas de puntuacion guardadas correctamente.",
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("saveScoringSettingsAction failed", error);
    return {
      ok: false,
      message: "No se pudieron guardar las reglas. Intenta de nuevo.",
    };
  }
}
