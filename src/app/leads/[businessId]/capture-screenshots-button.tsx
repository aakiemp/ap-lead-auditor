"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";

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
    <form action={formAction}>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Capturing screenshots…" : "Capture screenshots"}
      </Button>
      <div aria-live="polite">
        {state.error ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
