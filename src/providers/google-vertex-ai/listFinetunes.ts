import { GOOGLE_VERTEX_AI } from '../../globals';
import { GoogleFinetuneRecord, GoogleErrorResponse } from './types';
import { GoogleToOpenAIFinetune } from './utils';

type GoogleListFinetunesResponse = {
  tuningJobs: GoogleFinetuneRecord[];
  nextPageToken?: string;
};

export const GoogleFinetuneListResponseTransform = (
  input: Response | GoogleErrorResponse,
  status: number
) => {
  if (status !== 200) {
    return { ...input, provider: GOOGLE_VERTEX_AI };
  }
  const records =
    (input as unknown as { tuningJobs: GoogleFinetuneRecord[] }).tuningJobs ??
    [];

  const objects = records.map(GoogleToOpenAIFinetune);

  return {
    data: objects,
    object: 'list',
    first_id: objects.at(0)?.id,
    last_id: objects.at(-1)?.id,
    has_more: !!(input as unknown as GoogleListFinetunesResponse)
      ?.nextPageToken,
  };
};
