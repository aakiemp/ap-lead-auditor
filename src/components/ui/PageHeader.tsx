import type { ReactNode } from "react";

/**
 * One PageHeader per page, one h1 inside it -- the app-wide rule for
 * a single logical h1 per page (see CLAUDE.md accessibility notes).
 * `breadcrumb` renders above the title for nested pages; top-level
 * pages (reachable directly from the sidebar) omit it.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8">
      {breadcrumb}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">{title}</h1>
          {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Breadcrumb({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
      {children}
    </nav>
  );
}
