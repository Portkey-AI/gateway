import { logger } from '../../../apm';
import { mongoGet, mongoSet } from '../../../data-stores/mongo';
import { LogStoreApmOptions } from '../../../middlewares/portkey/types';
import { removeSpecialChars } from '../utils/helpers';

export const logToMongo = async (
  env: Record<string, any>,
  logObject: Record<string, any>,
  mongoCollectionName: string,
  apmOptions: LogStoreApmOptions
) => {
  try {
    logObject.created_at = new Date(logObject.created_at);
    await mongoSet(removeSpecialChars(logObject), mongoCollectionName);
  } catch (err: any) {
    logger.error({
      message: `logToMongo error: ${err.message}`,
    });
  }
};

export const getFromMongo = async (
  env: Record<string, any>,
  logId: string,
  mongoCollectionName: string
) => {
  try {
    const query = {
      _id: logId,
    };
    const responseFromMongo = await mongoGet(query, mongoCollectionName);
    return responseFromMongo[0];
  } catch (err: any) {
    logger.error({
      message: `getFromMongo error: ${err.message}`,
    });
  }
};
