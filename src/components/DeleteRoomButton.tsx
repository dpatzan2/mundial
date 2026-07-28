"use client";

import { Trash2 } from "lucide-react";
import { deleteRoomAction } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";

export function DeleteRoomButton({
  roomId,
  roomName,
}: {
  roomId: string;
  roomName: string;
}) {
  return (
    <form action={deleteRoomAction}>
      <input type="hidden" name="roomId" value={roomId} />
      <ConfirmButton
        title="Eliminar sala"
        message={`Se borrarán todos los miembros y pronósticos de "${roomName}". Esta acción no se puede deshacer.`}
        confirmText="Eliminar sala"
        pendingText="Eliminando..."
      >
        <Trash2 size={15} />
        Eliminar sala
      </ConfirmButton>
    </form>
  );
}
