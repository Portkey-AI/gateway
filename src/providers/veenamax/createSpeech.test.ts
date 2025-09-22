import {
  VeenaMaxCreateSpeechResponseTransform,
  VEENAMAX_VOICES,
} from './createSpeech';
import { VEENA_MAX } from '../../globals';
import { ErrorResponse } from '../types';

// Mock fetch for testing
global.fetch = jest.fn();

describe('VeenaMAX CreateSpeech', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should pass through Response object for successful audio response', () => {
    const mockResponse = new Response(new ArrayBuffer(1024), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': '1024',
      },
    });

    const result = VeenaMaxCreateSpeechResponseTransform(mockResponse, 200);

    expect(result).toBeInstanceOf(Response);
    expect(result).toBe(mockResponse);
  });

  test('should handle 400 error responses', () => {
    const mockErrorResponse = {
      error: {
        message:
          'Invalid request format. Check JSON syntax and required fields.',
        code: 400,
        type: 'invalid_request_error',
      },
    };

    const result = VeenaMaxCreateSpeechResponseTransform(
      mockErrorResponse,
      400
    ) as ErrorResponse;

    expect(result).toHaveProperty('error');
    expect(result.provider).toBe(VEENA_MAX);
    expect(result.error.message).toBe(
      'Invalid request format. Check JSON syntax and required fields.'
    );
    expect(result.error.type).toBe('invalid_request_error');
  });

  test('should handle 401 authentication error', () => {
    const mockErrorResponse = {
      error: {
        message: 'Authentication failed',
        code: 401,
        type: 'authentication_error',
      },
    };

    const result = VeenaMaxCreateSpeechResponseTransform(
      mockErrorResponse,
      401
    ) as ErrorResponse;

    expect(result).toHaveProperty('error');
    expect(result.provider).toBe(VEENA_MAX);
    expect(result.error.message).toBe('Authentication failed');
    expect(result.error.type).toBe('authentication_error');
  });

  test('should handle 429 rate limit error', () => {
    const result = VeenaMaxCreateSpeechResponseTransform(
      {},
      429
    ) as ErrorResponse;

    expect(result).toHaveProperty('error');
    expect(result.provider).toBe(VEENA_MAX);
    expect(result.error.message).toBe(
      'Rate limit exceeded. Implement exponential backoff.'
    );
    expect(result.error.type).toBe('rate_limit_error');
  });

  test('should handle 500 internal server error', () => {
    const result = VeenaMaxCreateSpeechResponseTransform(
      {},
      500
    ) as ErrorResponse;

    expect(result).toHaveProperty('error');
    expect(result.provider).toBe(VEENA_MAX);
    expect(result.error.message).toBe(
      'Internal server error. Contact support if persistent.'
    );
    expect(result.error.type).toBe('api_error');
  });

  test('should handle generic error responses', () => {
    const result = VeenaMaxCreateSpeechResponseTransform(
      {},
      503
    ) as ErrorResponse;

    expect(result).toHaveProperty('error');
    expect(result.provider).toBe(VEENA_MAX);
    expect(result.error.message).toBe(
      'VeenaMAX TTS request failed with status 503'
    );
    expect(result.error.type).toBe('api_error');
  });

  test('should have correct voice mappings', () => {
    // Test VeenaMAX native voices
    expect(VEENAMAX_VOICES['varun_chat']).toBe('varun_chat');
    expect(VEENAMAX_VOICES['charu_soft']).toBe('charu_soft');
    expect(VEENAMAX_VOICES['keerti_joy']).toBe('keerti_joy');
    expect(VEENAMAX_VOICES['mohini_whispers']).toBe('mohini_whispers');
    expect(VEENAMAX_VOICES['maitri_connect']).toBe('maitri_connect');
    expect(VEENAMAX_VOICES['soumya_calm']).toBe('soumya_calm');
    expect(VEENAMAX_VOICES['vinaya_assist']).toBe('vinaya_assist');
  });

  test('should handle invalid response format', () => {
    const invalidResponse = { some: 'invalid', data: 'structure' };

    const result = VeenaMaxCreateSpeechResponseTransform(
      invalidResponse,
      200
    ) as ErrorResponse;

    expect(result).toHaveProperty('error');
    expect(result.provider).toBe(VEENA_MAX);
  });
});
