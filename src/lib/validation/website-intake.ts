import { z } from "zod";

export const websiteIntakeSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Business name is required.")
    .max(200, "Business name is too long."),
  websiteUrl: z
    .string()
    .trim()
    .min(1, "Website URL is required.")
    .max(2048, "Website URL is too long."),
  city: z.string().trim().min(1).max(100).optional(),
  state: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().min(1).max(50).optional(),
  isTest: z.coerce.boolean().default(false),
});

export type WebsiteIntakeInput = z.infer<typeof websiteIntakeSchema>;
