// https://ai.google.dev/gemini-api/docs/media-resolution
jest.mock('../../../data-stores/redis', () => ({
  redisClient: null,
  redisReaderClient: null,
}));

jest.mock('../../../utils/awsAuth', () => ({}));

jest.mock('../../..', () => ({}));

import { GoogleChatCompleteConfig } from '../chatComplete';
import { transformUsingProviderConfig } from '../../../services/transformToProviderRequest';
import { Params } from '../../../types/requestBody';

describe('Google Media Resolution Support', () => {
  describe('Top-level media_resolution', () => {
    it('should transform media_resolution to generationConfig', () => {
      const params = {
        model: 'gemini-1.5-pro',
        media_resolution: 'MEDIA_RESOLUTION_HIGH',
        messages: [],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        GoogleChatCompleteConfig,
        params
      );

      expect(transformedRequest.generationConfig).toBeDefined();
      expect(transformedRequest.generationConfig.mediaResolution).toBe(
        'MEDIA_RESOLUTION_HIGH'
      );
    });

    it('should support all media resolution values', () => {
      const resolutions = [
        'MEDIA_RESOLUTION_LOW',
        'MEDIA_RESOLUTION_MEDIUM',
        'MEDIA_RESOLUTION_HIGH',
        'MEDIA_RESOLUTION_ULTRA_HIGH',
      ];

      resolutions.forEach((resolution) => {
        const params = {
          model: 'gemini-1.5-pro',
          media_resolution: resolution,
          messages: [],
        } as Params;

        const transformedRequest = transformUsingProviderConfig(
          GoogleChatCompleteConfig,
          params
        );

        expect(transformedRequest.generationConfig.mediaResolution).toBe(
          resolution
        );
      });
    });

    it('should not add mediaResolution if not provided', () => {
      const params = {
        model: 'gemini-1.5-pro',
        messages: [],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        GoogleChatCompleteConfig,
        params
      );

      expect(
        transformedRequest.generationConfig?.mediaResolution
      ).toBeUndefined();
    });
  });

  describe('Inline media_resolution', () => {
    it('should transform inline media_resolution for base64 images', () => {
      const params = {
        model: 'gemini-1.5-pro',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                  media_resolution: 'MEDIA_RESOLUTION_HIGH',
                },
              },
            ],
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        GoogleChatCompleteConfig,
        params
      );

      expect(transformedRequest.contents).toHaveLength(1);
      expect(transformedRequest.contents[0].parts).toHaveLength(1);
      expect(transformedRequest.contents[0].parts[0]).toHaveProperty(
        'inlineData'
      );
      expect(transformedRequest.contents[0].parts[0]).toHaveProperty(
        'mediaResolution',
        'MEDIA_RESOLUTION_HIGH'
      );
    });

    it('should transform inline media_resolution for file URLs', () => {
      const params = {
        model: 'gemini-1.5-pro',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'gs://bucket/image.png',
                  mime_type: 'image/png',
                  media_resolution: 'MEDIA_RESOLUTION_MEDIUM',
                },
              },
            ],
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        GoogleChatCompleteConfig,
        params
      );

      expect(transformedRequest.contents).toHaveLength(1);
      expect(transformedRequest.contents[0].parts).toHaveLength(1);
      expect(transformedRequest.contents[0].parts[0]).toHaveProperty(
        'fileData'
      );
      expect(transformedRequest.contents[0].parts[0]).toHaveProperty(
        'mediaResolution',
        'MEDIA_RESOLUTION_MEDIUM'
      );
    });

    it('should not add mediaResolution if not provided inline', () => {
      const params = {
        model: 'gemini-1.5-pro',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                },
              },
            ],
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        GoogleChatCompleteConfig,
        params
      );

      expect(transformedRequest.contents).toHaveLength(1);
      expect(transformedRequest.contents[0].parts).toHaveLength(1);
      expect(transformedRequest.contents[0].parts[0]).toHaveProperty(
        'inlineData'
      );
      expect(transformedRequest.contents[0].parts[0]).not.toHaveProperty(
        'mediaResolution'
      );
    });

    it('should support both top-level and inline media_resolution', () => {
      const params = {
        model: 'gemini-1.5-pro',
        media_resolution: 'MEDIA_RESOLUTION_LOW',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze these images',
              },
              {
                type: 'image_url',
                image_url: {
                  url: 'gs://bucket/image1.png',
                  media_resolution: 'MEDIA_RESOLUTION_HIGH',
                },
              },
              {
                type: 'image_url',
                image_url: {
                  url: 'gs://bucket/image2.png',
                  // No inline resolution, should use top-level
                },
              },
            ],
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        GoogleChatCompleteConfig,
        params
      );

      // Check top-level media_resolution
      expect(transformedRequest.generationConfig.mediaResolution).toBe(
        'MEDIA_RESOLUTION_LOW'
      );

      // Check inline transformations
      expect(transformedRequest.contents).toHaveLength(1);
      expect(transformedRequest.contents[0].parts).toHaveLength(3);

      // First part is text, no mediaResolution
      expect(transformedRequest.contents[0].parts[0]).toHaveProperty('text');
      expect(transformedRequest.contents[0].parts[0]).not.toHaveProperty(
        'mediaResolution'
      );

      // Second part has inline media_resolution
      expect(transformedRequest.contents[0].parts[1]).toHaveProperty(
        'fileData'
      );
      expect(transformedRequest.contents[0].parts[1]).toHaveProperty(
        'mediaResolution',
        'MEDIA_RESOLUTION_HIGH'
      );

      // Third part has no inline media_resolution
      expect(transformedRequest.contents[0].parts[2]).toHaveProperty(
        'fileData'
      );
      expect(transformedRequest.contents[0].parts[2]).not.toHaveProperty(
        'mediaResolution'
      );
    });
  });

  describe('Config integration', () => {
    it('should have media_resolution in GoogleChatCompleteConfig', () => {
      expect(GoogleChatCompleteConfig).toHaveProperty('media_resolution');
      expect(GoogleChatCompleteConfig.media_resolution).toEqual({
        param: 'generationConfig',
        transform: expect.any(Function),
      });
    });
  });
});
