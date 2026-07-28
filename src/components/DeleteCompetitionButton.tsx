"use client";

import { Trash2 } from "lucide-react";
import { deleteCompetitionAction } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";

export function DeleteCompetitionButton({
  competitionId,
  competitionName,
}: {
  competitionId: string;
  competitionName: string;
}) {
  return (
    <form action={deleteCompetitionAction}>
      <input type="hidden" name="id" value={competitionId} />
      <ConfirmButton
        title="Eliminar competencia"
        message={`Se borrarán todas las fases, equipos y partidos de "${competitionName}". Esta acción no se puede deshacer.`}
        confirmText="Eliminar competencia"
        pendingText="Eliminando..."
      >
        <Trash2 size={15} />
        Eliminar competencia
      </ConfirmButton>
    </form>
  );
}
