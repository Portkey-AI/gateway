import { env } from 'hono/adapter';
import { Environment } from '../utils/env';
import { Context } from 'hono';
import { resyncOrganisationData } from '../services/albus';
import { logger } from '../apm';
import { ContentfulStatusCode } from 'hono/utils/http-status';

export async function pingVerifyHandler(c: Context) {
  try {
    const { verification_code, organisation_id } = await c.req.json();
    const cfEnv = env(c);
    const organisationsToSyncArray =
      Environment(cfEnv).ORGANISATIONS_TO_SYNC?.split(',') || [];
    if (!verification_code || !organisation_id) {
      return c.json(
        {
          status: 'failure',
          message: 'Verification code and organisation ID are required',
        },
        400
      );
    }
    if (!organisationsToSyncArray.includes(organisation_id)) {
      return c.json(
        {
          status: 'failure',
          message: 'Unauthorized',
        },
        403
      );
    }
    const response = await resyncOrganisationData({
      env: cfEnv,
      organisationId: organisation_id,
      verificationCode: verification_code,
    });
    if (!response.ok) {
      const error = await response.text();
      return c.json(
        {
          status: 'failure',
          message: error,
        },
        (response.status ?? 500) as ContentfulStatusCode
      );
    }
    return c.json(
      {
        status: 'success',
        message: 'Ping verified',
      },
      200
    );
  } catch (error) {
    logger.error('pingVerifyHandler error', error);
    return c.json(
      {
        status: 'failure',
        message: 'Failed to verify ping',
      },
      500
    );
  }
}
