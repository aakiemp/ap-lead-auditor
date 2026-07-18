"use client";

import { useActionState, useState } from "react";

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

export interface PipelinePanelData {
  status: LeadStatus;
  priority: LeadPriority | null;
  notes: string | null;
  outreachAngle: string | null;
  lastContactedDate: string | null;
  nextFollowUpDate: string | null;
}

export type FollowUpBadgeState = "overdue" | "due_today" | "upcoming" | null;

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
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-medium text-zinc-900">Pipeline</h2>

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
            <button
              type="submit"
              disabled={statusPending}
              className="whitespace-nowrap rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {statusPending ? "Saving…" : "Save"}
            </button>
          </div>
          {followUpState ? <FollowUpBadge state={followUpState} /> : null}
          {statusState.error ? <p className="text-sm text-red-600">{statusState.error}</p> : null}
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
            <button
              type="submit"
              disabled={priorityPending}
              className="whitespace-nowrap rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {priorityPending ? "Saving…" : "Save"}
            </button>
          </div>
          {priorityState.error ? <p className="text-sm text-red-600">{priorityState.error}</p> : null}
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
        <button
          type="submit"
          disabled={datesPending}
          className="mt-2 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-50"
        >
          {datesPending ? "Saving…" : "Save dates"}
        </button>
        {datesState.error ? <p className="text-sm text-red-600">{datesState.error}</p> : null}
      </form>

      <form action={angleFormAction} className="space-y-1 border-t border-zinc-100 pt-4">
        <div className="flex items-center justify-between">
          <label htmlFor="outreachAngle" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Outreach angle
          </label>
          <span className="text-xs text-zinc-400">
            {angleText.length} / {OUTREACH_ANGLE_MAX_LENGTH}
          </span>
        </div>
        <input
          id="outreachAngle"
          name="outreachAngle"
          type="text"
          value={angleText}
          onChange={(e) => setAngleText(e.target.value)}
          maxLength={OUTREACH_ANGLE_MAX_LENGTH}
          disabled={anglePending}
          placeholder="e.g. Led with the mobile performance finding"
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={anglePending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-50"
        >
          {anglePending ? "Saving…" : "Save angle"}
        </button>
        {angleState.error ? <p className="text-sm text-red-600">{angleState.error}</p> : null}
      </form>

      <form action={notesFormAction} className="space-y-1 border-t border-zinc-100 pt-4">
        <div className="flex items-center justify-between">
          <label htmlFor="notes" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
            Internal notes
          </label>
          <span className="text-xs text-zinc-400">
            {notesText.length} / {NOTES_MAX_LENGTH.toLocaleString()}
          </span>
        </div>
        <textarea
          id="notes"
          name="notes"
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
          maxLength={NOTES_MAX_LENGTH}
          disabled={notesPending}
          rows={4}
          placeholder="Private notes — never included in copied outreach output."
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={notesPending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-50"
        >
          {notesPending ? "Saving…" : "Save notes"}
        </button>
        {notesState.error ? <p className="text-sm text-red-600">{notesState.error}</p> : null}
      </form>
    </div>
  );
}

function FollowUpBadge({ state }: { state: "overdue" | "due_today" | "upcoming" }) {
  if (state === "overdue") {
    return (
      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Overdue follow-up
      </span>
    );
  }
  if (state === "due_today") {
    return (
      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        Follow-up due today
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
      Follow-up upcoming
    </span>
  );
}
