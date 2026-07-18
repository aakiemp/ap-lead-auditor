"use client";

import { useActionState } from "react";

import { updateFindingStatusAction, type UpdateFindingStatusState } from "./actions";

const INITIAL_STATE: UpdateFindingStatusState = { error: null };

export function FindingStatusButton({
  businessId,
  findingId,
  targetStatus,
  label,
}: {
  businessId: string;
  findingId: string;
  targetStatus: "active" | "verified" | "dismissed";
  label: string;
}) {
  const boundAction = updateFindingStatusAction.bind(null, businessId, findingId, targetStatus);
  const [state, formAction, pending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="inline-block">
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {pending ? "…" : label}
      </button>
      {state.error ? <p className="mt-1 text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
