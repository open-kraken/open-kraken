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
    this.status = 'connected';
  }

  disconnect() {
    this.transport.close();
    this.status = 'disconnected';
  }

  reconnect() {
    this.status = 'reconnecting';
    this.transport.open(this.cursor);
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

  dispatch<TPayload>(event: RealtimeEnvelope<TPayload>) {
    const previousSequence = this.lastSequenceByChannel.get(event.channel);

    if (previousSequence === undefined && this.cursor === null && event.sequence !== 1) {
      this.status = 'stale';
      throw new Error(`realtime_sequence_gap:${event.channel}:unknown:${event.sequence}`);
    }

    if (previousSequence !== undefined && event.sequence !== previousSequence + 1) {
      this.status = 'stale';
      throw new Error(`realtime_sequence_gap:${event.channel}:${previousSequence}:${event.sequence}`);
    }

    this.lastSequenceByChannel.set(event.channel, event.sequence);
    this.cursor = event.cursor ?? this.cursor;

    for (const listener of this.listeners.values()) {
      if (listener.channel === event.channel) {
        listener.handler(event);
      }
    }
  }
}
