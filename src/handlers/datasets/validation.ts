import { z } from 'zod';

export const createDatasetValidator = z
  .object({
    name: z.string(),
    provider: z.string(),
    purpose: z.string(),
    model: z.string().optional(),
    model_type: z.string().optional().default('chat'),
  })
  .passthrough()
  .transform((body) => {
    if (body.purpose !== 'fine-tune') {
      return false;
    }

    // Update body key
    (body as any).type = body.purpose;
    return body;
  });

export const putDatasetValidator = z
  .object({
    s3Path: z.string().optional(),
    filename: z.string().optional(),
  })
  .passthrough()
  .transform((data) => {
    if (!data.filename && !data.s3Path) {
      return false;
    }

    if (data.filename) {
      data.s3Path = data.filename;
    }

    return data;
  });
