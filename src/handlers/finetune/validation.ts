import { z } from 'zod';

// passthrough to allow unknown keys
export const createFinetuneJobValidation = z
  .object({
    model: z.string(),
    provider: z.string(),
    training_file: z.string().uuid(),
    suffix: z.string(),
    validation_file: z.string().optional().or(z.string().uuid()),
    hyperparameters: z
      .object({
        n_epochs: z.number().optional().default(1),
      })
      .passthrough(),
    description: z.string().optional(),
    virtual_key: z.string(),
    model_type: z.string().optional().nullable(),
    override_params: z
      .object({
        model: z.string().optional(),
        model_type: z.enum(['chat', 'text', 'vision']).optional(),
        template: z.string().optional(),
        startFinetune: z.boolean().default(true).optional(),
      })
      .passthrough()
      .optional()
      .nullable(),
  })
  .passthrough()
  .transform((body) => {
    const overrideParams = body.override_params;
    if (overrideParams && !Object.hasOwn(overrideParams, 'startFinetune')) {
      // Start finetune if called from API
      overrideParams['startFinetune'] = true;
    }
    const bodyToPass = {
      name: body.suffix,
      description: body.description,
      virtualKey: body.virtual_key,
      provider: body.provider,
      model: body.model,
      hyperparameters: body.hyperparameters,
      trainingDatasetId: body.training_file,
      validationDatasetId: body.validation_file,
      overrideParams: overrideParams,
      modelType: body.model_type,
    };

    return bodyToPass;
  });
