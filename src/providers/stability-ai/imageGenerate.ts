import { ImageGenerateResponse, ProviderConfig } from "../types";

export const StabilityAIImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: "text_prompts",
    required: true,
    transform: (params: any) => {
      return [{
        "text": params.prompt,
        "weight": 1
      }]
    }
  },
  n: {
    param: "samples",
    min: 1,
    max: 10
  },
  size: [{
    param: "height",
    transform: (params:any) => parseInt(params.size.toLowerCase().split('x')[1]),
    min: 320
  }, {
    param: "width",
    transform: (params:any) => parseInt(params.size.toLowerCase().split('x')[0]),
    min: 320
  }],
  style: {
    param: "style_preset"
  }
}

interface StabilityAIImageGenerateResponse extends ImageGenerateResponse {
  artifacts: ImageArtifact[];
}

interface ImageArtifact {
  base64: string; // Image encoded in base64
  finishReason: 'CONTENT_FILTERED' | 'ERROR' | 'SUCCESS'; // Enum for finish reason
  seed: number; // The seed associated with this image
}


export const StabilityAIImageGenerateResponseTransform: (response: StabilityAIImageGenerateResponse) => ImageGenerateResponse = (response) => {
  let resp: ImageGenerateResponse = {
    created: `${new Date().getTime()}`, // Corrected method call
    data: response.artifacts.map(art => ({b64_json: art.base64})) // Corrected object creation within map
  };

  return resp;
};