// Class names shared by server and client components.

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "gold" | "light";

const BUTTON = {
  primary: "bg-navy-800 text-white shadow-sm hover:bg-navy-700",
  secondary: "border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50",
  danger: "border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  // On the navy page banner:
  gold: "bg-gold-400 text-navy-950 shadow-sm hover:bg-gold-300",
  light: "bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/20",
} as const;

export function buttonClass(variant: ButtonVariant = "secondary", extra = "") {
  return `inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition duration-150 active:scale-[0.97] disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-500 disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON[variant]} ${extra}`;
}

export const inputClass =
  "h-8 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-100";
