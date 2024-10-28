import type {
  CancelablePromise,
  Op,
  OpCancelMessage,
  OpMessageHandlers,
  Subscription,
} from './types';
import { AutoOpHandler } from './types';

export class OpProducer extends AutoOpHandler {
  private readonly pendingOps = new Map<string, PromiseWithResolvers<any>>();
  private readonly subscriptions: Map<string, (payload: any) => void> =
    new Map();

  override get handlers() {
    return {
      'op:return': this.handleReturnMessage,
      'op:next': this.handleSubscriptionNextMessage,
    };
  }

  private readonly handleReturnMessage: OpMessageHandlers['op:return'] =
    msg => {
      const pending = this.pendingOps.get(msg.id);
      if (!pending) {
        return;
      }

      if ('error' in msg) {
        pending.reject(msg.error);
      } else {
        pending.resolve(msg.return);
      }
      this.pendingOps.delete(msg.id);
    };

  private readonly handleSubscriptionNextMessage: OpMessageHandlers['op:next'] =
    msg => {
      const sub = this.subscriptions.get(msg.id);
      if (!sub) {
        return;
      }

      sub(msg.return);
    };

  send<In, Out>(op: Op<In, Out>): CancelablePromise<Out> {
    const promiseWithResolvers = Promise.withResolvers<Out>();
    const msg = op.toOpMessage();

    // @ts-expect-error patch cancel on promise
    promiseWithResolvers.cancel = (reason: string) => {
      this.port.postMessage({
        type: 'op:cancel',
        id: msg.id,
        reason,
      } satisfies OpCancelMessage);

      promiseWithResolvers.reject(new Error(reason));
    };

    setTimeout(() => {
      promiseWithResolvers.reject(new Error('timeout'));
    }, 3000 /* TODO: make it configurable */);

    this.port.postMessage(msg);

    return promiseWithResolvers.promise as any;
  }

  subscribe<In, Out>(op: Op<In, Out>, sub: (out: Out) => void): Subscription {
    const msg = op.toSubscribeOpMessage();

    this.subscriptions.set(msg.id, sub);
    this.port.postMessage(msg);

    return {
      unsubscribe: () => {
        this.subscriptions.delete(msg.id);
        this.port.postMessage({
          type: 'op:cancel',
          id: msg.id,
          reason: 'unsubscribe',
        } satisfies OpCancelMessage);
      },
    };
  }
}
