import { diffUpdate, encodeStateVectorFromUpdate, mergeUpdates } from 'yjs';

import { Op, type OpConsumer, type OpHandler } from '../op';
import type { Lock } from './lock';
import { SingletonLocker } from './lock';
import {
  DeleteDocOp,
  GetDocDiffOp,
  GetDocOp,
  GetDocTimestamps,
  PushDocUpdateOp,
} from './ops';
import { Storage, type StorageOptions } from './storage';

export interface DocRecord {
  docId: string;
  bin: Uint8Array;
  timestamp: number;
  editor?: string;
}

export interface DocDiff {
  missing: Uint8Array;
  state: Uint8Array;
  timestamp: number;
}

export interface DocUpdate {
  docId: string;
  bin: Uint8Array;
  timestamp: number;
  editor?: string;
}

export interface Editor {
  name: string;
  avatarUrl: string | null;
}

export interface DocStorageOptions extends StorageOptions {
  mergeUpdates?: (updates: Uint8Array[]) => Promise<Uint8Array> | Uint8Array;
}

// internal op
export class GetDocSnapshotOp extends Op<{ docId: string }, DocRecord | null> {}

export abstract class DocStorage<
  Opts extends DocStorageOptions = DocStorageOptions,
> extends Storage<Opts> {
  private readonly locker = new SingletonLocker();

  abstract get name(): string;

  /**
   * Tell a binary is empty yjs binary or not.
   *
   * NOTE:
   *   `[0, 0]` is empty yjs update binary
   *   `[0]` is empty yjs state vector binary
   */
  isEmptyBin(bin: Uint8Array): boolean {
    return (
      bin.length === 0 ||
      // 0x0 for state vector
      (bin.length === 1 && bin[0] === 0) ||
      // 0x00 for update
      (bin.length === 2 && bin[0] === 0 && bin[1] === 0)
    );
  }

  // REGION: open apis by Op system
  /**
   * Get a doc record with latest binary.
   */
  getDoc: OpHandler<GetDocOp> = async ({ docId }, consumer) => {
    await using _lock = await this.lockDocForUpdate(docId);

    const snapshot = await this.getDocSnapshot({ docId }, consumer);
    const updates = await this.getDocUpdates(docId);

    if (updates.length) {
      const { timestamp, bin, editor } = await this.squash(
        snapshot ? [snapshot, ...updates] : updates
      );

      const newSnapshot = {
        spaceId: this.spaceId,
        docId,
        bin,
        timestamp,
        editor,
      };

      await this.setDocSnapshot(newSnapshot, snapshot);

      // always mark updates as merged unless throws
      await this.markUpdatesMerged(docId, updates);

      return newSnapshot;
    }

    return snapshot;
  };

  /**
   * Get a yjs binary diff with the given state vector.
   */
  getDocDiff: OpHandler<GetDocDiffOp> = async ({ docId, state }, ctx) => {
    const doc = await this.getDoc({ docId }, ctx);

    if (!doc) {
      return null;
    }

    return {
      missing: state ? diffUpdate(doc.bin, state) : doc.bin,
      state: encodeStateVectorFromUpdate(doc.bin),
      timestamp: doc.timestamp,
    };
  };

  /**
   * Push updates into storage
   */
  abstract pushDocUpdate: OpHandler<PushDocUpdateOp>;

  /**
   * Get all docs timestamps info. especially for useful in sync process.
   */
  abstract getDocTimestamps: OpHandler<GetDocTimestamps>;

  /**
   * Delete a specific doc data with all snapshots and updates
   */
  abstract deleteDoc: OpHandler<DeleteDocOp>;

  override register(consumer: OpConsumer): void {
    consumer.register(GetDocOp, this.getDoc);
    consumer.register(GetDocDiffOp, this.getDocDiff);
    consumer.register(PushDocUpdateOp, this.pushDocUpdate);
    consumer.register(GetDocTimestamps, this.getDocTimestamps);
    consumer.register(DeleteDocOp, this.deleteDoc);
    consumer.register(GetDocSnapshotOp, this.getDocSnapshot);
  }

  // ENDREGION

  // REGION: api for internal usage
  /**
   * Get a doc snapshot from storage
   */
  protected abstract getDocSnapshot: OpHandler<GetDocSnapshotOp>;
  /**
   * Set the doc snapshot into storage
   *
   * @safety
   * be careful when implementing this method.
   *
   * It might be called with outdated snapshot when running in multi-thread environment.
   *
   * A common solution is update the snapshot record is DB only when the coming one's timestamp is newer.
   *
   * @example
   * ```ts
   * await using _lock = await this.lockDocForUpdate(docId);
   * // set snapshot
   *
   * ```
   */
  protected abstract setDocSnapshot(
    snapshot: DocRecord,
    prevSnapshot: DocRecord | null
  ): Promise<boolean>;

  /**
   * Get all updates of a doc that haven't been merged into snapshot.
   *
   * Updates queue design exists for a performace concern:
   * A huge amount of write time will be saved if we don't merge updates into snapshot immediately.
   * Updates will be merged into snapshot when the latest doc is requested.
   */
  protected abstract getDocUpdates(docId: string): Promise<DocUpdate[]>;

  /**
   * Mark updates as merged into snapshot.
   */
  protected abstract markUpdatesMerged(
    docId: string,
    updates: DocUpdate[]
  ): Promise<number>;

  /**
   * Merge doc updates into a single update.
   */
  protected async squash(updates: DocUpdate[]): Promise<DocUpdate> {
    const merge = this.options?.mergeUpdates ?? mergeUpdates;
    const lastUpdate = updates.at(-1);
    if (!lastUpdate) {
      throw new Error('No updates to be squashed.');
    }

    // fast return
    if (updates.length === 1) {
      return lastUpdate;
    }

    const finalUpdate = await merge(updates.map(u => u.bin));

    return {
      docId: lastUpdate.docId,
      bin: finalUpdate,
      timestamp: lastUpdate.timestamp,
      editor: lastUpdate.editor,
    };
  }

  protected async lockDocForUpdate(docId: string): Promise<Lock> {
    return this.locker.lock(`workspace:${this.spaceId}:update`, docId);
  }
}
