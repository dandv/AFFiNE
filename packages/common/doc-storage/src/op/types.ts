// in
export interface OpMessage {
  type: 'op';
  id: string;
  name: string;
  payload: any;
}

export interface OpCancelMessage {
  type: 'op:cancel';
  id: string;
  reason: string;
}

export interface OpSubscribeMessage {
  type: 'op:subscribe';
  id: string;
  name: string;
  payload: any;
}

// out
export type OpReturnMessage<Return> = {
  type: 'op:return';
  id: string;
} & (
  | {
      return: Return;
    }
  | {
      // TODO: custom error Ser-De
      error: Error;
    }
);

export interface OpNextMessage<Return> {
  type: 'op:next';
  id: string;
  return: Return;
}

export type OpMessages =
  | OpMessage
  | OpCancelMessage
  | OpReturnMessage<any>
  | OpSubscribeMessage
  | OpNextMessage<any>;

export interface CancelablePromise<T> extends Promise<T> {
  cancel(reason: string): void;
}

export interface Subscription {
  unsubscribe(): void;
}

export class Op<In, Out> {
  // type holder
  protected readonly _out?: Out;

  constructor(public readonly payload: In) {}

  protected getId() {
    return Math.random().toString(36).slice(2, 9);
  }

  toOpMessage(): OpMessage {
    return {
      type: 'op',
      id: this.getId(),
      name: this.constructor.name,
      payload: this.payload,
    };
  }

  toSubscribeOpMessage(): OpSubscribeMessage {
    return {
      type: 'op:subscribe',
      id: this.getId(),
      name: this.constructor.name,
      payload: this.payload,
    };
  }
}

export type OpInput<OpType extends Op<any, any>> =
  OpType extends Op<infer In, any> ? (In extends void ? never : In) : never;

export type OpOutput<OpType extends Op<any, any>> =
  OpType extends Op<any, infer Out> ? Out : never;

const OpTypes = new Set<OpMessages['type']>([
  'op',
  'op:return',
  'op:cancel',
  'op:subscribe',
  'op:next',
]);

export function ignoreUnknownEvent<Data extends OpMessages>(
  handler: (data: Data) => void
) {
  return (event: MessageEvent<any>) => {
    const data = event.data;

    if (
      !data ||
      typeof data !== 'object' ||
      typeof data.type !== 'string' ||
      !OpTypes.has(data.type)
    ) {
      return;
    }

    handler(event.data);
  };
}

export type OpMessageHandlers = {
  [Type in OpMessages['type']]: (
    op: Extract<OpMessages, { type: Type }>
  ) => void;
};

export abstract class AutoOpHandler {
  abstract get handlers(): Partial<OpMessageHandlers>;

  constructor(protected readonly port: MessagePort) {}

  handleMessageFromConsumer = ignoreUnknownEvent((msg: OpMessages) => {
    const handler = this.handlers[msg.type];
    if (!handler) {
      return;
    }

    handler(msg as any);
  });

  listen() {
    this.port.addEventListener('message', this.handleMessageFromConsumer);
    this.port.start();

    return () => {
      this.close();
    };
  }

  close() {
    this.port.close();
    this.port.removeEventListener('message', this.handleMessageFromConsumer);
  }
}
