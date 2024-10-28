import {
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  UndoManager,
} from 'yjs';

import type { OpConsumer, OpHandler } from '../op';
import { GetDocSnapshotOp } from './doc';
import {
  CreateHistoryOp,
  DeleteHistoryOp,
  GetDocOp,
  GetHistoryOp,
  ListHistoryOp,
  PushDocUpdateOp,
  RollbackDocOp,
  SubscribeDocUpdateOp,
} from './ops';
import { Storage, type StorageOptions } from './storage';

export interface HistoryStorageOptions extends StorageOptions {}

export interface HistoryFilter {
  before?: number;
  limit?: number;
}

export interface ListedHistory {
  userId: string | null;
  timestamp: number;
}

export abstract class HistoryStorage<
  Options extends HistoryStorageOptions = HistoryStorageOptions,
> extends Storage<Options> {
  constructor(opts: Options) {
    super(opts);
  }

  override register(consumer: OpConsumer): void {
    consumer.register(ListHistoryOp, this.list);
    consumer.register(GetHistoryOp, this.get);
    consumer.register(CreateHistoryOp, this.create);
    consumer.register(DeleteHistoryOp, this.delete);
    consumer.register(RollbackDocOp, this.rollbackDoc);

    consumer.subscribe(
      new SubscribeDocUpdateOp().toSubscribeOpMessage(),
      ({ docId }) => {
        (async () => {
          const snapshot = await consumer.call(
            new GetDocSnapshotOp({ docId }).toOpMessage()
          );
          await this.create(snapshot, consumer);
        })().catch(console.error);
      }
    );
  }

  abstract list: OpHandler<ListHistoryOp>;
  abstract get: OpHandler<GetHistoryOp>;
  abstract create: OpHandler<CreateHistoryOp>;
  abstract delete: OpHandler<DeleteHistoryOp>;

  rollbackDoc: OpHandler<RollbackDocOp> = async (
    { docId, timestamp, editor },
    consumer
  ) => {
    const toSnapshot = await this.get({ docId, timestamp }, consumer);
    if (!toSnapshot) {
      throw new Error('Can not find the version to rollback to.');
    }

    const fromSnapshot = await consumer.call(
      new GetDocOp({ docId }).toOpMessage()
    );

    if (!fromSnapshot) {
      throw new Error('Can not find the current version of the doc.');
    }

    const change = this.generateRevertUpdate(fromSnapshot.bin, toSnapshot.bin);
    await consumer.call(
      new PushDocUpdateOp({ docId, bin: change, editor }).toOpMessage()
    );
    // force create a new history record after rollback
    await this.create(fromSnapshot, consumer);
  };

  protected generateRevertUpdate(
    fromNewerBin: Uint8Array,
    toOlderBin: Uint8Array
  ): Uint8Array {
    const newerDoc = new Doc();
    applyUpdate(newerDoc, fromNewerBin);
    const olderDoc = new Doc();
    applyUpdate(olderDoc, toOlderBin);

    const newerState = encodeStateVector(newerDoc);
    const olderState = encodeStateVector(olderDoc);

    const diff = encodeStateAsUpdate(newerDoc, olderState);

    const undoManager = new UndoManager(Array.from(olderDoc.share.values()));

    applyUpdate(olderDoc, diff);

    undoManager.undo();

    return encodeStateAsUpdate(olderDoc, newerState);
  }
}
