import { Op, SubscribeOp } from './types';

export class ConnectOp extends Op<void, void> {}
export class DisconnectOp extends Op<void, void> {}
export class SubscribeConnectionStatusOp extends SubscribeOp<void, void> {}
