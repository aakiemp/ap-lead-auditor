"use client";

import { useActionState } from "react";

import { runAuditAction, type RunAuditActionState } from "./actions";

const INITIAL_STATE: RunAuditActionState = { error: null };

export function RunAuditButton({ businessId, jobId }: { businessId: string; jobId: string }) {
  const boundAction = runAuditAction.bind(null, businessId, jobId);
  const [state, formAction, pending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Running audit…" : "Run basic audit"}
      </button>
      {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
