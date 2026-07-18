import { z } from "zod";

export const NOTES_MAX_LENGTH = 10_000;
export const OUTREACH_ANGLE_MAX_LENGTH = 500;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const businessIdSchema = z.string().regex(UUID_PATTERN, "Invalid business reference.");

export const leadStatusSchema = z.enum([
  "new",
  "reviewing",
  "qualified",
  "outreach_ready",
  "contacted",
  "replied",
  "follow_up",
  "won",
  "lost",
  "not_a_fit",
]);

export const leadPrioritySchema = z.enum(["low", "medium", "high"]).nullable();

export const leadNotesSchema = z
  .string()
  .trim()
  .max(NOTES_MAX_LENGTH, `Notes must be ${NOTES_MAX_LENGTH.toLocaleString()} characters or fewer.`);

export const leadOutreachAngleSchema = z
  .string()
  .trim()
  .max(
    OUTREACH_ANGLE_MAX_LENGTH,
    `Outreach angle must be ${OUTREACH_ANGLE_MAX_LENGTH} characters or fewer.`,
  );

// A plain YYYY-MM-DD date string, or null to clear the field. Never a
// timestamp — Phase 11 stores dates only, no time component.
export const leadDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, "Enter a valid date.")
  .nullable();
