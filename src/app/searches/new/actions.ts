"use server";

import { redirect } from "next/navigation";

import { runSearch } from "@/lib/places/import-search";
import { searchIntakeSchema } from "@/lib/validation/search-intake";

export interface SearchFormState {
  error: string | null;
  fieldErrors: Record<string, string>;
}

export async function submitSearch(
  _prevState: SearchFormState,
  formData: FormData,
): Promise<SearchFormState> {
  const raw = {
    niche: formData.get("niche"),
    city: formData.get("city"),
    state: formData.get("state"),
    zip: (formData.get("zip") as string) || undefined,
    maxResults: (formData.get("maxResults") as string) || undefined,
    minRating: (formData.get("minRating") as string) || undefined,
    minReviews: (formData.get("minReviews") as string) || undefined,
    excludeNoWebsite: formData.get("excludeNoWebsite") === "on",
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
    return { error: "Please fix the highlighted fields.", fieldErrors };
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
    });
  } catch (err) {
    console.error("[submitSearch] runSearch threw:", err);
    return { error: "Could not run this search. Please try again.", fieldErrors: {} };
  }

  redirect(`/searches/${result.searchId}`);
}
