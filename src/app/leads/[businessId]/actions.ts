"use server";

import { revalidatePath } from "next/cache";

import { runAudit } from "@/lib/audit/run-audit";

export interface RunAuditActionState {
  error: string | null;
}

export async function runAuditAction(
  businessId: string,
  jobId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's (state, formData) calling convention
  _prevState: RunAuditActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- this action takes no form fields; formData is unused
  _formData: FormData,
): Promise<RunAuditActionState> {
  const result = await runAudit(jobId);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/leads/${businessId}`);
  revalidatePath("/leads");
  return { error: null };
}
