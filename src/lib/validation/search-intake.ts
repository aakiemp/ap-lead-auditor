import { z } from "zod";

export const searchIntakeSchema = z.object({
  niche: z.string().trim().min(1, "Niche or category is required.").max(200, "Niche is too long."),
  city: z.string().trim().min(1, "City is required.").max(100, "City is too long."),
  state: z.string().trim().min(1, "State is required.").max(100, "State is too long."),
  zip: z.string().trim().max(20, "Zip is too long.").optional(),
  maxResults: z.coerce.number().int().min(1).max(60).default(20),
  minRating: z.coerce.number().min(1).max(5).optional(),
  minReviews: z.coerce.number().int().min(0).optional(),
  excludeNoWebsite: z.coerce.boolean().default(false),
  isTest: z.coerce.boolean().default(false),
});

export type SearchIntakeInput = z.infer<typeof searchIntakeSchema>;
