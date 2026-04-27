export type RealtimeEnvelope<TPayload = unknown> = {
  type: string;
  channel: string;
  payload: TPayload;
  sequence: number;
  cursor: string | null;
};

export type RealtimeConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stale' | 'disconnected';

export type RealtimeSubscription = {
  subscriptionId: string;
  unsubscribe: () => void;
};

export type RealtimeHandler<TPayload> = (event: RealtimeEnvelope<TPayload>) => void;

export type RealtimeTransport = {
  open: (cursor: string | null) => void;
  close: () => void;
};

type ListenerRecord = {
  channel: string;
  handler: RealtimeHandler<unknown>;
};

const nextId = () => `sub_${Math.random().toString(36).slice(2, 10)}`;

export class RealtimeClient {
  private readonly listeners = new Map<string, ListenerRecord>();
  private status: RealtimeConnectionStatus = 'idle';
  private cursor: string | null = null;
  private lastSequenceByChannel = new Map<string, number>();

  constructor(private readonly transport: RealtimeTransport) {}

  connect() {
    this.status = 'connecting';
    this.transport.open(this.cursor);
    // Status remains 'connecting' until the first dispatched event confirms the connection.
  }

  disconnect() {
    this.transport.close();
    this.listeners.clear();
    this.lastSequenceByChannel.clear();
    this.status = 'disconnected';
  }

  reconnect() {
    this.status = 'reconnecting';
    this.transport.open(this.cursor);
    // Status remains 'reconnecting' until the next dispatched event.
  }

  /** Called by the transport layer once the underlying connection is open. */
  markConnected() {
    this.status = 'connected';
  }

  subscribe<TPayload>(channel: string, handler: RealtimeHandler<TPayload>): RealtimeSubscription {
    const subscriptionId = nextId();
    this.listeners.set(subscriptionId, {
      channel,
      handler: handler as RealtimeHandler<unknown>
    });
    return {
      subscriptionId,
      unsubscribe: () => {
        this.listeners.delete(subscriptionId);
      }
    };
  }

  getStatus() {
    return this.status;
  }

  getCursor() {
    return this.cursor;
  }

  /**
   * Dispatch a raw message from the WebSocket.
   * Accepts both strict `RealtimeEnvelope` format and loose backend messages.
   * For loose messages the `type` field is used as both `type` and `channel`.
   */
  dispatch<TPayload>(raw: RealtimeEnvelope<TPayload> | Record<string, unknown>) {
    // Receiving an event confirms the connection is live.
    if (this.status === 'connecting' || this.status === 'reconnecting') {
      this.status = 'connected';
    }

    // Normalize: backend may send { name, payload, ... } while older mocks use { type, payload, ... }.
    const rawRecord = raw as Record<string, unknown>;
    const eventType = String(rawRecord.type ?? rawRecord.name ?? '');
    const event: RealtimeEnvelope<unknown> = {
      type: eventType,
      channel: String(rawRecord.channel ?? eventType ?? 'workspace'),
      payload: rawRecord.payload ?? raw,
      sequence: typeof rawRecord.sequence === 'number'
        ? rawRecord.sequence as number
        : (this.lastSequenceByChannel.get(
            String(rawRecord.channel ?? eventType ?? 'workspace')
          ) ?? 0) + 1,
      cursor: (rawRecord.cursor as string | null) ?? null,
    };

    const previousSequence = this.lastSequenceByChannel.get(event.channel);
    if (previousSequence !== undefined && event.sequence > previousSequence + 1) {
      this.status = 'stale';
      throw new Error(`realtime_sequence_gap:${event.channel}:${previousSequence}->${event.sequence}`);
    }

    this.lastSequenceByChannel.set(event.channel, event.sequence);
    this.cursor = event.cursor ?? this.cursor;

    // Deliver to all matching listeners (match on channel prefix or 'workspace' catch-all)
    for (const listener of this.listeners.values()) {
      if (
        listener.channel === event.channel ||
        event.channel.startsWith(listener.channel + '.') ||
        listener.channel === 'workspace'
      ) {
        listener.handler(event);
      }
    }
  }
}
