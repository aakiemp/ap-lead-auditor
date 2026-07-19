"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui";

import { queueSelectedAction, type QueueSelectedState } from "./actions";

export interface QueueableBusinessRow {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  rating: number | null;
  reviewCount: number | null;
  hasWebsite: boolean;
  alreadyQueued: boolean;
  duplicateWarning: string | null;
  isNew: boolean;
}

const INITIAL_STATE: QueueSelectedState = { error: null, summary: null };

export function QueueSelectedForm({
  searchId,
  businesses,
}: {
  searchId: string;
  businesses: QueueableBusinessRow[];
}) {
  const boundAction = queueSelectedAction.bind(null, searchId);
  const [state, formAction, pending] = useActionState(boundAction, INITIAL_STATE);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queueableIds = businesses.filter((b) => b.hasWebsite && !b.alreadyQueued).map((b) => b.id);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === queueableIds.length ? new Set() : new Set(queueableIds)));
  }

  return (
    <form action={formAction} className="space-y-4">
      <div aria-live="polite">
        {state.error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
        {state.summary ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.summary}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th scope="col" className="px-2 py-2 sm:px-4">
                <input
                  type="checkbox"
                  checked={queueableIds.length > 0 && selected.size === queueableIds.length}
                  onChange={toggleAll}
                  disabled={queueableIds.length === 0}
                  className="h-4 w-4"
                  aria-label="Select all queueable businesses"
                />
              </th>
              <th scope="col" className="px-2 py-2 sm:px-4">
                Business
              </th>
              <th scope="col" className="hidden px-4 py-2 md:table-cell">
                Category
              </th>
              <th scope="col" className="hidden px-4 py-2 lg:table-cell">
                Location
              </th>
              <th scope="col" className="hidden px-4 py-2 lg:table-cell">
                Rating
              </th>
              <th scope="col" className="px-2 py-2 sm:px-4">
                Website
              </th>
              <th scope="col" className="px-2 py-2 sm:px-4">
                Audit status
              </th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => {
              const disabled = !business.hasWebsite || business.alreadyQueued;
              return (
                <tr key={business.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-2 py-3 sm:px-4">
                    <input
                      type="checkbox"
                      name="businessId"
                      value={business.id}
                      checked={selected.has(business.id)}
                      onChange={() => toggle(business.id)}
                      disabled={disabled}
                      className="h-4 w-4"
                      aria-label={`Select ${business.name}`}
                    />
                  </td>
                  <td className="px-2 py-3 sm:px-4">
                    <Link href={`/leads/${business.id}`} className="font-medium text-zinc-900 hover:underline">
                      {business.name}
                    </Link>
                    <div className="text-xs text-zinc-400 md:hidden">
                      {[business.category, [business.city, business.state].filter(Boolean).join(", ")]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                    {business.isNew && business.duplicateWarning ? (
                      <p className="mt-0.5 text-xs text-amber-600">{business.duplicateWarning}</p>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-600 md:table-cell">{business.category ?? "—"}</td>
                  <td className="hidden px-4 py-3 text-zinc-600 lg:table-cell">
                    {[business.city, business.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-600 lg:table-cell">
                    {business.rating !== null ? `${business.rating} (${business.reviewCount ?? 0})` : "—"}
                  </td>
                  <td className="px-2 py-3 text-zinc-600 sm:px-4">{business.hasWebsite ? "Yes" : "No"}</td>
                  <td className="px-2 py-3 text-zinc-600 sm:px-4">
                    {business.alreadyQueued ? "Already queued" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button type="submit" variant="primary" disabled={pending || selected.size === 0}>
        {pending ? "Queuing…" : `Queue selected (${selected.size})`}
      </Button>
    </form>
  );
}
