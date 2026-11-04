"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./spinner";
import { buttonClass, type ButtonVariant } from "./styles";

/**
 * Form submit button. While the form is saving it shows a spinner and
 * can't be clicked again, so a slow connection never causes a double save.
 */
export function Button({
  children,
  variant = "secondary",
  ...props
}: { children: ReactNode; variant?: ButtonVariant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...props}
      disabled={props.disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClass(variant, props.className)}
    >
      {pending && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
