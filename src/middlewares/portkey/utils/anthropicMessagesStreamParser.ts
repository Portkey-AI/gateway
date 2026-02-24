import {
  ContentBlock,
  MessagesErrorResponse,
  MessagesResponse,
  ServerToolUseBlock,
  ToolUseBlock,
} from '../../../types/messagesResponse';
import { RawMessageStreamEvent } from '../../../types/MessagesStreamResponse';

const JSON_BUF_PROPERTY = '__json_buf';
export type TracksToolInput = ToolUseBlock | ServerToolUseBlock;

function tracksToolInput(content: ContentBlock): content is TracksToolInput {
  return (
    'type' in content &&
    (content.type === 'tool_use' || content.type === 'server_tool_use')
  );
}

export const parseAnthropicMessageStreamResponse = (
  res: string,
  splitPattern: string
): MessagesResponse | MessagesErrorResponse => {
  const arr = res.split(splitPattern);
  let snapshot: MessagesResponse | undefined;
  try {
    for (let eachFullChunk of arr) {
      eachFullChunk = eachFullChunk
        .trim()
        .replace(/^event:.*$/gm, '')
        .replace(/^\s*\n/gm, '');
      eachFullChunk = eachFullChunk.replace(/^data: /, '');
      eachFullChunk = eachFullChunk.trim();
      const event: RawMessageStreamEvent = JSON.parse(eachFullChunk || '{}');

      if (event.type === 'ping') {
        continue;
      }

      if (event.type === 'message_start') {
        snapshot = event.message;
        if (!snapshot.usage)
          snapshot.usage = {
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
          };
        continue;
      }

      if (event.type === 'error') {
        return {
          error: event.error,
          usage: {
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
          },
        };
      }

      if (!snapshot) {
        throw new Error(
          `Unexpected ordering of events \n\n event: \n ${event} \n\n events: \n ${arr}`
        );
      }

      switch (event.type) {
        case 'message_delta':
          snapshot.stop_reason = event.delta.stop_reason;
          snapshot.stop_sequence = event.delta.stop_sequence;
          snapshot.usage.output_tokens = event.usage.output_tokens;

          // Update other usage fields if they exist in the event
          if (event.usage.input_tokens != null) {
            snapshot.usage.input_tokens = event.usage.input_tokens;
          }

          if (event.usage.cache_creation_input_tokens != null) {
            snapshot.usage.cache_creation_input_tokens =
              event.usage.cache_creation_input_tokens;
          }

          if (event.usage.cache_read_input_tokens != null) {
            snapshot.usage.cache_read_input_tokens =
              event.usage.cache_read_input_tokens;
          }

          if (event.usage.server_tool_use != null) {
            snapshot.usage.server_tool_use = event.usage.server_tool_use;
          }
          break;
        // we return from here
        case 'message_stop':
          return snapshot;
        case 'content_block_start':
          snapshot.content.push({ ...event.content_block });
          break;
        case 'content_block_delta': {
          const snapshotContent = snapshot.content.at(event.index);

          switch (event.delta.type) {
            case 'text_delta': {
              if (
                snapshotContent &&
                'type' in snapshotContent &&
                snapshotContent.type === 'text'
              ) {
                snapshot.content[event.index] = {
                  ...snapshotContent,
                  text: (snapshotContent.text || '') + event.delta.text,
                };
              }
              break;
            }
            case 'citations_delta': {
              if (
                snapshotContent &&
                'type' in snapshotContent &&
                snapshotContent.type === 'text'
              ) {
                snapshot.content[event.index] = {
                  ...snapshotContent,
                  citations: [
                    ...(snapshotContent.citations ?? []),
                    event.delta.citation,
                  ],
                };
              }
              break;
            }
            case 'input_json_delta': {
              if (snapshotContent && tracksToolInput(snapshotContent)) {
                // we need to keep track of the raw JSON string as well so that we can
                // re-parse it for each delta, for now we just store it as an untyped
                // non-enumerable property on the snapshot
                let jsonBuf = (snapshotContent as any)[JSON_BUF_PROPERTY] || '';
                jsonBuf += event.delta.partial_json;

                const newContent = { ...snapshotContent };
                Object.defineProperty(newContent, JSON_BUF_PROPERTY, {
                  value: jsonBuf,
                  enumerable: false,
                  writable: true,
                });

                if (jsonBuf) {
                  try {
                    // only set input if it's valid JSON
                    newContent.input = JSON.parse(jsonBuf);
                  } catch (error) {
                    // ignore error
                  }
                }
                snapshot.content[event.index] = newContent;
              }
              break;
            }
            case 'thinking_delta': {
              if (
                snapshotContent &&
                'type' in snapshotContent &&
                snapshotContent.type === 'thinking'
              ) {
                snapshot.content[event.index] = {
                  ...snapshotContent,
                  thinking: snapshotContent.thinking + event.delta.thinking,
                };
              }
              break;
            }
            case 'signature_delta': {
              if (
                snapshotContent &&
                'type' in snapshotContent &&
                snapshotContent.type === 'thinking'
              ) {
                snapshot.content[event.index] = {
                  ...snapshotContent,
                  signature: event.delta.signature,
                };
              }
              break;
            }
          }
          break;
        }
        case 'content_block_stop':
          break;
      }
    }
  } catch (error: any) {
    console.error({
      message: `parseAnthropicMessageStreamResponse: ${error.message}`,
    });
    snapshot = undefined;
  }

  return snapshot as MessagesResponse;
};
