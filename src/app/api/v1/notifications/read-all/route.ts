import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  const user = await requireUser();

  await prisma.notificationRecipient.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
