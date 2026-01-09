export const HUGGING_FACE = 'huggingface';

export const HF_ROUTER_BASE_URL = 'https://router.huggingface.co';

// Known HF image-only models (require dedicated endpoints)
export const HF_IMAGE_MODELS = [
  'black-forest-labs/FLUX.1-dev',
  'black-forest-labs/FLUX.1-schnell',
];

// Binary image content types returned by HF endpoints
export const HF_IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// HF error key for JSON error responses
export const HF_ERROR_KEY = 'error';
