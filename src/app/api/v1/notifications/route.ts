import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";

  const [recipients, unreadCount] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { notification: { createdAt: "desc" } },
      take: 30,
      select: {
        readAt: true,
        notification: {
          select: {
            id: true,
            title: true,
            body: true,
            createdAt: true,
            roomId: true,
            room: { select: { name: true } },
          },
        },
      },
    }),
    prisma.notificationRecipient.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return NextResponse.json(
    {
      notifications: recipients.map((recipient) => ({
        id: recipient.notification.id,
        title: recipient.notification.title,
        body: recipient.notification.body,
        createdAt: recipient.notification.createdAt,
        roomId: recipient.notification.roomId,
        roomName: recipient.notification.room.name,
        read: recipient.readAt !== null,
      })),
      unreadCount,
    },
    { headers: { "Cache-Control": "private, max-age=2" } },
  );
}
