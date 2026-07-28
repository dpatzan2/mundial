"use client";

import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

// ponytail: <dialog> nativo (foco atrapado, Esc y backdrop gratis) en vez de una libreria de modales.
export function ConfirmButton({
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  tone = "danger",
  className,
  disabled = false,
  pendingText = "Guardando...",
  children,
}: {
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "primary";
  className?: string;
  disabled?: boolean;
  pendingText?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();
  const isBlocked = disabled || pending;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className ?? (tone === "danger" ? "danger-button" : "primary-button")}
        disabled={isBlocked}
        onClick={() => dialogRef.current?.showModal()}
      >
        {pending ? pendingText : children}
      </button>

      <dialog ref={dialogRef} className="app-dialog">
        <h3>{title}</h3>
        <div className="app-dialog-body">{message}</div>
        <div className="app-dialog-actions">
          <button type="button" className="ghost-button" onClick={() => dialogRef.current?.close()}>
            {cancelText}
          </button>
          <button
            type="button"
            className={tone === "danger" ? "danger-button" : "primary-button"}
            onClick={() => {
              dialogRef.current?.close();
              buttonRef.current?.form?.requestSubmit();
            }}
          >
            {confirmText}
          </button>
        </div>
      </dialog>
    </>
  );
}
