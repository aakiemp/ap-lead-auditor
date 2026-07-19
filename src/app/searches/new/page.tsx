"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button, FormField } from "@/components/ui";

import { submitSearch, type SearchFormState } from "./actions";

const INITIAL_STATE: SearchFormState = {
  error: null,
  fieldErrors: {},
  values: {
    niche: "",
    city: "",
    state: "",
    zip: "",
    maxResults: "20",
    minRating: "",
    minReviews: "",
    excludeNoWebsite: false,
    isTest: false,
  },
};

export default function NewSearchPage() {
  const [state, formAction, pending] = useActionState(submitSearch, INITIAL_STATE);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8">
        <Link href="/searches" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Searches
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">New search</h1>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 py-10 sm:px-8">
        <form action={formAction} className="space-y-5 rounded-lg border border-zinc-200 bg-white p-6">
          <div aria-live="polite">
            {state.error ? (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {state.error}
              </p>
            ) : null}
          </div>

          <FormField label="Niche / category" name="niche" required error={state.fieldErrors.niche}>
            <input
              type="text"
              defaultValue={state.values.niche}
              placeholder="e.g. plumbers"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </FormField>

          <FormField label="City" name="city" required error={state.fieldErrors.city}>
            <input type="text" defaultValue={state.values.city} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </FormField>

          <FormField label="State" name="state" required error={state.fieldErrors.state}>
            <input type="text" defaultValue={state.values.state} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </FormField>

          <FormField label="Zip (optional)" name="zip" error={state.fieldErrors.zip}>
            <input type="text" defaultValue={state.values.zip} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </FormField>

          <FormField label="Max results (1–60)" name="maxResults" error={state.fieldErrors.maxResults}>
            <input
              type="text"
              defaultValue={state.values.maxResults}
              placeholder="20"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </FormField>

          <FormField label="Minimum rating (1–5, optional)" name="minRating" error={state.fieldErrors.minRating}>
            <input
              type="text"
              defaultValue={state.values.minRating}
              placeholder="e.g. 4"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </FormField>

          <FormField label="Minimum review count (optional)" name="minReviews" error={state.fieldErrors.minReviews}>
            <input
              type="text"
              defaultValue={state.values.minReviews}
              placeholder="e.g. 10"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </FormField>

          <div className="flex items-center gap-2">
            <input
              id="excludeNoWebsite"
              name="excludeNoWebsite"
              type="checkbox"
              defaultChecked={state.values.excludeNoWebsite}
              className="h-4 w-4"
            />
            <label htmlFor="excludeNoWebsite" className="text-sm text-zinc-700">
              Exclude businesses with no website
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input id="isTest" name="isTest" type="checkbox" defaultChecked={state.values.isTest} className="h-4 w-4" />
            <label htmlFor="isTest" className="text-sm text-zinc-700">
              This is an exploratory/test search
            </label>
          </div>
          <p className="-mt-3 text-xs text-zinc-400">
            Marks this search, and any newly-created businesses it imports, as test data.
            An existing business this search matches keeps its current production/test
            status unchanged.
          </p>

          <Button type="submit" variant="primary" disabled={pending} className="w-full">
            {pending ? "Searching…" : "Run search"}
          </Button>
        </form>
      </main>
    </div>
  );
}
