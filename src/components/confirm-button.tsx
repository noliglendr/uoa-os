"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./spinner";
import { buttonClass, type ButtonVariant } from "./styles";

/**
 * Submit button that asks "Are you sure?" first. Used for permanent steps:
 * approvals (gates can't be undone), cancelling, declining and closing.
 */
export function ConfirmButton({
  children,
  confirm,
  variant = "primary",
  disabled,
  className = "",
}: {
  children: ReactNode;
  confirm: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
      className={buttonClass(variant, className)}
    >
      {pending && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
