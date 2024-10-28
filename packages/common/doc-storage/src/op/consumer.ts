import type {
  Op,
  OpInput,
  OpMessage,
  OpMessageHandlers,
  OpNextMessage,
  OpOutput,
  OpReturnMessage,
  OpSubscribeMessage,
  Subscription,
} from './types';
import { AutoOpHandler } from './types';

export type OpHandler<OpType extends Op<any, any>> = (
  payload: OpInput<OpType>,
  consumer: OpConsumer
) => Promise<OpOutput<OpType>> | OpOutput<OpType>;

export type OpSubscribableHandler<OpType extends Op<any, any>> = (
  payload: OpInput<OpType>,
  callback: (payload: OpOutput<OpType>) => void,
  consumer: OpConsumer
) => () => void;

export class OpConsumer extends AutoOpHandler {
  private readonly registeredOpHandlers = new Map<
    string,
    OpHandler<Op<any, any>>
  >();
  private readonly registeredSubscribeOpHandlers = new Map<
    string,
    OpSubscribableHandler<Op<any, any>>
  >();
  private readonly processing = new Map<string, Subscription | undefined>();

  override get handlers() {
    return {
      op: this.handleOpMessage,
      'op:subscribe': this.handleSubscribeOpMessage,
      'op:cancel': this.handleCancelOpMessage,
    };
  }

  private readonly handleOpMessage: OpMessageHandlers['op'] = async msg => {
    this.processing.set(msg.id, undefined);

    try {
      const ret = await this.call(msg);
      this.port.postMessage({
        type: 'op:return',
        id: msg.id,
        return: ret,
      } satisfies OpReturnMessage<any>);
    } catch (e) {
      if (!this.processing.has(msg.id)) {
        return;
      }
      this.port.postMessage({
        type: 'op:return',
        id: msg.id,
        error: e as any,
      } satisfies OpReturnMessage<any>);
    } finally {
      this.processing.delete(msg.id);
    }
  };

  private readonly handleSubscribeOpMessage: OpMessageHandlers['op:subscribe'] =
    msg => {
      const subscription = this.subscribe(msg, payload => {
        this.port.postMessage({
          type: 'op:next',
          id: msg.id,
          return: payload,
        } satisfies OpNextMessage<any>);
      });

      this.processing.set(msg.id, subscription);
    };

  private readonly handleCancelOpMessage: OpMessageHandlers['op:cancel'] =
    msg => {
      const sub = this.processing.get(msg.id);
      if (sub) {
        sub.unsubscribe();
      }
      this.processing.delete(msg.id);
    };

  register<T extends Op<any, any>>(
    op: string | { new (...args: any[]): T },
    handler: OpHandler<T>
  ) {
    this.registeredOpHandlers.set(
      typeof op === 'string' ? op : op.name,
      handler
    );
  }

  registerSubscribable<T extends Op<any, any>>(
    op: string | { new (...args: any[]): T },
    handler: OpSubscribableHandler<T>
  ) {
    this.registeredSubscribeOpHandlers.set(
      typeof op === 'string' ? op : op.name,
      handler
    );
  }

  /**
   * @internal
   */
  call(op: OpMessage): any {
    const handler = this.registeredOpHandlers.get(op.name);
    if (!handler) {
      throw new Error(`Handler for operation [${op}] is not registered.`);
    }

    handler(op.payload, this);
  }

  /**
   * @internal
   */
  subscribe(
    op: OpSubscribeMessage,
    callback: (payload: any) => void
  ): Subscription {
    const handler = this.registeredSubscribeOpHandlers.get(op.name);
    if (!handler) {
      throw new Error(`Handler for operation [${op}] is not registered.`);
    }

    const unsubscribe = handler(op.payload, callback, this);

    return {
      unsubscribe,
    };
  }
}
