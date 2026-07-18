"use server";

import { redirect } from "next/navigation";

import { createManualLead } from "@/lib/leads/create-manual-lead";
import { websiteIntakeSchema } from "@/lib/validation/website-intake";

export interface IntakeFormState {
  error: string | null;
  fieldErrors: Record<string, string>;
}

export async function submitManualLead(
  _prevState: IntakeFormState,
  formData: FormData,
): Promise<IntakeFormState> {
  const raw = {
    businessName: formData.get("businessName"),
    websiteUrl: formData.get("websiteUrl"),
    city: (formData.get("city") as string) || undefined,
    state: (formData.get("state") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
  };

  const parsed = websiteIntakeSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const result = await createManualLead(parsed.data);

  if (!result.ok) {
    return { error: result.error, fieldErrors: {} };
  }

  redirect(`/leads/${result.businessId}`);
}
