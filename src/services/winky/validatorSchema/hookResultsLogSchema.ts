import { z } from 'zod';

const CheckResultSchema = z.object({
  verdict: z.boolean(),
  id: z.string(),
  execution_time: z.number().int().nonnegative(),
  error: z
    .object({
      name: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  created_at: z.date(),
  data: z.any(),
});

const FeedbackMetadataSchema = z.object({
  successfulChecks: z.string(),
  failedChecks: z.string(),
  erroredChecks: z.string(),
});

const FeedbackSchema = z.object({
  value: z.number().int(),
  weight: z.number(),
  metadata: FeedbackMetadataSchema,
});

const HookResultSchema = z.object({
  verdict: z.boolean(),
  id: z.string(),
  checks: z.array(CheckResultSchema),
  feedback: FeedbackSchema.nullable().optional(),
  execution_time: z.number().int().nonnegative(),
  async: z.boolean(),
  deny: z.boolean(),
  event_type: z.enum(['beforeRequestHook', 'afterRequestHook']),
  created_at: z.date(),
  type: z.string(),
  guardrail_version_id: z.string().optional(),
});

export const HookResultsRequestBodySchema = z.object({
  generation_id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  workspace_slug: z.string().startsWith('ws-'),
  trace_id: z.string(),
  internal_trace_id: z.string().uuid(),
  results: z.array(HookResultSchema),
  organisation_details: z.object({}).catchall(z.any()),
});
