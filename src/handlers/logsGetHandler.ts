import { Context } from 'hono';
import { getLogFromLogStore } from '../services/winky';
import { env } from 'hono/adapter';
import { getContext, ContextKeys } from '../middlewares/portkey/contextHelpers';
import { logger } from '../apm';
import { LogOptions } from '../middlewares/portkey/types';
import { Environment } from '../utils/env';
import { getLogFilePath } from '../services/winky/utils/helpers';

// Add this helper function at the top or in a separate file
function validateLogsGetParams(params: Record<string, any>):
  | {
      valid: true;
    }
  | {
      valid: false;
      message: string;
    } {
  const VALID_PATH_FORMATS = ['v1', 'v2'];
  const VALID_TYPES = ['hooks', ''];

  // Validate path_format
  if (params.path_format && !VALID_PATH_FORMATS.includes(params.path_format)) {
    return {
      valid: false,
      message: `Invalid path_format: ${params.path_format}. Must be one of: ${VALID_PATH_FORMATS.join(', ')}`,
    };
  }

  if (params.created_at) {
    const date = new Date(params.created_at);

    if (isNaN(date.getTime())) {
      return {
        valid: false,
        message: `Invalid created_at: ${params.created_at}. Must be a valid ISO 8601 date string.`,
      };
    }
  }

  // Validate that created_at is required for v2
  if (params.path_format === 'v2' && !params.created_at) {
    return {
      valid: false,
      message: 'created_at is required when using path_format=v2',
    };
  }

  // Validate type
  if (params.type && !VALID_TYPES.includes(params.type)) {
    return {
      valid: false,
      message: `Invalid type: ${params.type}. Must be one of: ${VALID_TYPES.filter((t) => t).join(', ')}`,
    };
  }

  return {
    valid: true,
  };
}

export async function logsGetHandler(c: Context): Promise<Response> {
  try {
    const organisationDetails = getContext(c, ContextKeys.ORGANISATION_DETAILS);
    if (!organisationDetails) {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message: 'Unable to validate organization',
        }),
        {
          status: 401,
          headers: {
            'content-type': 'application/json',
          },
        }
      );
    }
    const logId = c.req.param('id');
    const queryParams = c.req.query();
    const validationResult = validateLogsGetParams(queryParams);
    if (!validationResult.valid) {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message: validationResult.message,
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        }
      );
    }
    // Get query parameters for path reconstruction
    const createdAt = queryParams.created_at
      ? new Date(queryParams.created_at)
          .toISOString()
          .slice(0, 23)
          .replace('T', ' ')
      : null;
    const workspaceSlug = organisationDetails.workspaceDetails?.slug;
    const retentionPeriod =
      organisationDetails.settings?.system_log_retention || 30;
    const pathFormat = queryParams.path_format || 'v1';

    // Reconstruct the file path based on the format
    const { filePath } = getLogFilePath(
      env(c),
      retentionPeriod,
      organisationDetails.id,
      workspaceSlug,
      createdAt,
      logId,
      pathFormat,
      queryParams.type
    );

    const logOptions: LogOptions = {
      filePath: filePath,
      mongoCollectionName: Environment({}).MONGO_COLLECTION_NAME,
      organisationId: organisationDetails.id,
    };

    const log = await getLogFromLogStore(
      env(c),
      organisationDetails,
      logId,
      logOptions
    );
    return new Response(JSON.stringify(log), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  } catch (err: any) {
    logger.error(`logsGet error:`, err);
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: 'Something went wrong',
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
}
