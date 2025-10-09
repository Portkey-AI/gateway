export interface FeedbackLogObject {
  value: number;
  metadata: Record<string, string>;
  weight: number;
  trace_id: string;
}

export async function addFeedback(
  env: any,
  feedbackObj: FeedbackLogObject,
  headers: Record<string, any>
) {
  try {
    await env.feedbackWorker.fetch(`${env.GATEWAY_BASEPATH}/v1/feedback`, {
      method: 'POST',
      body: JSON.stringify(feedbackObj),
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error(error);
  }
}
