import { Context } from 'hono';
import { realtimeAfterRequestHookHandler } from '../handlers/responseHandlers';

export class RealtimeLlmEventParser {
  private sessionState: any;

  constructor() {
    this.sessionState = {
      sessionDetails: null,
      conversation: {
        items: new Map<string, any>(),
      },
      responses: new Map<string, any>(),
    };
  }

  // Main entry point for processing events
  handleEvent(
    c: Context,
    event: any,
    sessionOptions: any,
    providerOptions: any,
    hooksManager: any,
    server: WebSocket
  ): void {
    let eventHandler = null;
    let parsedData = null;
    switch (event.type) {
      case 'session.created':
        eventHandler = this.handleSessionCreated;
        break;
      case 'session.updated':
        eventHandler = this.handleSessionUpdated;
        break;
      case 'conversation.item.created':
        eventHandler = this.handleConversationItemCreated;
        break;
      case 'conversation.item.deleted':
        eventHandler = this.handleConversationItemDeleted;
        break;
      case 'response.done':
        eventHandler = this.handleResponseDone;
        break;
      case 'error':
        eventHandler = this.handleError;
        break;
      case 'response.audio_transcript.done':
        parsedData = event.transcript;
      default:
        break;
    }
    const hookSpan = hooksManager.createSpan(
      {},
      {},
      providerOptions.provider,
      false,
      [
        ...(providerOptions.beforeRequestHooks || []),
        ...(providerOptions.defaultInputGuardrails || []),
      ],
      [
        ...(providerOptions.afterRequestHooks || []),
        ...(providerOptions.defaultOutputGuardrails || []),
      ],
      null,
      'realtime',
      {}
    );
    if (eventHandler) {
      eventHandler(c, event, sessionOptions);
    }
    if (parsedData) {
      realtimeAfterRequestHookHandler(c, parsedData, hookSpan.id, 0, server);
    }
  }

  // Handle `session.created` event
  private handleSessionCreated(
    c: Context,
    data: any,
    sessionOptions: any
  ): void {
    this.sessionState.sessionDetails = { ...data.session };
    const realtimeEventParser = c.get('realtimeEventParser');
    if (realtimeEventParser) {
      c.executionCtx.waitUntil(
        realtimeEventParser(
          c,
          sessionOptions,
          {},
          { ...data.session },
          data.type
        )
      );
    }
  }

  // Handle `session.updated` event
  private handleSessionUpdated(
    c: Context,
    data: any,
    sessionOptions: any
  ): void {
    this.sessionState.sessionDetails = { ...data.session };
    const realtimeEventParser = c.get('realtimeEventParser');
    if (realtimeEventParser) {
      c.executionCtx.waitUntil(
        realtimeEventParser(
          c,
          sessionOptions,
          {},
          { ...data.session },
          data.type
        )
      );
    }
  }

  // Conversation-specific handlers
  private handleConversationItemCreated(c: Context, data: any): void {
    const { item } = data;
    this.sessionState.conversation.items.set(item.id, data);
  }

  private handleConversationItemDeleted(c: Context, data: any): void {
    this.sessionState.conversation.items.delete(data.item_id);
  }

  private handleResponseDone(c: Context, data: any, sessionOptions: any): void {
    const { response } = data;
    this.sessionState.responses.set(response.id, response);
    for (const item of response.output) {
      const inProgressItem = this.sessionState.conversation.items.get(item.id);
      this.sessionState.conversation.items.set(item.id, {
        ...inProgressItem,
        item,
      });
    }
    const realtimeEventParser = c.get('realtimeEventParser');
    if (realtimeEventParser) {
      const itemSequence = this.rebuildConversationSequence(
        this.sessionState.conversation.items
      );
      c.executionCtx.waitUntil(
        realtimeEventParser(
          c,
          sessionOptions,
          {
            conversation: {
              items: this.getOrderedConversationItems(itemSequence).slice(
                0,
                -1
              ),
            },
          },
          data,
          data.type
        )
      );
    }
  }

  private handleError(c: Context, data: any, sessionOptions: any): void {
    const realtimeEventParser = c.get('realtimeEventParser');
    if (realtimeEventParser) {
      c.executionCtx.waitUntil(
        realtimeEventParser(c, sessionOptions, {}, data, data.type)
      );
    }
  }

  private rebuildConversationSequence(items: Map<string, any>): string[] {
    const orderedItemIds: string[] = [];

    // Find the first item (no previous_item_id)
    let currentId: string | undefined = Array.from(items.values()).find(
      (data) => data.previous_item_id === null
    )?.item?.id;

    // Traverse through the chain using previous_item_id
    while (currentId) {
      orderedItemIds.push(currentId);
      const nextItem = Array.from(items.values()).find(
        (data) => data.previous_item_id === currentId
      );
      currentId = nextItem?.item?.id;
    }

    return orderedItemIds;
  }

  private getOrderedConversationItems(sequence: string[]): any {
    return sequence.map((id) => this.sessionState.conversation.items.get(id)!);
  }
}
