import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800",
  secondary: "border border-zinc-300 text-zinc-700 hover:bg-zinc-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

/**
 * A plain <button> with the app's shared visual language. Not a form
 * or a Link -- callers still write <form action={...}> and
 * <Link href={...}> themselves; this only standardizes button
 * appearance, sizing, and disabled/pending styling.
 */
export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`min-h-[2.25rem] rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}
