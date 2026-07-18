import { z } from "zod";

export const DEFAULT_BATCH_SIZE = 3;
export const MAX_BATCH_SIZE = 10;

export const batchSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_BATCH_SIZE)
  .default(DEFAULT_BATCH_SIZE);
