import type { ReactNode } from "react";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "test";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  neutral: "bg-zinc-100 text-zinc-600",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  test: "bg-amber-100 text-amber-700 uppercase tracking-wide",
};

/**
 * Status is always paired with a text label here, never color alone
 * (see CLAUDE.md accessibility notes) -- every call site passes real
 * words as children, this component only supplies the color/shape.
 */
export function Badge({ children, variant = "neutral" }: { children: ReactNode; variant?: BadgeVariant }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${VARIANT_STYLES[variant]}`}>
      {children}
    </span>
  );
}

export function TestDataBadge() {
  return <Badge variant="test">Test data</Badge>;
}
