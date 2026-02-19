import { handler } from './inlineImageUrls';
import { PluginContext, PluginHandlerOptions } from '../types';
import { createMockPluginHandlerOptions } from '../testUtils';

describe('inlineImageUrls Plugin', () => {
  const createMockContext = (
    messages: any[],
    overrides: Partial<PluginContext> = {}
  ): PluginContext => ({
    requestType: 'chatComplete',
    provider: 'google-vertex-ai',
    request: {
      text: '',
      json: { messages },
    },
    response: {
      text: '',
      json: {},
    },
    ...overrides,
  });

  const createMockFetchResponse = (
    data: ArrayBuffer,
    contentType: string = 'image/jpeg',
    ok: boolean = true,
    status: number = 200
  ) => {
    return Promise.resolve({
      ok,
      status,
      statusText: ok ? 'OK' : 'Not Found',
      headers: new Headers({ 'content-type': contentType }),
      arrayBuffer: () => Promise.resolve(data),
    } as Response);
  };

  // Create a small test image (1x1 red pixel PNG)
  const createTestImageBuffer = (): ArrayBuffer => {
    // Minimal 1x1 red PNG
    const pngData = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    return pngData.buffer;
  };

  describe('Basic Functionality', () => {
    it('should convert external HTTP image URL to base64', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/png'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.png' },
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      expect(result.error).toBeNull();
      expect(result.verdict).toBe(true);
      expect(result.transformed).toBe(true);
      expect(result.data.imagesConverted).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/image.png',
        expect.objectContaining({ method: 'GET' })
      );

      // Verify the transformed data
      const transformedMessages = result.transformedData.request.json.messages;
      expect(transformedMessages[0].content[1].image_url.url).toMatch(
        /^data:image\/png;base64,/
      );
    });

    it('should handle multiple images in a single message', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/png'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compare these images' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image1.png' },
            },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image2.png' },
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      expect(result.error).toBeNull();
      expect(result.transformed).toBe(true);
      expect(result.data.imagesConverted).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle images across multiple messages', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/png'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image1.png' },
            },
          ],
        },
        {
          role: 'assistant',
          content: 'I see an image',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image2.png' },
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      expect(result.transformed).toBe(true);
      expect(result.data.imagesConverted).toBe(2);
    });
  });

  describe('URL Handling', () => {
    it('should skip data: URLs (already base64)', async () => {
      const mockFetch = jest.fn();
      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      expect(result.transformed).toBe(false);
      expect(result.data.imagesConverted).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip gs:// URLs (Google Cloud Storage)', async () => {
      const mockFetch = jest.fn();
      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'gs://my-bucket/image.png' },
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      expect(result.transformed).toBe(false);
      expect(result.data.imagesConverted).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should process http:// URLs', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/jpeg'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'http://example.com/image.jpg' },
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      expect(result.transformed).toBe(true);
      expect(result.data.imagesConverted).toBe(1);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Provider Filtering', () => {
    it('should process request when provider matches', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/png'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: 'https://example.com/image.png' },
              },
            ],
          },
        ],
        { provider: 'google-vertex-ai' }
      );

      const result = await handler(
        context,
        { providers: ['google-vertex-ai', 'google'] },
        'beforeRequestHook',
        options
      );

      expect(result.transformed).toBe(true);
      expect(result.data.imagesConverted).toBe(1);
    });

    it('should skip request when provider does not match', async () => {
      const mockFetch = jest.fn();
      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: 'https://example.com/image.png' },
              },
            ],
          },
        ],
        { provider: 'openai' }
      );

      const result = await handler(
        context,
        { providers: ['google-vertex-ai'] },
        'beforeRequestHook',
        options
      );

      expect(result.transformed).toBe(false);
      expect(result.data.skipped).toBe(true);
      expect(result.data.reason).toContain('not in target providers list');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should process all providers when providers list is empty', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/png'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: 'https://example.com/image.png' },
              },
            ],
          },
        ],
        { provider: 'any-provider' }
      );

      const result = await handler(
        context,
        { providers: [] },
        'beforeRequestHook',
        options
      );

      expect(result.transformed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors gracefully when failOnError is false', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.png' },
            },
          ],
        },
      ]);

      const result = await handler(
        context,
        { failOnError: false },
        'beforeRequestHook',
        options
      );

      expect(result.error).toBeNull();
      expect(result.verdict).toBe(true);
      expect(result.transformed).toBe(false);
      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors[0].error).toContain('Network error');
    });

    it('should fail request when failOnError is true', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.png' },
            },
          ],
        },
      ]);

      const result = await handler(
        context,
        { failOnError: true },
        'beforeRequestHook',
        options
      );

      expect(result.error).not.toBeNull();
      expect(result.verdict).toBe(false);
    });

    it('should handle HTTP error responses', async () => {
      const mockFetch = jest.fn().mockReturnValue(
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Headers(),
        } as Response)
      );

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/notfound.png' },
            },
          ],
        },
      ]);

      const result = await handler(
        context,
        { failOnError: false },
        'beforeRequestHook',
        options
      );

      expect(result.transformed).toBe(false);
      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors[0].error).toContain('404');
    });

    it('should enforce maxSizeBytes limit', async () => {
      // Create a larger buffer than allowed
      const largeBuffer = new ArrayBuffer(1024 * 1024); // 1MB
      const mockFetch = jest.fn().mockReturnValue(
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/png' }),
          arrayBuffer: () => Promise.resolve(largeBuffer),
        } as Response)
      );

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/large.png' },
            },
          ],
        },
      ]);

      const result = await handler(
        context,
        { maxSizeBytes: 1024, failOnError: false }, // 1KB limit
        'beforeRequestHook',
        options
      );

      expect(result.transformed).toBe(false);
      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors[0].error).toContain('exceeds maximum');
    });
  });

  describe('Event Type Handling', () => {
    it('should skip afterRequestHook events', async () => {
      const mockFetch = jest.fn();
      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.png' },
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'afterRequestHook', options);

      expect(result.transformed).toBe(false);
      expect(result.data.skipped).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Request Type Handling', () => {
    it('should skip non-chatComplete/messages request types', async () => {
      const mockFetch = jest.fn();
      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context: PluginContext = {
        requestType: 'embed',
        request: {
          text: '',
          json: { input: ['test'] },
        },
        response: {
          text: '',
          json: {},
        },
      };

      const result = await handler(context, {}, 'beforeRequestHook', options);

      expect(result.transformed).toBe(false);
      expect(result.data.skipped).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should process messages request type', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/png'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: 'https://example.com/image.png' },
              },
            ],
          },
        ],
        { requestType: 'messages' }
      );

      const result = await handler(context, {}, 'beforeRequestHook', options);

      expect(result.transformed).toBe(true);
      expect(result.data.imagesConverted).toBe(1);
    });
  });

  describe('Content Preservation', () => {
    it('should preserve text content parts', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/png'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image:' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.png' },
            },
            { type: 'text', text: 'Be detailed.' },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      const content = result.transformedData.request.json.messages[0].content;
      expect(content[0]).toEqual({
        type: 'text',
        text: 'Describe this image:',
      });
      expect(content[2]).toEqual({ type: 'text', text: 'Be detailed.' });
    });

    it('should preserve image_url detail field', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/png'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: 'https://example.com/image.png',
                detail: 'high',
              },
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      const imageUrl =
        result.transformedData.request.json.messages[0].content[0].image_url;
      expect(imageUrl.detail).toBe('high');
      expect(imageUrl.url).toMatch(/^data:image\/png;base64,/);
    });

    it('should preserve string content messages', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/png'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'system',
          content: 'You are a helpful assistant.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.png' },
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      expect(result.transformedData.request.json.messages[0].content).toBe(
        'You are a helpful assistant.'
      );
    });
  });

  describe('MIME Type Detection', () => {
    it('should use Content-Type header when available', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(createMockFetchResponse(testImage, 'image/webp'));

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image' }, // No extension
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      const imageUrl =
        result.transformedData.request.json.messages[0].content[0].image_url;
      expect(imageUrl.url).toMatch(/^data:image\/webp;base64,/);
    });

    it('should fall back to URL extension when Content-Type is not image', async () => {
      const testImage = createTestImageBuffer();
      const mockFetch = jest
        .fn()
        .mockReturnValue(
          createMockFetchResponse(testImage, 'application/octet-stream')
        );

      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context = createMockContext([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/photo.gif' },
            },
          ],
        },
      ]);

      const result = await handler(context, {}, 'beforeRequestHook', options);

      const imageUrl =
        result.transformedData.request.json.messages[0].content[0].image_url;
      expect(imageUrl.url).toMatch(/^data:image\/gif;base64,/);
    });
  });

  describe('No Messages', () => {
    it('should handle missing messages gracefully', async () => {
      const mockFetch = jest.fn();
      const options = createMockPluginHandlerOptions({
        externalServiceFetch: mockFetch,
      });

      const context: PluginContext = {
        requestType: 'chatComplete',
        request: {
          text: '',
          json: {},
        },
        response: {
          text: '',
          json: {},
        },
      };

      const result = await handler(context, {}, 'beforeRequestHook', options);

      expect(result.transformed).toBe(false);
      expect(result.data.skipped).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
