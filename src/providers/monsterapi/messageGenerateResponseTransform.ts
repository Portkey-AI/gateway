import { ErrorResponse } from "../types";
import { MonsterAPIResponse } from "./monsterApiResponse";

export const MessageGenerateResponseTransform = (response: MonsterAPIResponse, responseStatus: number): MonsterAPIResponse | ErrorResponse => {
    if (responseStatus !== 200) {
      // If the response status is not 200, return an error response
      return {
        error: {
          message: "Error occurred while processing the request",
          type: "API Error",
          param: null,
          code: null,
        },
        provider: "MonsterAPI"
      };
    }
  
    // If the response status is 200, return the transformed MonsterAPI response
    return {
      text: response.text,
      token_counts: response.token_counts,
      credits_consumed: response.credits_consumed,
      provider: "MonsterAPI"
    };
  };
