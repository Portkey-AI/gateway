import { z } from 'zod';
import { OLLAMA, VALID_PROVIDERS } from '../../../globals';

export const configSchema: any = z
  .object({
    strategy: z
      .object({
        mode: z
          .string()
          .refine(
            (value) => ['single', 'loadbalance', 'fallback'].includes(value),
            {
              message:
                "Invalid 'mode' value. Must be one of: single, loadbalance, fallback",
            }
          ),
        on_status_codes: z.array(z.number()).optional(),
      })
      .optional(),
    provider: z
      .string()
      .refine((value) => VALID_PROVIDERS.includes(value), {
        message: `Invalid 'provider' value. Must be one of: ${VALID_PROVIDERS.join(', ')}`,
      })
      .optional(),
    api_key: z.string().optional(),
    aws_secret_access_key: z.string().optional(),
    aws_access_key_id: z.string().optional(),
    aws_session_token: z.string().optional(),
    aws_region: z.string().optional(),
    cache: z
      .object({
        mode: z
          .string()
          .refine((value) => ['simple', 'semantic'].includes(value), {
            message:
              "Invalid 'cache.mode' value. Must be one of: simple, semantic",
          }),
        max_age: z.number().optional(),
      })
      .refine((value) => value.mode !== undefined, {
        message: "'cache.mode' must be defined",
      })
      .optional(),
    retry: z
      .object({
        attempts: z.number(),
        on_status_codes: z.array(z.number()).optional(),
      })
      .refine((value) => value.attempts !== undefined, {
        message: "'retry.attempts' must be defined",
      })
      .optional(),
    weight: z.number().optional(),
    on_status_codes: z.array(z.number()).optional(),
    targets: z.array(z.lazy(() => configSchema)).optional(),
    request_timeout: z.number().optional(),
    custom_host: z.string().optional(),
    forward_headers: z.array(z.string()).optional(),
  })
  .refine(
    (value) => {
      const hasProviderApiKey =
        value.provider !== undefined && value.api_key !== undefined;
      const hasModeTargets =
        value.strategy !== undefined && value.targets !== undefined;
      const isOllamaProvider = value.provider === OLLAMA;
      const hasAWSDetails =
        value.aws_access_key_id && value.aws_secret_access_key;

      return (
        hasProviderApiKey ||
        hasModeTargets ||
        value.cache ||
        value.retry ||
        value.request_timeout ||
        isOllamaProvider ||
        hasAWSDetails
      );
    },
    {
      message:
        "Invalid configuration. It must have either 'provider' and 'api_key', or 'strategy' and 'targets', or 'cache', or 'retry', or 'request_timeout'",
    }
  )
  .refine(
    (value) => {
      const customHost = value.custom_host;
      if (customHost && customHost.indexOf('api.portkey') > -1) {
        return false;
      }
      return true;
    },
    {
      message: 'Invalid custom host',
    }
  );
