"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button, FormField } from "@/components/ui";

import { submitManualLead, type IntakeFormState } from "./actions";

const INITIAL_STATE: IntakeFormState = {
  error: null,
  fieldErrors: {},
  values: { businessName: "", websiteUrl: "", city: "", state: "", phone: "", isTest: false },
};

export default function NewLeadPage() {
  const [state, formAction, pending] = useActionState(submitManualLead, INITIAL_STATE);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8">
        <Link href="/leads" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Leads
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">Add a lead</h1>
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

          <FormField label="Business name" name="businessName" required error={state.fieldErrors.businessName}>
            <input type="text" defaultValue={state.values.businessName} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </FormField>

          <FormField
            label="Website URL"
            name="websiteUrl"
            required
            error={state.fieldErrors.websiteUrl}
          >
            <input
              type="text"
              defaultValue={state.values.websiteUrl}
              placeholder="https://example.com"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </FormField>

          <FormField label="City" name="city" error={state.fieldErrors.city}>
            <input type="text" defaultValue={state.values.city} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </FormField>

          <FormField label="State" name="state" error={state.fieldErrors.state}>
            <input type="text" defaultValue={state.values.state} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </FormField>

          <FormField label="Phone" name="phone" error={state.fieldErrors.phone}>
            <input type="text" defaultValue={state.values.phone} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </FormField>

          <div className="flex items-center gap-2">
            <input id="isTest" name="isTest" type="checkbox" defaultChecked={state.values.isTest} className="h-4 w-4" />
            <label htmlFor="isTest" className="text-sm text-zinc-700">
              This is test data
            </label>
          </div>

          <Button type="submit" variant="primary" disabled={pending} className="w-full">
            {pending ? "Checking website…" : "Create lead"}
          </Button>
        </form>
      </main>
    </div>
  );
}
