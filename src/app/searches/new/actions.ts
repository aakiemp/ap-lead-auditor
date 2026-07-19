"use server";

import { redirect } from "next/navigation";

import { runSearch } from "@/lib/places/import-search";
import { searchIntakeSchema } from "@/lib/validation/search-intake";

export interface SearchFormState {
  error: string | null;
  fieldErrors: Record<string, string>;
  values: {
    niche: string;
    city: string;
    state: string;
    zip: string;
    maxResults: string;
    minRating: string;
    minReviews: string;
    excludeNoWebsite: boolean;
    isTest: boolean;
  };
}

export async function submitSearch(
  _prevState: SearchFormState,
  formData: FormData,
): Promise<SearchFormState> {
  // Echoed back on every failure path below so the form never clears
  // what the operator already typed.
  const values: SearchFormState["values"] = {
    niche: (formData.get("niche") as string) ?? "",
    city: (formData.get("city") as string) ?? "",
    state: (formData.get("state") as string) ?? "",
    zip: (formData.get("zip") as string) ?? "",
    maxResults: (formData.get("maxResults") as string) ?? "",
    minRating: (formData.get("minRating") as string) ?? "",
    minReviews: (formData.get("minReviews") as string) ?? "",
    excludeNoWebsite: formData.get("excludeNoWebsite") === "on",
    isTest: formData.get("isTest") === "on",
  };

  const raw = {
    niche: formData.get("niche"),
    city: formData.get("city"),
    state: formData.get("state"),
    zip: (formData.get("zip") as string) || undefined,
    maxResults: (formData.get("maxResults") as string) || undefined,
    minRating: (formData.get("minRating") as string) || undefined,
    minReviews: (formData.get("minReviews") as string) || undefined,
    excludeNoWebsite: values.excludeNoWebsite,
    isTest: values.isTest,
  };

  const parsed = searchIntakeSchema.safeParse(raw);

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

  let result;
  try {
    result = await runSearch({
      niche: parsed.data.niche,
      city: parsed.data.city,
      state: parsed.data.state,
      zip: parsed.data.zip ?? null,
      maxResults: parsed.data.maxResults,
      minRating: parsed.data.minRating ?? null,
      minReviews: parsed.data.minReviews ?? null,
      excludeNoWebsite: parsed.data.excludeNoWebsite,
      isTest: parsed.data.isTest,
    });
  } catch (err) {
    console.error("[submitSearch] runSearch threw:", err);
    return { error: "Could not run this search. Please try again.", fieldErrors: {}, values };
  }

  redirect(`/searches/${result.searchId}`);
}
