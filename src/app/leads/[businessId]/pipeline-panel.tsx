"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Badge, Button, Card, CardHeader, FormField } from "@/components/ui";
import { LEAD_PRIORITIES, LEAD_PRIORITY_LABELS, LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/pipeline/pipeline-status";
import { NOTES_MAX_LENGTH, OUTREACH_ANGLE_MAX_LENGTH } from "@/lib/validation/pipeline";
import type { LeadPriority, LeadStatus } from "@/lib/supabase/database.types";

import {
  updateLeadDatesAction,
  updateLeadNotesAction,
  updateLeadOutreachAngleAction,
  updateLeadPriorityAction,
  updateLeadStatusAction,
  type PipelineActionState,
} from "./pipeline-actions";

const ACTION_INITIAL: PipelineActionState = { error: null };
const SAVED_MESSAGE_MS = 2000;

export interface PipelinePanelData {
  status: LeadStatus;
  priority: LeadPriority | null;
  notes: string | null;
  outreachAngle: string | null;
  lastContactedDate: string | null;
  nextFollowUpDate: string | null;
}

export type FollowUpBadgeState = "overdue" | "due_today" | "upcoming" | null;

/**
 * Tracks a transient "Saved" confirmation for one useActionState pair.
 * Fires only on the pending->not-pending transition when the result
 * was error-free (a real completed save, not the initial render), and
 * self-clears after SAVED_MESSAGE_MS -- so a stale "Saved" can never
 * still be showing by the time of a later, different attempt.
 */
function useSavedFeedback(pending: boolean, error: string | null) {
  const [justSaved, setJustSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !error) {
      setJustSaved(true);
      const timeout = setTimeout(() => setJustSaved(false), SAVED_MESSAGE_MS);
      wasPending.current = pending;
      return () => clearTimeout(timeout);
    }
    wasPending.current = pending;
  }, [pending, error]);

  // Derived at render time rather than via a second setState call in
  // the effect above -- a new pending submission should never show a
  // stale "Saved" from a previous one, and this achieves that without
  // an unconditional setState-in-effect.
  return justSaved && !pending;
}

function SaveButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Button type="submit" variant="secondary" disabled={pending} className="whitespace-nowrap">
      {pending ? "Saving…" : label}
    </Button>
  );
}

function FieldFeedback({ error, saved, savedText }: { error: string | null; saved: boolean; savedText: string }) {
  return (
    <div aria-live="polite">
      {error ? (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : saved ? (
        <p className="mt-1 text-sm text-emerald-600">{savedText}</p>
      ) : null}
    </div>
  );
}

export function PipelinePanel({
  businessId,
  data,
  followUpState,
}: {
  businessId: string;
  data: PipelinePanelData;
  followUpState: FollowUpBadgeState;
}) {
  const statusAction = updateLeadStatusAction.bind(null, businessId);
  const priorityAction = updateLeadPriorityAction.bind(null, businessId);
  const notesAction = updateLeadNotesAction.bind(null, businessId);
  const angleAction = updateLeadOutreachAngleAction.bind(null, businessId);
  const datesAction = updateLeadDatesAction.bind(null, businessId);

  const [statusState, statusFormAction, statusPending] = useActionState(statusAction, ACTION_INITIAL);
  const [priorityState, priorityFormAction, priorityPending] = useActionState(priorityAction, ACTION_INITIAL);
  const [notesState, notesFormAction, notesPending] = useActionState(notesAction, ACTION_INITIAL);
  const [angleState, angleFormAction, anglePending] = useActionState(angleAction, ACTION_INITIAL);
  const [datesState, datesFormAction, datesPending] = useActionState(datesAction, ACTION_INITIAL);

  const statusSaved = useSavedFeedback(statusPending, statusState.error);
  const prioritySaved = useSavedFeedback(priorityPending, priorityState.error);
  const notesSaved = useSavedFeedback(notesPending, notesState.error);
  const angleSaved = useSavedFeedback(anglePending, angleState.error);
  const datesSaved = useSavedFeedback(datesPending, datesState.error);

  const [notesText, setNotesText] = useState(data.notes ?? "");
  const [angleText, setAngleText] = useState(data.outreachAngle ?? "");
  const [lastContactedDraft, setLastContactedDraft] = useState(data.lastContactedDate ?? "");
  const [nextFollowUpDraft, setNextFollowUpDraft] = useState(data.nextFollowUpDate ?? "");

  function handleStatusChange(nextStatus: LeadStatus) {
    // Convenience prefill only — the operator still must review and
    // explicitly submit the (separate) dates form for anything to be
    // written. Never overwrites an already-set last-contacted date.
    if (nextStatus === "contacted" && !lastContactedDraft) {
      setLastContactedDraft(new Date().toISOString().slice(0, 10));
    }
  }

  return (
    <Card className="space-y-4">
      <CardHeader>Pipeline</CardHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <form action={statusFormAction} className="space-y-1">
          <label htmlFor="status" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Status
          </label>
          <div className="flex items-center gap-2">
            <select
              id="status"
              name="status"
              defaultValue={data.status}
              onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              disabled={statusPending}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50"
            >
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LEAD_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <SaveButton pending={statusPending} label="Save" />
          </div>
          {followUpState ? <FollowUpBadge state={followUpState} /> : null}
          <FieldFeedback error={statusState.error} saved={statusSaved} savedText="Status saved." />
        </form>

        <form action={priorityFormAction} className="space-y-1">
          <label htmlFor="priority" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Priority
          </label>
          <div className="flex items-center gap-2">
            <select
              id="priority"
              name="priority"
              defaultValue={data.priority ?? ""}
              disabled={priorityPending}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">Unset</option>
              {LEAD_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {LEAD_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
            <SaveButton pending={priorityPending} label="Save" />
          </div>
          <FieldFeedback error={priorityState.error} saved={prioritySaved} savedText="Priority saved." />
        </form>
      </div>

      <form action={datesFormAction} className="space-y-1 border-t border-zinc-100 pt-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lastContactedDate" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Last contacted
            </label>
            <input
              id="lastContactedDate"
              name="lastContactedDate"
              type="date"
              value={lastContactedDraft}
              onChange={(e) => setLastContactedDraft(e.target.value)}
              disabled={datesPending}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="nextFollowUpDate" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Next follow-up
            </label>
            <input
              id="nextFollowUpDate"
              name="nextFollowUpDate"
              type="date"
              value={nextFollowUpDraft}
              onChange={(e) => setNextFollowUpDraft(e.target.value)}
              disabled={datesPending}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50"
            />
          </div>
        </div>
        <div className="mt-2">
          <SaveButton pending={datesPending} label="Save dates" />
        </div>
        <FieldFeedback error={datesState.error} saved={datesSaved} savedText="Dates saved." />
      </form>

      <form action={angleFormAction} className="space-y-1 border-t border-zinc-100 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            {angleText.length} / {OUTREACH_ANGLE_MAX_LENGTH}
          </span>
        </div>
        <FormField
          label="Outreach angle"
          name="outreachAngle"
          description="Internal only — never included automatically in copied outreach output."
        >
          <input
            type="text"
            value={angleText}
            onChange={(e) => setAngleText(e.target.value)}
            maxLength={OUTREACH_ANGLE_MAX_LENGTH}
            disabled={anglePending}
            placeholder="e.g. Led with the mobile performance finding"
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </FormField>
        <div className="mt-2">
          <SaveButton pending={anglePending} label="Save angle" />
        </div>
        <FieldFeedback error={angleState.error} saved={angleSaved} savedText="Outreach angle saved." />
      </form>

      <form action={notesFormAction} className="space-y-1 border-t border-zinc-100 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            {notesText.length} / {NOTES_MAX_LENGTH.toLocaleString()}
          </span>
        </div>
        <FormField
          label="Internal notes"
          name="notes"
          description="Private notes — never included in copied outreach output."
        >
          <textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            maxLength={NOTES_MAX_LENGTH}
            disabled={notesPending}
            rows={4}
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </FormField>
        <div className="mt-2">
          <SaveButton pending={notesPending} label="Save notes" />
        </div>
        <FieldFeedback error={notesState.error} saved={notesSaved} savedText="Notes saved." />
      </form>
    </Card>
  );
}

function FollowUpBadge({ state }: { state: "overdue" | "due_today" | "upcoming" }) {
  if (state === "overdue") return <Badge variant="danger">Overdue follow-up</Badge>;
  if (state === "due_today") return <Badge variant="warning">Follow-up due today</Badge>;
  return <Badge variant="neutral">Follow-up upcoming</Badge>;
}
