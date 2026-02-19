import { PORTKEY_HEADER_KEYS } from '../middlewares/portkey/globals';

export const generateApiErrorResponse = (
  message: string,
  errorCode: string,
  statusCode: number,
  requestOrigin: string | null
) => {
  let beautifiedMessage = `Portkey Error: ${message}.`;
  if (errorCode) {
    beautifiedMessage += ` Error Code: ${errorCode}`;
  }

  const responseHeaders: Record<string, string> = {
    'content-type': 'application/json;charset=UTF-8',
  };
  if (requestOrigin) {
    responseHeaders['Access-Control-Allow-Origin'] = requestOrigin;
    responseHeaders['Access-Control-Expose-Headers'] =
      PORTKEY_HEADER_KEYS.CACHE_STATUS;
  }
  return new Response(
    JSON.stringify({
      status: 'failure',
      message: beautifiedMessage,
      error: {
        message: beautifiedMessage,
        code: errorCode,
      },
    }),
    {
      status: statusCode,
      headers: responseHeaders,
    }
  );
};
