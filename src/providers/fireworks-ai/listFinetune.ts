import { FinetuneResponse } from './types';
import { fireworkFinetuneToOpenAIFinetune } from './utils';

export const FireworkListFinetuneResponseTransform = (
  response: any,
  status: number
) => {
  if (status !== 200) {
    const error = response?.error || 'Failed to list finetunes';
    return new Response(
      JSON.stringify({
        error: { message: error },
      }),
      {
        status: status || 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const list = response?.supervisedFineTuningJobs ?? [];
  const mappedResponse = list.map((finetune: FinetuneResponse) => {
    return fireworkFinetuneToOpenAIFinetune(finetune);
  });

  const firstId = mappedResponse[0]?.id;
  const lastId = mappedResponse[mappedResponse.length - 1]?.id;

  return {
    object: 'list',
    data: mappedResponse,
    first_id: firstId,
    last_id: lastId,
    has_more: !!response.nextPageToken,
  };
};
