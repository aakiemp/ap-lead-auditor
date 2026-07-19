import type { ReactNode } from "react";

/**
 * Every empty state should say what happened and, when there's a
 * useful next step, offer exactly one action -- never a generic
 * "Nothing here" with no explanation (see CLAUDE.md Roadmap /
 * Phase 12: "each should explain what happened").
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center">
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
