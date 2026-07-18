"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

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
      {state.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state.summary ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.summary}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">
                <input
                  type="checkbox"
                  checked={queueableIds.length > 0 && selected.size === queueableIds.length}
                  onChange={toggleAll}
                  disabled={queueableIds.length === 0}
                  className="h-4 w-4"
                />
              </th>
              <th className="px-4 py-2">Business</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2">Rating</th>
              <th className="px-4 py-2">Website</th>
              <th className="px-4 py-2">Audit status</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => {
              const disabled = !business.hasWebsite || business.alreadyQueued;
              return (
                <tr key={business.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      name="businessId"
                      value={business.id}
                      checked={selected.has(business.id)}
                      onChange={() => toggle(business.id)}
                      disabled={disabled}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/leads/${business.id}`} className="font-medium text-zinc-900 hover:underline">
                      {business.name}
                    </Link>
                    {business.isNew && business.duplicateWarning ? (
                      <p className="mt-0.5 text-xs text-amber-600">{business.duplicateWarning}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{business.category ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-600">
                    {[business.city, business.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {business.rating !== null
                      ? `${business.rating} (${business.reviewCount ?? 0})`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{business.hasWebsite ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-zinc-600">
                    {business.alreadyQueued ? "Already queued" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="submit"
        disabled={pending || selected.size === 0}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Queuing…" : `Queue selected (${selected.size})`}
      </button>
    </form>
  );
}
