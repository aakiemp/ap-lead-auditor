"use client";

import { useActionState } from "react";
import Link from "next/link";

import { submitManualLead, type IntakeFormState } from "./actions";

const INITIAL_STATE: IntakeFormState = { error: null, fieldErrors: {} };

export default function NewLeadPage() {
  const [state, formAction, pending] = useActionState(submitManualLead, INITIAL_STATE);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <Link href="/leads" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Leads
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">Add a lead</h1>
      </header>

      <main className="mx-auto w-full max-w-lg px-8 py-10">
        <form action={formAction} className="space-y-5 rounded-lg border border-zinc-200 bg-white p-6">
          {state.error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          ) : null}

          <Field
            label="Business name"
            name="businessName"
            required
            error={state.fieldErrors.businessName}
          />
          <Field
            label="Website URL"
            name="websiteUrl"
            required
            placeholder="https://example.com"
            error={state.fieldErrors.websiteUrl}
          />
          <Field label="City" name="city" error={state.fieldErrors.city} />
          <Field label="State" name="state" error={state.fieldErrors.state} />
          <Field label="Phone" name="phone" error={state.fieldErrors.phone} />

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Checking website…" : "Create lead"}
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
  error,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
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
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
