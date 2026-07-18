"use client";

import { useActionState } from "react";
import Link from "next/link";

import { submitSearch, type SearchFormState } from "./actions";

const INITIAL_STATE: SearchFormState = { error: null, fieldErrors: {} };

export default function NewSearchPage() {
  const [state, formAction, pending] = useActionState(submitSearch, INITIAL_STATE);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <Link href="/searches" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Searches
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">New search</h1>
      </header>

      <main className="mx-auto w-full max-w-lg px-8 py-10">
        <form action={formAction} className="space-y-5 rounded-lg border border-zinc-200 bg-white p-6">
          {state.error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          ) : null}

          <Field
            label="Niche / category"
            name="niche"
            required
            placeholder="e.g. plumbers"
            error={state.fieldErrors.niche}
          />
          <Field label="City" name="city" required error={state.fieldErrors.city} />
          <Field label="State" name="state" required error={state.fieldErrors.state} />
          <Field label="Zip (optional)" name="zip" error={state.fieldErrors.zip} />
          <Field
            label="Max results (1–60)"
            name="maxResults"
            placeholder="20"
            defaultValue="20"
            error={state.fieldErrors.maxResults}
          />
          <Field
            label="Minimum rating (1–5, optional)"
            name="minRating"
            placeholder="e.g. 4"
            error={state.fieldErrors.minRating}
          />
          <Field
            label="Minimum review count (optional)"
            name="minReviews"
            placeholder="e.g. 10"
            error={state.fieldErrors.minReviews}
          />

          <div className="flex items-center gap-2">
            <input id="excludeNoWebsite" name="excludeNoWebsite" type="checkbox" className="h-4 w-4" />
            <label htmlFor="excludeNoWebsite" className="text-sm text-zinc-700">
              Exclude businesses with no website
            </label>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Searching…" : "Run search"}
          </button>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-zinc-700">
        {label}
        {required ? " *" : ""}
      </label>
      <input
        id={name}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
