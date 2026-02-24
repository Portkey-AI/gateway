import { Context, Next } from 'hono';
import { generateApiErrorResponse } from '../../utils/error';
import { getContext, ContextKeys } from '../portkey/contextHelpers';

export const authZMiddleWare = (allowedScopes: string[]) => {
  return async (c: Context, next: Next) => {
    const requestOrigin = c.req.raw.headers.get('Origin');
    const organisationDetails = getContext(c, ContextKeys.ORGANISATION_DETAILS);
    if (!organisationDetails) {
      return generateApiErrorResponse(
        'Unable to validate organization',
        '033',
        401,
        requestOrigin
      );
    }
    const isActionAllowed = allowedScopes.some((allowedScope) =>
      organisationDetails.scopes.includes(allowedScope)
    );
    if (!isActionAllowed) {
      return generateApiErrorResponse('Forbidden!', '033', 403, requestOrigin);
    }
    return next();
  };
};
