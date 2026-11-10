"use client";

import { useState } from "react";
import { buttonClass } from "@/components/styles";

/** Copies an approved letter, to finish outside UOA OS. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary")}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {copied ? "Copied" : "Copy text"}
    </button>
  );
}
