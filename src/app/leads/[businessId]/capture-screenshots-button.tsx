"use client";

import { useActionState } from "react";

import { captureScreenshotsAction, type CaptureScreenshotsState } from "./actions";

const INITIAL_STATE: CaptureScreenshotsState = { error: null };

export function CaptureScreenshotsButton({
  businessId,
  auditId,
}: {
  businessId: string;
  auditId: string;
}) {
  const boundAction = captureScreenshotsAction.bind(null, businessId, auditId);
  const [state, formAction, pending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Capturing screenshots…" : "Capture screenshots"}
      </button>
      {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
