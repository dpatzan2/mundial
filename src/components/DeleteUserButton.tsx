"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";
import { deleteUserAction } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormFeedback, useActionFeedback } from "@/components/FormFeedback";

export function DeleteUserButton({
  userId,
  displayName,
  disabled = false,
}: {
  userId: string;
  displayName: string;
  disabled?: boolean;
}) {
  const [state, action, isPending] = useActionState(deleteUserAction, null);
  const feedback = useActionFeedback(state);

  return (
    <div className="delete-user-action">
      <FormFeedback feedback={feedback} />
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <ConfirmButton
          title="Eliminar usuario"
          message={`Se borrarán los pronósticos de ${displayName}. Esta acción no se puede deshacer.`}
          confirmText="Eliminar usuario"
          pendingText="Eliminando..."
          disabled={disabled || isPending}
        >
          <Trash2 size={16} />
          <span className="sr-only">Eliminar {displayName}</span>
        </ConfirmButton>
      </form>
    </div>
  );
}
