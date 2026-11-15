// Regression tests for https://github.com/Portkey-AI/gateway/issues/1579
// `cache_control` blocks were silently stripped when routing Anthropic
// requests to Vertex AI through the chat-completions transform: string-content
// user/assistant messages lost message-level `cache_control`, and `file` /
// URL `image_url` content items lost block-level `cache_control`, so Vertex
// never created a prompt cache (zero cache tokens in the response).
// The /v1/messages route passes `system`/`messages` through verbatim, so
// those shapes are asserted here as a regression gate as well.
//
// Note: the providers index is mocked out because it pulls in providers
// whose modules cannot load under this repo's jest setup (pre-existing:
// top-level await in src/utils/env.ts and a type error in
// src/providers/bytez/api.ts). The transform harness and the Vertex configs
// under test are the real modules.
jest.mock('../../providers', () => ({ __esModule: true, default: {} }));

import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { VertexAnthropicChatCompleteConfig } from '../google-vertex-ai/chatComplete';
import { VertexAnthropicMessagesConfig } from '../google-vertex-ai/messages';

const CC: { type: 'ephemeral' } = { type: 'ephemeral' };
const providerOptions = { provider: 'vertex-ai' } as any;

describe('Vertex Anthropic cache_control forwarding (#1579)', () => {
  describe('/v1/messages (rawPredict body)', () => {
    it('preserves cache_control on system blocks', () => {
      const out = transformUsingProviderConfig(
        VertexAnthropicMessagesConfig,
        {
          model: 'anthropic.claude-sonnet-4-6',
          max_tokens: 50,
          system: [
            { type: 'text', text: 'large system prompt', cache_control: CC },
          ],
          messages: [{ role: 'user', content: 'hello' }],
        } as any,
        providerOptions
      );
      expect(out.system[0].cache_control).toEqual(CC);
    });

    it('preserves cache_control on message content blocks', () => {
      const out = transformUsingProviderConfig(
        VertexAnthropicMessagesConfig,
        {
          model: 'anthropic.claude-sonnet-4-6',
          max_tokens: 50,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'hello', cache_control: CC }],
            },
          ],
        } as any,
        providerOptions
      );
      expect(out.messages[0].content[0].cache_control).toEqual(CC);
    });
  });

  describe('/v1/chat/completions (Anthropic transform)', () => {
    const run = (messages: any[]) =>
      transformUsingProviderConfig(
        VertexAnthropicChatCompleteConfig,
        {
          model: 'anthropic.claude-sonnet-4-6',
          max_tokens: 50,
          messages,
        } as any,
        providerOptions
      );

    it('preserves message-level cache_control on string-content user messages', () => {
      const out = run([
        { role: 'user', content: 'plain string question', cache_control: CC },
      ]);
      expect(out.messages).toEqual([
        { role: 'user', content: 'plain string question', cache_control: CC },
      ]);
    });

    it('preserves message-level cache_control on string-content assistant messages', () => {
      const out = run([
        { role: 'assistant', content: 'prev answer', cache_control: CC },
      ]);
      expect(out.messages[0].content).toEqual([
        { type: 'text', text: 'prev answer', cache_control: CC },
      ]);
    });

    it('preserves the full cache_control object, including ttl', () => {
      const ttlCC = { type: 'ephemeral', ttl: '1h' } as any;
      const out = run([
        {
          role: 'user',
          content: 'plain string question',
          cache_control: ttlCC,
        },
      ]);
      expect(out.messages).toEqual([
        {
          role: 'user',
          content: 'plain string question',
          cache_control: ttlCC,
        },
      ]);
    });

    it('preserves cache_control on URL image content items', () => {
      const out = run([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/img.png' },
              cache_control: CC,
            },
          ],
        },
      ]);
      expect(out.messages[0].content).toEqual([
        {
          type: 'image',
          source: { type: 'url', url: 'https://example.com/img.png' },
          cache_control: CC,
        },
      ]);
    });

    it('preserves cache_control on file content items', () => {
      const out = run([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                file_url: 'https://example.com/doc.pdf',
                mime_type: 'application/pdf',
              },
              cache_control: CC,
            },
          ],
        },
      ]);
      expect(out.messages[0].content).toEqual([
        {
          type: 'document',
          source: { type: 'url', url: 'https://example.com/doc.pdf' },
          cache_control: CC,
        },
      ]);
    });

    it('does not add cache_control where none was requested', () => {
      const out = run([
        { role: 'user', content: 'no caching here' },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/img.png' },
            },
          ],
        },
      ]);
      expect(out.messages[0]).not.toHaveProperty('cache_control');
      expect(out.messages[0].content).not.toHaveProperty('cache_control');
      expect(out.messages[1].content[0]).not.toHaveProperty('cache_control');
    });
  });
});
