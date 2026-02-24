import { HookResultsRequestBodySchema } from '../validatorSchema/hookResultsLogSchema';
import { logger } from '../../../apm';
import {
  AnalyticsOptions,
  HookResultsBaseLogObject,
  HookResultsLogObject,
  HookResultsRawLogObject,
  LogOptions,
  LogStoreApmOptions,
} from '../../../middlewares/portkey/types';
import {
  generateMetricObject,
  getLogFilePath,
  getLogFilePathFormat,
} from '../utils/helpers';
import { Environment } from '../../../utils/env';

export async function hookResultsLogHandler(
  env: Record<string, string>,
  requestBody: Record<string, any>,
  uploadLogToAnalyticsStore: Function,
  uploadLogToLogStore: Function
) {
  try {
    try {
      HookResultsRequestBodySchema.parse(requestBody);
    } catch (err: any) {
      logger.error({
        message: 'HOOK_RESULTS_LOG_VALIDATION_ERROR',
        error: err.errors,
      });
      return new Response('Invalid request', { status: 400 });
    }

    const retentionPeriod =
      requestBody.organisation_details?.settings?.system_log_retention || 30;

    // Get a sample log path to determine the pathFormat
    const pathFormat = getLogFilePathFormat(env);

    // Base clickhouse log object with fixed fields
    const baseChLogObject: HookResultsBaseLogObject = {
      organisation_id: {
        type: 'string',
        value: requestBody.organisation_id,
        isNullable: false,
      },
      workspace_slug: {
        type: 'string',
        value: requestBody.workspace_slug,
        isNullable: false,
      },
      generation_id: {
        type: 'string',
        value: requestBody.generation_id,
        isNullable: false,
      },
      trace_id: {
        type: 'string',
        value: requestBody.trace_id,
        isNullable: false,
      },
      internal_trace_id: {
        type: 'string',
        value: requestBody.internal_trace_id,
        isNullable: false,
      },
      log_store_file_path_format: {
        type: 'string',
        value: pathFormat,
        isNullable: false,
      },
    };

    const chInsertObjectArray: Record<string, any>[] = [];
    const logObjectArray: HookResultsRawLogObject[] = [];

    requestBody.results.forEach((result: any) => {
      // Clickhouse log object with hook specific fields
      const chLogObject: HookResultsLogObject = {
        ...baseChLogObject,
        id: {
          type: 'string',
          value: crypto.randomUUID(),
          isNullable: false,
        },
        hook_id: {
          type: 'string',
          value: result.id,
          isNullable: false,
        },
        guardrail_version_id: {
          type: 'string',
          value: result.guardrail_version_id || '',
          isNullable: false,
        },
        hook_event_type: {
          type: 'string',
          value: result.event_type,
          isNullable: false,
        },
        hook_category: {
          type: 'string',
          value: result.type,
          isNullable: false,
        },
        execution_time: {
          type: 'int',
          value: result.execution_time,
          isNullable: false,
        },
        created_at: {
          type: 'string',
          value: new Date(result.created_at)
            .toISOString()
            .slice(0, 23)
            .replace('T', ' '),
          isNullable: false,
        },
        total_checks_passed: {
          type: 'int',
          value: 0,
          isNullable: false,
        },
        total_checks_failed: {
          type: 'int',
          value: 0,
          isNullable: false,
        },
        total_checks_errored: {
          type: 'int',
          value: 0,
          isNullable: false,
        },
        verdict: {
          type: 'int',
          value: result.verdict,
          isNullable: false,
        },
        async: {
          type: 'int',
          value: result.async,
          isNullable: false,
        },
        deny: {
          type: 'int',
          value: result.deny,
          isNullable: false,
        },
        is_raw_log_available: {
          type: 'int',
          value: false,
          isNullable: false,
        },
        'checks.check_id': {
          type: 'array',
          value: [],
          isNullable: false,
        },
        'checks.execution_time': {
          type: 'array',
          value: [],
          isNullable: false,
        },
        'checks.created_at': {
          type: 'array',
          value: [],
          isNullable: false,
        },
        'checks.verdict': {
          type: 'array',
          value: [],
          isNullable: false,
        },
        'checks.error': {
          type: 'array',
          value: [],
          isNullable: false,
        },
        'checks.parameters': {
          type: 'array',
          value: [],
          isNullable: false,
        },
      };

      const logObject: HookResultsRawLogObject = {
        _id: chLogObject.id.value,
        hook_id: chLogObject.hook_id.value,
        organisation_id: chLogObject.organisation_id.value,
        created_at: chLogObject.created_at.value,
        checks: [],
      };

      result.checks.forEach((check: any) => {
        if (check.data || check.error) {
          logObject.checks.push({
            check_id: check.id,
            data: check.data || null,
            error: check.error || null,
          });

          chLogObject.is_raw_log_available.value = true;
        }

        if (check.verdict && !check.error)
          chLogObject.total_checks_passed.value++;
        if (!check.verdict && !check.error)
          chLogObject.total_checks_failed.value++;
        if (check.error) chLogObject.total_checks_errored.value++;

        chLogObject['checks.check_id'].value.push(check.id);
        chLogObject['checks.execution_time'].value.push(check.execution_time);
        chLogObject['checks.created_at'].value.push(
          new Date(check.created_at)
            .toISOString()
            .slice(0, 23)
            .replace('T', ' ')
        );
        chLogObject['checks.verdict'].value.push(check.verdict);
        const checkError = check.error ? true : false;
        chLogObject['checks.error'].value.push(checkError);
        // We do not log parameters in clickhouse currently
        // But it needs a default value to be inserted through query
        chLogObject['checks.parameters'].value.push([]);
      });

      chInsertObjectArray.push(generateMetricObject(chLogObject));
      if (logObject.checks.length > 0) {
        logObjectArray.push(logObject);
      }
    });

    const clickhouseSettings =
      requestBody.organisation_details?.enterpriseSettings?.clickhouse_settings;
    const analyticsOptions: AnalyticsOptions = {
      table:
        Environment(env).ANALYTICS_GENERATION_HOOKS_TABLE || 'generation_hooks',
      server: clickhouseSettings?.server,
      database: clickhouseSettings?.name,
    };
    uploadLogToAnalyticsStore(env, chInsertObjectArray, analyticsOptions);

    if (logObjectArray.length > 0) {
      const logStoreSettings =
        requestBody.organisation_details?.enterpriseSettings
          ?.log_store_settings;
      const logObjectUploadPromiseArray: Promise<void>[] = [];
      logObjectArray.forEach((logObject) => {
        // Use helper function with 'hooks' subdirectory
        const { filePath } = getLogFilePath(
          env,
          retentionPeriod,
          requestBody.organisation_id,
          requestBody.workspace_slug,
          logObject.created_at,
          logObject._id,
          pathFormat,
          'hooks'
        );
        const logOptions: LogOptions = {
          filePath: filePath,
          mongoCollectionName:
            Environment(env).MONGO_GENERATION_HOOKS_COLLECTION_NAME,
          organisationId: requestBody.organisation_id,
          bucket: logStoreSettings?.log_store_generations_bucket,
          region: logStoreSettings?.log_store_generations_region,
        };
        const logStoreApmOptions: LogStoreApmOptions = {
          logId: logObject._id,
          type: 'generation_hooks',
          organisationId: requestBody.organisation_id,
        };

        logObjectUploadPromiseArray.push(
          uploadLogToLogStore(env, logObject, logOptions, logStoreApmOptions)
        );
      });

      Promise.all(logObjectUploadPromiseArray);
    }

    return new Response('ok', { status: 200 });
  } catch (err: any) {
    logger.error({
      message: 'HOOK_RESULTS_LOG_ERROR',
      error: err.message,
    });
    return new Response('Internal server error', { status: 500 });
  }
}
