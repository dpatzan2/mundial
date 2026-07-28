import { notFound } from "next/navigation";
import type { RoomMemberRole, RoomRuleSet } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ScoringRules } from "@/lib/scoring-settings";

export const roomRoleLabels: Record<RoomMemberRole, string> = {
  OWNER: "Creador",
  ADMIN: "Admin",
  MEMBER: "Miembro",
};

type ScoringFields = Pick<
  RoomRuleSet,
  "exactScorePoints" | "outcomePoints" | "advancePickPoints"
>;

export function scoringRulesFromRoomRuleSet(ruleSet?: ScoringFields | null): ScoringRules {
  return {
    groupExactPoints: ruleSet?.exactScorePoints ?? 3,
    groupOutcomePoints: ruleSet?.outcomePoints ?? 1,
    knockoutAdvancePoints: ruleSet?.advancePickPoints ?? 1,
  };
}

export async function requireRoomMembership(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, displayName: true, username: true },
          },
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      },
      ruleSet: true,
    },
  });

  if (!room) notFound();

  const membership = room.members.find((member) => member.userId === userId);
  if (!membership) notFound();

  return { room, membership };
}
