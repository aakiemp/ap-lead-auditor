"use server";

import { redirect } from "next/navigation";

import { createManualLead } from "@/lib/leads/create-manual-lead";
import { websiteIntakeSchema } from "@/lib/validation/website-intake";

export interface IntakeFormState {
  error: string | null;
  fieldErrors: Record<string, string>;
  values: { businessName: string; websiteUrl: string; city: string; state: string; phone: string; isTest: boolean };
}

export async function submitManualLead(
  _prevState: IntakeFormState,
  formData: FormData,
): Promise<IntakeFormState> {
  // Echoed back on every failure path below so the form never clears
  // what the operator already typed.
  const values: IntakeFormState["values"] = {
    businessName: (formData.get("businessName") as string) ?? "",
    websiteUrl: (formData.get("websiteUrl") as string) ?? "",
    city: (formData.get("city") as string) ?? "",
    state: (formData.get("state") as string) ?? "",
    phone: (formData.get("phone") as string) ?? "",
    isTest: formData.get("isTest") === "on",
  };

  const raw = {
    businessName: formData.get("businessName"),
    websiteUrl: formData.get("websiteUrl"),
    city: (formData.get("city") as string) || undefined,
    state: (formData.get("state") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    isTest: values.isTest,
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
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }

  const result = await createManualLead(parsed.data);

  if (!result.ok) {
    return { error: result.error, fieldErrors: {}, values };
  }

  redirect(`/leads/${result.businessId}`);
}
