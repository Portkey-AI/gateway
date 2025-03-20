import { GOOGLE_VERTEX_AI } from '../../globals';

export const GoogleListFilesRequestHandler = async () => {
  return new Response(
    JSON.stringify({
      message: 'listFiles is not supported by Google Vertex AI',
      status: 'failure',
      provider: GOOGLE_VERTEX_AI,
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
};
