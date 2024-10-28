import { type OpConsumer, type OpHandler } from '../op';
import {
  GetPeerClocksOp,
  GetPeerPushedClocksOp,
  SetPeerClockOp,
  SetPeerPushedClockOp,
} from './ops';
import { Storage, type StorageOptions } from './storage';

export interface SyncStorageOptions extends StorageOptions {}

export interface PeerClock {
  docId: string;
  clock: number;
}

export abstract class SyncStorage<
  Opts extends SyncStorageOptions = SyncStorageOptions,
> extends Storage<Opts> {
  abstract getPeerClocks: OpHandler<GetPeerClocksOp>;
  abstract setPeerClock: OpHandler<SetPeerClockOp>;
  abstract getPeerPushedClocks: OpHandler<GetPeerPushedClocksOp>;
  abstract setPeerPushedClock: OpHandler<SetPeerPushedClockOp>;

  override register(consumer: OpConsumer): void {
    consumer.register(GetPeerClocksOp, this.getPeerClocks);
    consumer.register(SetPeerClockOp, this.setPeerClock);
    consumer.register(GetPeerPushedClocksOp, this.getPeerPushedClocks);
    consumer.register(SetPeerPushedClockOp, this.setPeerPushedClock);
  }
}
